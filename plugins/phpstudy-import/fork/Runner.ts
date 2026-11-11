import type { AppHost, SoftInstalled } from '@shared/app'
import type {
  ImportCandidate,
  ImportProgress,
  ImportResult,
  ImportSelection,
  ScanResult
} from '../shared/types'

export type ImportDependencies = {
  scan: () => Promise<ScanResult>
  versions: () => Promise<SoftInstalled[]>
  backup: () => Promise<string>
  list: () => Promise<AppHost[]>
  add: (host: AppHost) => PromiseLike<boolean>
  cleanup: (host: AppHost) => Promise<void>
  id: () => number
  validate: (host: AppHost, php: ImportSelection['php']) => Promise<void>
}

type SiteNames = Pick<AppHost, 'name' | 'alias'>

const domains = (host: SiteNames) =>
  [host.name, ...host.alias.split(/\s+/)].filter(Boolean).map((name) => name.toLowerCase())

export function duplicateSite(host: SiteNames, list: SiteNames[]): boolean {
  const names = new Set(domains(host))
  return list.some((other) => domains(other).some((name) => names.has(name)))
}

/** 目录和证书路径可在核对页修正，执行时仍须验证新路径真实可用。 */
export function candidateBlockers(host: AppHost, candidate: ImportCandidate): string[] {
  return candidate.blockers.filter((message) => {
    if (message === '项目根目录不存在或无法读取' && host.root !== candidate.host.root) return false
    if (/^SSL (证书|私钥)路径不可用$/.test(message)) {
      const key = message.includes('证书') ? 'cert' : 'key'
      return host.useSSL && host.ssl[key] === candidate.host.ssl[key]
    }
    return true
  })
}

export function validateSelection(
  selection: ImportSelection,
  candidate: ImportCandidate,
  versions: SoftInstalled[]
): void {
  if (!selection.confirmed) throw new Error('站点配置与 PHP 版本尚未确认')
  if (selection.fingerprint !== candidate.fingerprint)
    throw new Error('来源配置已变化，请重新扫描并核对')
  const blockers = candidateBlockers(selection.host, candidate)
  if (blockers.length) throw new Error(blockers.join('；'))
  const php = versions.find(
    (version) =>
      version.enable !== false &&
      version.bin === selection.php.bin &&
      version.path === selection.php.path &&
      version.version === selection.php.version &&
      version.num === selection.php.num
  )
  if (!php?.num || !php.version) throw new Error('选中的 PHP 版本当前不可用，请安装或重新选择')
}

/** 独立站点逐项执行，终态始终保留已完成结果。 */
export async function runImport(
  selections: ImportSelection[],
  dependencies: ImportDependencies,
  progress: (value: ImportProgress) => void
): Promise<ImportResult> {
  if (!selections.length) throw new Error('请至少选择一个站点')
  if (new Set(selections.map((item) => item.key)).size !== selections.length)
    throw new Error('导入请求中存在重复站点')
  const mappedVersions = new Map<number, string>()
  for (const selection of selections) {
    const previous = mappedVersions.get(selection.php.num)
    if (previous && previous !== selection.php.version)
      throw new Error('同一 PHP 主次版本共用运行服务，请选择相同的完整版本')
    mappedVersions.set(selection.php.num, selection.php.version)
  }
  const scan = await dependencies.scan()
  const candidates = new Map(scan.candidates.map((item) => [item.key, item]))
  const versions = await dependencies.versions()
  await dependencies.list()
  const result: ImportResult = {
    completed: 0,
    total: selections.length,
    current: '',
    outcomes: [],
    backup: await dependencies.backup(),
    warnings: []
  }
  for (const selection of selections) {
    result.current = selection.host.name
    progress(JSON.parse(JSON.stringify(result)))
    let host: AppHost | undefined
    try {
      const candidate = candidates.get(selection.key)
      if (!candidate) throw new Error('来源站点已不存在，请重新扫描')
      validateSelection(selection, candidate, versions)
      host = JSON.parse(JSON.stringify(selection.host)) as AppHost
      Object.assign(host, {
        id: dependencies.id(),
        type: 'php',
        envFile: '',
        autoSSL: false,
        phpVersion: selection.php.num,
        phpVersionFull: selection.php.version
      })
      await dependencies.validate(host, selection.php)
      if (duplicateSite(host, await dependencies.list())) {
        result.outcomes.push({
          key: selection.key,
          name: host.name,
          status: 'skipped',
          message: '域名或别名已存在，已跳过'
        })
      } else {
        const added = await dependencies.add(host)
        result.outcomes.push({
          key: selection.key,
          name: host.name,
          status: added ? 'success' : 'skipped',
          message: added ? '站点配置已保存' : '域名或别名已存在，已跳过'
        })
      }
    } catch (error) {
      let status: 'failed' | 'success' | 'unknown' = 'failed'
      let message = error instanceof Error ? error.message : String(error)
      if (host) {
        try {
          const committed = (await dependencies.list()).some((item) => item.id === host!.id)
          if (committed) {
            status = 'success'
            message = `站点已保存，附加处理异常，${message}`
          } else await dependencies.cleanup(host)
        } catch (cleanupError) {
          status = 'unknown'
          message += `；回读或清理失败，请检查后再操作，${String(cleanupError)}`
        }
      }
      result.outcomes.push({ key: selection.key, name: selection.host.name, status, message })
    }
    result.completed++
    progress(JSON.parse(JSON.stringify(result)))
  }
  result.current = ''
  return result
}
