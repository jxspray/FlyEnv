import assert from 'node:assert/strict'
import { mkdtemp, mkdir, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { scanPhpStudy, parseNginx } from '../plugins/phpstudy-import/fork/Scanner'
import {
  candidateBlockers,
  runImport,
  type ImportDependencies
} from '../plugins/phpstudy-import/fork/Runner'
import type { ImportProgress, ImportResult } from '../plugins/phpstudy-import/shared/types'
import {
  SiteImportController,
  type SiteImportPorts
} from '../plugins/phpstudy-import/render/Controller'
import {
  candidateWebServers,
  createDraft,
  draftProblems,
  filterDrafts,
  selectionOf,
  visibleSelection
} from '../plugins/phpstudy-import/render/Review'
import type { AppHost, SoftInstalled } from '../src/shared/app'
import { withHostMutationLock } from '../src/fork/module/Host/MutationLock'

const directory = await mkdtemp(join(tmpdir(), 'flyenv-site-import-test-'))
const root = join(directory, 'project with spaces').replaceAll('\\', '/')
const nginx = join(directory, 'Extensions/Nginx1/conf/vhosts')
const apache = join(directory, 'Extensions/Apache2/conf/vhosts')
await Promise.all([
  mkdir(root),
  mkdir(nginx, { recursive: true }),
  mkdir(apache, { recursive: true })
])
const rewrite = join(root, 'nginx.htaccess')
await writeFile(rewrite, 'try_files $uri $uri/ /index.php?$args;')
await writeFile(
  join(nginx, 'good.conf'),
  `# 测试带引号路径及伪静态
server { listen 8080; server_name sample.test alias.test; root "${root}";
location / { include "${rewrite}"; }
location ~ \\.php$ { fastcgi_pass 127.0.0.1:9002; include fastcgi_params; } }
server { listen 8443 ssl; server_name sample.test; root "${root}";
ssl_certificate "${root}/cert.crt"; ssl_certificate_key "${root}/cert.key"; }`
)
await Promise.all(['cert.crt', 'cert.key'].map((file) => writeFile(join(root, file), 'fixture')))
await writeFile(
  join(apache, 'good.conf'),
  `<VirtualHost *:8081>
ServerName sample.test
DocumentRoot "${root}"
FcgidWrapper "E:/phpstudy/Extensions/php/php8.2.9nts/php-cgi.exe" .php
</VirtualHost>`
)
await writeFile(join(nginx, 'broken.conf'), 'server { listen 80;')
const scan = await scanPhpStudy(directory)
assert.equal(scan.candidates.length, 1)
assert.equal(scan.warnings.length, 1, '坏文件不阻断有效站点')
const candidate = scan.candidates[0]
assert.deepEqual(candidate.blockers, [])
assert.deepEqual(candidate.webServers, ['nginx', 'apache'])
assert.equal(candidate.phpVersion, '8.2.9')
assert.equal(candidate.host.root, root)
assert.equal(candidate.host.alias, 'alias.test')
assert.equal(candidate.host.port.nginx, 8080)
assert.equal(candidate.host.port.apache, 8081)
assert.equal(candidate.host.port.nginx_ssl, 8443)
assert.equal(candidate.host.useSSL, true)
assert.match(candidate.host.nginx.rewrite, /location \/ \{[\s\S]*try_files/)
assert.throws(() => parseNginx('server { root /tmp;'), /未完整/)
assert.equal(parseNginx('server { root "C:/a # b"; }')[0].children?.[0].args[0], 'C:/a # b')

const php = {
  version: '8.2.9',
  num: 82,
  bin: 'test/php-cgi.exe',
  path: 'test',
  enable: true
} as SoftInstalled
const draft = createDraft(candidate, [php])
assert.ok(draft.versionKey)
assert.deepEqual(draftProblems(draft, [draft], [php], []), [])
assert.ok(draftProblems(draft, [draft], [], []).some((value) => value.includes('PHP')))
assert.ok(
  draftProblems(draft, [draft], [php], [candidate.host]).some((value) => value.includes('已在'))
)
const selection = selectionOf(draft, [php])
assert.equal(selection.confirmed, true, '导入按钮提交当前快照，无逐行确认门槛')

const apacheDraft = createDraft(
  {
    ...candidate,
    key: 'apache-only',
    phpVersion: '7.4.3',
    webServers: ['apache'],
    host: { ...candidate.host, name: 'apache.test', alias: '' }
  },
  [php]
)
const unknownDraft = createDraft(
  {
    ...candidate,
    key: 'unknown',
    phpVersion: '',
    webServers: ['nginx'],
    host: { ...candidate.host, name: 'unknown.test', alias: '' }
  },
  [php]
)
const blockedDraft = createDraft({ ...candidate, key: 'blocked', blockers: ['未识别项目根目录'] }, [
  php
])
const rows = [draft, apacheDraft, unknownDraft, blockedDraft]
assert.equal(
  filterDrafts(rows, { domain: '  ALIAS.TEST ', phpVersion: '', webServer: '' })[0],
  draft
)
assert.deepEqual(
  filterDrafts(rows, { domain: 'apache', phpVersion: '7.4.3', webServer: 'apache' }),
  [apacheDraft]
)
assert.deepEqual(filterDrafts(rows, { domain: '', phpVersion: '未识别', webServer: 'nginx' }), [
  unknownDraft
])
assert.equal(filterDrafts(rows, { domain: 'apache', phpVersion: '', webServer: 'nginx' }).length, 0)
assert.ok(
  filterDrafts(rows, { domain: 'sample', phpVersion: '', webServer: 'nginx' }).includes(draft)
)
assert.ok(
  filterDrafts(rows, { domain: 'sample', phpVersion: '', webServer: 'apache' }).includes(draft)
)
const legacy = { ...candidate, webServers: undefined }
assert.deepEqual(candidateWebServers(legacy), ['nginx', 'apache'])
assert.deepEqual(
  candidateWebServers({
    ...legacy,
    sources: ['E:\\phpstudy_pro\\Extensions\\Apache2.4\\conf\\vhosts\\a.conf']
  }),
  ['apache']
)
assert.equal(visibleSelection([]).checked, false)
assert.equal(visibleSelection([blockedDraft]).eligible.length, 0)
assert.equal(visibleSelection(rows).checked, true)
apacheDraft.selected = false
assert.equal(visibleSelection(rows).indeterminate, true)
blockedDraft.selected = true
assert.equal(visibleSelection([blockedDraft]).checked, true)
assert.equal(visibleSelection([blockedDraft]).disabled, false, '配置变为阻断后，已有选择仍可取消')
blockedDraft.selected = false
assert.equal(visibleSelection(rows).checked, false)
const visible = filterDrafts(rows, { domain: 'apache', phpVersion: '', webServer: '' })
visibleSelection(visible).eligible.forEach((row) => {
  row.selected = true
})
assert.equal(visibleSelection(rows).checked, true)
visibleSelection(visible).eligible.forEach((row) => {
  row.selected = false
})
assert.equal(draft.selected, true, '筛选范围内取消不影响隐藏选择')
assert.equal(visibleSelection(visible).indeterminate, false)
assert.equal(visibleSelection(rows).indeterminate, true)
let hosts: AppHost[] = []
let ids = 100
let backups = 0
const cleanup: number[] = []
const events: ImportProgress[] = []
const dependencies: ImportDependencies = {
  scan: async () => scan,
  versions: async () => [php],
  backup: async () => {
    backups++
    return 'backup'
  },
  list: async () => hosts,
  add: async (host) => {
    hosts.push(host)
    return true
  },
  cleanup: async (host) => {
    cleanup.push(host.id)
  },
  validate: async () => {},
  id: () => ++ids
}
const imported = await runImport([selection], dependencies, (value) => events.push(value))
assert.equal(imported.outcomes[0].status, 'success')
assert.equal(imported.completed, 1)
assert.equal(hosts[0].phpVersionFull, '8.2.9')
assert.equal(events[0].completed, 0)
assert.equal(events[1].completed, 1)
const duplicate = await runImport([selection], dependencies, () => {})
assert.equal(duplicate.outcomes[0].status, 'skipped')
assert.equal(hosts.length, 1)
assert.equal(backups, 2)
await assert.rejects(
  runImport([selection, selection], dependencies, () => {}),
  /重复/
)
const missingPhp = await runImport(
  [selection],
  { ...dependencies, versions: async () => [] },
  () => {}
)
assert.equal(missingPhp.outcomes[0].status, 'failed')
assert.match(missingPhp.outcomes[0].message, /PHP/)
await assert.rejects(
  runImport(
    [selection],
    {
      ...dependencies,
      backup: async () => {
        throw new Error('备份失败')
      }
    },
    () => {}
  ),
  /备份失败/
)
assert.equal(hosts.length, 1)
await writeFile(rewrite, '# 配置已变化')
const changed = await scanPhpStudy(directory)
assert.notEqual(changed.candidates[0].fingerprint, candidate.fingerprint)
const stale = await runImport([selection], { ...dependencies, scan: async () => changed }, () => {})
assert.match(stale.outcomes[0].message, /已变化/)

const secondCandidate = {
  ...candidate,
  key: 'second',
  host: { ...candidate.host, name: 'second.test', alias: '' }
}
const secondSelection = { ...selection, key: secondCandidate.key, host: secondCandidate.host }
hosts = []
const partial = await runImport(
  [selection, secondSelection],
  {
    ...dependencies,
    scan: async () => ({ ...scan, candidates: [candidate, secondCandidate] }),
    add: async (host) => {
      if (host.name === selection.host.name) throw new Error('模拟配置写入失败')
      hosts.push(host)
      return true
    }
  },
  () => {}
)
assert.deepEqual(
  partial.outcomes.map((item) => item.status),
  ['failed', 'success']
)
assert.ok(cleanup.length)
assert.equal(hosts.length, 1)
assert.deepEqual(
  candidateBlockers(
    { ...candidate.host, root: 'corrected' },
    { ...candidate, blockers: ['项目根目录不存在或无法读取'] }
  ),
  []
)
await assert.rejects(
  runImport(
    [selection, { ...secondSelection, php: { ...selection.php, version: '8.2.20' } }],
    dependencies,
    () => {}
  ),
  /相同的完整版本/
)
hosts = []
const committedError = await runImport(
  [selection],
  {
    ...dependencies,
    add: async (host) => {
      hosts.push(host)
      throw new Error('保存后附加异常')
    }
  },
  () => {}
)
assert.equal(committedError.outcomes[0].status, 'success')
const unknown = await runImport(
  [selection],
  {
    ...dependencies,
    list: async () => [],
    add: async () => {
      throw new Error('写入失败')
    },
    cleanup: async () => {
      throw new Error('清理失败')
    }
  },
  () => {}
)
assert.equal(unknown.outcomes[0].status, 'unknown')

// 控制器重入、页面重入、快照隔离和附加失败保留成功结果。
let finish!: (result: ImportResult) => void
let notifyProgress!: (result: ImportProgress) => void
let calls = 0
let snapshotName = ''
const ports: SiteImportPorts = {
  scan: async () => scan,
  ready: async () => true,
  versions: async () => [php],
  loadDirectory: async () => directory,
  saveDirectory: async () => {
    throw new Error('模拟偏好保存失败')
  },
  refreshHosts: async () => {},
  syncHosts: async () => {
    throw new Error('模拟 hosts 权限失败')
  },
  notifyError: () => {},
  importSites: async (_directory, snapshot, progress) => {
    calls++
    snapshotName = snapshot[0].host.name
    notifyProgress = progress
    return new Promise((resolve) => {
      finish = resolve
    })
  }
}
const controller = new SiteImportController(ports)
await controller.prepare()
assert.equal(await controller.scan(directory), true)
assert.ok(controller.warnings.includes('来源目录偏好保存失败'))
const selectedCopy = JSON.parse(JSON.stringify(selection))
const operation = controller.start([selectedCopy])
await new Promise((resolve) => setTimeout(resolve, 0))
selectedCopy.host.name = 'changed-after-submit.test'
assert.equal(snapshotName, selection.host.name)
assert.equal(await controller.start([selection]), false)
assert.equal(await controller.scan(directory), false)
await controller.prepare()
assert.equal(controller.phase, 'importing')
notifyProgress({ completed: 0, total: 1, current: 'working.test', outcomes: [] })
assert.equal(controller.running, true)
assert.equal(controller.progress.current, 'working.test')
finish(imported)
assert.equal(await operation, true)
assert.equal(controller.phase, 'finished')
assert.equal(controller.result?.outcomes[0].status, 'success')
assert.match(controller.result?.warnings[0] ?? '', /hosts 同步失败/)
assert.equal(calls, 1)
await controller.prepare()
assert.equal(controller.result?.outcomes[0].status, 'success')
const failed = new SiteImportController({
  ...ports,
  importSites: async () => {
    throw new Error('导入失败')
  }
})
await failed.prepare()
await failed.scan(directory)
assert.equal(await failed.start([selection]), false)
assert.equal(failed.running, false)
assert.equal(failed.error, '导入失败')
assert.equal(failed.progress.outcomes[0].status, 'unknown')

// 同一事务重入与兄弟事务串行执行。
global.Server = { BaseDir: directory } as typeof global.Server
const sequence: string[] = []
await Promise.all([
  withHostMutationLock(async () => {
    sequence.push('first')
    await withHostMutationLock(async () => {
      sequence.push('nested')
    })
    await new Promise((resolve) => setTimeout(resolve, 20))
    sequence.push('first-end')
  }),
  withHostMutationLock(async () => {
    sequence.push('second')
  })
])
assert.equal(sequence.indexOf('nested'), sequence.indexOf('first') + 1)
assert.equal(sequence.indexOf('first-end'), sequence.indexOf('first') + 2)
assert.ok([0, 3].includes(sequence.indexOf('second')), '并发申请先后顺序可变，但事务不能交错')
await assert.rejects(
  withHostMutationLock(async () => {
    throw new Error('模拟异常')
  }),
  /模拟异常/
)
await withHostMutationLock(async () =>
  assert.equal(await readFile(rewrite, 'utf8'), '# 配置已变化')
)
console.log('站点导入解析、批量失败边界、版本核对、控制器生命周期及站点写入锁测试通过')
