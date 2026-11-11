import { createHash } from 'node:crypto'
import { readdir, readFile, stat } from 'node:fs/promises'
import { basename, dirname, isAbsolute, join, resolve } from 'node:path'
import type { AppHost } from '@shared/app'
import type { ImportCandidate, ScanResult } from '../shared/types'

type Directive = { name: string; args: string[]; children?: Directive[] }
type SourceSite = ImportCandidate & {
  kind: 'nginx' | 'apache'
  sourcePorts: Partial<AppHost['port']>
}

const digest = (text: string) => createHash('sha256').update(text).digest('hex')
const normalized = (path: string) => path.replace(/\\/g, '/').replace(/\/$/, '').toLowerCase()
const unquote = (text: string) => text.trim().replace(/^["']|["']$/g, '')
const versionIn = (text: string) => text.match(/php[/-]?(\d+\.\d+(?:\.\d+)?)/i)?.[1] ?? ''
const portIn = (text: string) => Number(text.match(/(?:^|:)(\d+)$/)?.[1])

/** 保留引号中的空格、注释符及 Windows 路径，按大括号解析 Nginx 块。 */
export function parseNginx(text: string): Directive[] {
  const tokens = text.match(/"(?:\\.|[^"\\])*"|'[^']*'|#[^\r\n]*|[{};]|[^\s{};"'#]+/g) ?? []
  let offset = 0
  const block = (nested: boolean): Directive[] => {
    const result: Directive[] = []
    let words: string[] = []
    while (offset < tokens.length) {
      const token = tokens[offset++]
      if (token.startsWith('#')) continue
      if (token === '}') {
        if (!nested || words.length) throw new Error('Nginx 配置大括号不匹配')
        return result
      }
      if (token === ';' || token === '{') {
        if (!words.length) throw new Error('Nginx 指令缺少名称')
        const [name, ...args] = words
        words = []
        result.push({ name, args, ...(token === '{' ? { children: block(true) } : {}) })
      } else words.push(unquote(token))
    }
    if (nested || words.length) throw new Error('Nginx 配置未完整结束')
    return result
  }
  return block(false)
}

function emptyHost(): AppHost {
  return {
    id: 0,
    type: 'php',
    envFile: '',
    name: '',
    alias: '',
    root: '',
    url: '',
    useSSL: false,
    autoSSL: false,
    ssl: { cert: '', key: '' },
    port: { nginx: 80, apache: 80, caddy: 80, nginx_ssl: 443, apache_ssl: 443, caddy_ssl: 443 },
    nginx: { rewrite: '' }
  }
}

function candidate(file: string, content: string, kind: SourceSite['kind']): SourceSite {
  return {
    key: '',
    fingerprint: digest(content),
    sources: [file],
    webServers: [kind],
    phpVersion: '',
    phpEndpoint: '',
    kind,
    sourcePorts: {},
    host: emptyHost(),
    warnings: [],
    blockers: []
  }
}

const values = (nodes: Directive[], name: string) => nodes.filter((node) => node.name === name)
const first = (nodes: Directive[], name: string) => values(nodes, name)[0]?.args[0] ?? ''
const walk = (nodes: Directive[]): Directive[] =>
  nodes.flatMap((node) => [node, ...walk(node.children ?? [])])
const sourcePath = (value: string, base: string) =>
  isAbsolute(value) ? value : resolve(base, value)

async function readNginx(file: string, content: string): Promise<SourceSite[]> {
  const result: SourceSite[] = []
  for (const server of values(parseNginx(content), 'server')) {
    const item = candidate(file, content, 'nginx')
    const nodes = server.children ?? []
    const all = walk(nodes)
    const names = values(nodes, 'server_name').flatMap((node) => node.args)
    item.host.name = names[0] ?? ''
    item.host.alias = names.slice(1).join('\n')
    const serviceRoot = dirname(dirname(dirname(file)))
    item.host.root = sourcePath(first(nodes, 'root') || '.', serviceRoot)
    if (!first(nodes, 'root')) item.blockers.push('未识别项目根目录')
    const ports = { http: new Set<number>(), ssl: new Set<number>() }
    for (const listen of values(nodes, 'listen')) {
      const ssl = listen.args.includes('ssl')
      ports[ssl ? 'ssl' : 'http'].add(portIn(listen.args[0]))
      if (ssl) item.host.useSSL = true
    }
    for (const [kind, list] of Object.entries(ports)) {
      if (list.size > 1) item.blockers.push(`存在多个 ${kind.toUpperCase()} 端口，需先整理来源配置`)
      if ([...list].some((port) => !Number.isInteger(port) || port < 1 || port > 65535)) {
        item.blockers.push('无法识别监听端口')
      }
    }
    item.host.port.nginx = [...ports.http][0] || 80
    item.host.port.nginx_ssl = [...ports.ssl][0] || 443
    if (ports.http.size) item.sourcePorts.nginx = item.host.port.nginx
    if (ports.ssl.size) item.sourcePorts.nginx_ssl = item.host.port.nginx_ssl
    item.host.port.apache = item.host.port.caddy = item.host.port.nginx
    item.host.port.apache_ssl = item.host.port.caddy_ssl = item.host.port.nginx_ssl
    item.host.ssl.cert = first(nodes, 'ssl_certificate')
    item.host.ssl.key = first(nodes, 'ssl_certificate_key')
    for (const key of ['cert', 'key'] as const) {
      if (item.host.ssl[key]) item.host.ssl[key] = sourcePath(item.host.ssl[key], serviceRoot)
    }
    item.phpEndpoint = first(all, 'fastcgi_pass')
    item.phpVersion = versionIn(
      values(all, 'include')
        .map((node) => node.args.join(' '))
        .join('\n')
    )
    if (values(all, 'proxy_pass').length) item.blockers.push('含反向代理规则，需先手工迁移代理配置')
    const endpoints = new Set(values(all, 'fastcgi_pass').map((node) => node.args[0]))
    if (endpoints.size > 1) item.blockers.push('同一站点包含多个 PHP 上游')
    const locations = values(nodes, 'location')
    const rewrite: string[] = []
    // phpStudy 把伪静态放在 location / 的 nginx.htaccess 中，保持相同上下文。
    for (const node of all.filter((node) => node.name === 'include')) {
      const include = node.args[0] ?? ''
      if (/^(?:fastcgi_params|enable-php[^/\\]*)$/.test(include)) continue
      if (!/nginx\.htaccess$|rewrite[^/\\]*\.conf$/i.test(include)) {
        item.blockers.push(`包含尚不支持的配置引用 ${include}`)
        continue
      }
      try {
        const path = sourcePath(include, serviceRoot)
        const rules = await readFile(path, 'utf8')
        item.fingerprint = digest(item.fingerprint + path + rules)
        item.sources.push(path)
        const location = locations.find((entry) => entry.children?.includes(node))
        if (rules.trim())
          rewrite.push(location ? `location ${location.args.join(' ')} {\n${rules}\n}` : rules)
      } catch {
        item.blockers.push(`无法读取伪静态文件 ${include}`)
      }
    }
    for (const node of nodes) {
      if (['rewrite', 'if'].includes(node.name))
        item.blockers.push('含内联重写规则，请先移至 nginx.htaccess')
    }
    if (all.some((node) => ['rewrite', 'try_files'].includes(node.name))) {
      item.blockers.push('含内联伪静态规则，请先移至 nginx.htaccess')
    }
    item.host.nginx.rewrite = rewrite.join('\n')
    item.warnings.push(
      '使用 FlyEnv 标准站点模板，来源自定义指令需核对；Apache .htaccess 继续引用项目文件'
    )
    result.push(item)
  }
  return result
}

function readApache(file: string, content: string): SourceSite[] {
  const result: SourceSite[] = []
  for (const match of content.matchAll(/<VirtualHost\s+([^>]+)>([\s\S]*?)<\/VirtualHost>/gi)) {
    const item = candidate(file, content, 'apache')
    const body = match[2].replace(/^\s*#.*$/gm, '')
    const field = (name: string) =>
      unquote(body.match(new RegExp(`^\\s*${name}\\s+(.+)$`, 'im'))?.[1] ?? '')
    item.host.name = field('ServerName').replace(/:\d+$/, '')
    item.host.alias = field('ServerAlias').split(/\s+/).filter(Boolean).join('\n')
    const serviceRoot = dirname(dirname(dirname(file)))
    item.host.root = sourcePath(field('DocumentRoot') || '.', serviceRoot)
    if (!field('DocumentRoot')) item.blockers.push('未识别项目根目录')
    item.phpVersion = versionIn(field('FcgidWrapper') || field('FcgidInitialEnv'))
    item.host.useSSL = /^on$/i.test(field('SSLEngine'))
    const port = portIn(match[1].trim().split(/\s+/)[0])
    if (!port) item.blockers.push('无法识别 Apache 监听端口')
    if (item.host.useSSL) item.host.port.apache_ssl = item.sourcePorts.apache_ssl = port
    else item.host.port.apache = item.sourcePorts.apache = port
    item.host.ssl = { cert: field('SSLCertificateFile'), key: field('SSLCertificateKeyFile') }
    for (const key of ['cert', 'key'] as const) {
      if (item.host.ssl[key]) item.host.ssl[key] = sourcePath(item.host.ssl[key], serviceRoot)
    }
    if (/^\s*(?:ProxyPass|RewriteRule|Include)\s/im.test(body))
      item.blockers.push('含 Apache 自定义代理、重写或引用，需先手工核对')
    result.push(item)
  }
  return result
}

/** 只扫描 Extensions 下的服务 vhost，逐文件隔离解析错误。 */
export async function scanPhpStudy(directory: string): Promise<ScanResult> {
  const root = resolve(directory.trim())
  const extensions = join(root, 'Extensions')
  const services = await readdir(extensions, { withFileTypes: true })
  const sites: SourceSite[] = []
  const warnings: string[] = []
  for (const service of services.filter(
    (entry) => entry.isDirectory() && /^(nginx|apache)/i.test(entry.name)
  )) {
    const kind = /^nginx/i.test(service.name) ? 'nginx' : 'apache'
    const dir = join(extensions, service.name, 'conf', 'vhosts')
    let files: string[]
    try {
      files = await readdir(dir)
    } catch {
      warnings.push(`无法读取站点目录 ${dir}`)
      continue
    }
    for (const file of files.filter((file) => /\.conf$/i.test(file)).sort()) {
      const path = join(dir, file)
      try {
        const content = await readFile(path, 'utf8')
        const parsed = kind === 'nginx' ? await readNginx(path, content) : readApache(path, content)
        sites.push(...parsed)
        if (!parsed.length && content.trim()) warnings.push(`${path} 未发现可识别站点`)
      } catch (error) {
        warnings.push(`${path} 扫描失败，${String(error)}`)
      }
    }
  }
  // Apache 默认主机可能没有 ServerName，仅在根目录唯一对应时补充名称。
  for (const item of sites.filter((item) => !item.host.name)) {
    const peers = sites.filter(
      (other) =>
        other.kind !== item.kind && normalized(other.host.root) === normalized(item.host.root)
    )
    const names = new Set(peers.map((other) => other.host.name).filter(Boolean))
    if (names.size === 1) item.host.name = [...names][0]
    else item.blockers.push('未识别站点域名')
  }
  const merged = new Map<string, SourceSite>()
  for (const item of sites.sort((a, b) => (a.kind === b.kind ? 0 : a.kind === 'nginx' ? -1 : 1))) {
    const key = digest(item.host.name.toLowerCase() + '\n' + normalized(item.host.root))
    const previous = merged.get(key)
    item.key = key
    if (!previous) {
      merged.set(key, item)
      continue
    }
    previous.fingerprint = digest(previous.fingerprint + item.fingerprint)
    previous.sources.push(...item.sources)
    previous.webServers = [...new Set([...(previous.webServers ?? []), ...(item.webServers ?? [])])]
    previous.warnings.push(...item.warnings)
    previous.blockers.push(...item.blockers)
    if (previous.phpVersion && item.phpVersion && previous.phpVersion !== item.phpVersion)
      previous.blockers.push('来源配置的 PHP 版本不一致')
    previous.phpVersion ||= item.phpVersion
    previous.phpEndpoint ||= item.phpEndpoint
    for (const portName of Object.keys(item.sourcePorts) as (keyof AppHost['port'])[]) {
      const port = item.sourcePorts[portName]!
      if (previous.sourcePorts[portName] && previous.sourcePorts[portName] !== port) {
        previous.blockers.push(`来源 ${portName} 端口配置不一致`)
      }
      previous.sourcePorts[portName] = previous.host.port[portName] = port
    }
    if (previous.phpEndpoint && item.phpEndpoint && previous.phpEndpoint !== item.phpEndpoint)
      previous.blockers.push('来源 PHP 上游配置不一致')
    const aliases = new Set(
      [...previous.host.alias.split(/\s+/), ...item.host.alias.split(/\s+/)].filter(Boolean)
    )
    previous.host.alias = [...aliases].join('\n')
    if (item.host.useSSL) {
      if (
        previous.host.useSSL &&
        JSON.stringify(previous.host.ssl) !== JSON.stringify(item.host.ssl)
      )
        previous.blockers.push('来源 SSL 证书配置不一致')
      else {
        previous.host.useSSL = true
        previous.host.ssl = item.host.ssl
      }
    }
  }
  // 通过同一站点的 Apache FcgidWrapper 推导 Nginx PHP 端口。冲突映射保持待确认。
  const endpoints = new Map<string, Set<string>>()
  for (const item of merged.values()) {
    item.host.port.nginx = item.sourcePorts.nginx ?? item.sourcePorts.apache ?? 80
    item.host.port.apache = item.sourcePorts.apache ?? item.host.port.nginx
    item.host.port.caddy = item.host.port.nginx
    item.host.port.nginx_ssl = item.sourcePorts.nginx_ssl ?? item.sourcePorts.apache_ssl ?? 443
    item.host.port.apache_ssl = item.sourcePorts.apache_ssl ?? item.host.port.nginx_ssl
    item.host.port.caddy_ssl = item.host.port.nginx_ssl
    if (item.phpEndpoint && item.phpVersion) {
      const versions = endpoints.get(item.phpEndpoint) ?? new Set<string>()
      versions.add(item.phpVersion)
      endpoints.set(item.phpEndpoint, versions)
    }
  }
  for (const item of merged.values()) {
    const versions = endpoints.get(item.phpEndpoint)
    if (!item.phpVersion && versions?.size === 1) item.phpVersion = [...versions][0]
    if (versions && versions.size > 1) item.blockers.push('PHP 上游端口映射存在冲突')
    if (!item.phpVersion) item.warnings.push('无法识别来源 PHP 版本，请手动选择目标版本')
    try {
      if (!(await stat(item.host.root)).isDirectory()) throw new Error()
    } catch {
      item.blockers.push('项目根目录不存在或无法读取')
    }
    if (item.host.useSSL) {
      for (const key of ['cert', 'key'] as const) {
        try {
          if (!(await stat(item.host.ssl[key])).isFile()) throw new Error()
        } catch {
          item.blockers.push(`SSL ${key === 'cert' ? '证书' : '私钥'}路径不可用`)
        }
      }
    }
    item.sources = [...new Set(item.sources)]
    item.warnings = [...new Set(item.warnings)]
    item.blockers = [...new Set(item.blockers)]
    delete (item as Partial<SourceSite>).kind
    delete (item as Partial<SourceSite>).sourcePorts
  }
  if (!sites.length) warnings.push(`在 ${basename(root)} 中未扫描到站点，请检查 phpStudy 安装目录`)
  return { directory: root, candidates: [...merged.values()], warnings }
}
