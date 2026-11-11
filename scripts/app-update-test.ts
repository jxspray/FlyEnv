import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'
import { createHash } from 'node:crypto'
import { mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import YAML from 'yamljs'
import UpdateManager, { type UpdateEngine } from '../src/main/core/UpdateManager'
import { UpdateController, type UpdatePorts } from '../src/render/components/About/UpdateController'
import { normalizeUpdateSource, type AppUpdateState } from '../src/shared/AppUpdate'
import { writeUpdateManifest } from './update-manifest'

assert.equal(normalizeUpdateSource(''), '')
assert.equal(
  normalizeUpdateSource('http://127.0.0.1:9088/updates'),
  'http://127.0.0.1:9088/updates/'
)
for (const value of [
  'file:///tmp',
  'https://user:password@example.test',
  'https://example.test/latest.yml',
  'https://example.test/?key=value'
])
  assert.throws(() => normalizeUpdateSource(value))

let checks = 0
let installed = 0
let stopped = 0
const engine = new EventEmitter() as EventEmitter & UpdateEngine
engine.setFeedURL = () => {}
engine.checkForUpdates = async () => {
  checks++
  engine.emit('update-available', { version: '4.20.4', releaseNotes: [{ note: '新增功能' }] })
  return {} as any
}
engine.downloadUpdate = async () => {
  engine.emit('download-progress', { percent: 35, transferred: 35, total: 100 })
  engine.emit('update-downloaded', { version: '4.20.4' })
  return ['installer.exe']
}
engine.quitAndInstall = () => {
  assert.equal(stopped, 1)
  installed++
}
const manager = new UpdateManager(engine, '4.20.3', async () => {
  stopped++
})
assert.equal(engine.autoDownload, false)
assert.equal(engine.autoInstallOnAppQuit, false)
await assert.rejects(manager.run('check', ''), /配置更新目录/)
assert.equal(checks, 0)
await manager.run('check', 'http://127.0.0.1:9088')
assert.equal(manager.snapshot().phase, 'available')
assert.equal(manager.snapshot().releaseNotes, '新增功能')
const phases: string[] = []
manager.on('state', (state: AppUpdateState) => phases.push(state.phase))
await manager.run('download')
assert.equal(manager.snapshot().phase, 'downloaded')
assert.ok(phases.includes('downloading'))
await manager.run('install')
assert.equal(installed, 1)
await manager.run('reset')
await assert.rejects(manager.run('install'), /下载并校验/)

await manager.run('check', 'http://127.0.0.1:9088')
let finish!: () => void
engine.downloadUpdate = () =>
  new Promise((resolve) => {
    finish = () => {
      engine.emit('update-downloaded', { version: '4.20.4' })
      resolve(['installer.exe'])
    }
  })
const downloading = manager.run('download')
await assert.rejects(manager.run('check', 'http://127.0.0.1:9088'), /正在进行/)
assert.equal(manager.snapshot().phase, 'downloading')
finish()
await downloading
const blocked = new UpdateManager(engine, '4.20.3', async () => {
  throw new Error('服务停止失败')
})
await blocked.run('check', 'http://127.0.0.1:9088')
engine.downloadUpdate = async () => {
  engine.emit('update-downloaded', { version: '4.20.4' })
  return ['installer.exe']
}
await blocked.run('download')
await assert.rejects(blocked.run('install'), /服务停止失败/)
assert.equal(installed, 1)
assert.equal(blocked.snapshot().phase, 'downloaded', '停止失败保留已下载结果以便处理后重试')
engine.downloadUpdate = async () => {
  throw new Error('哈希校验失败')
}
await blocked.run('check', 'http://127.0.0.1:9088')
await assert.rejects(blocked.run('download'), /哈希校验失败/)
await assert.rejects(blocked.run('install'), /下载并校验/)

let requests = 0
let source = ''
const ports: UpdatePorts = {
  loadSource: async () => source,
  saveSource: async (value) => {
    source = value
  },
  request: async (action, _source, onState) => {
    requests++
    const state = await manager.run(action, _source)
    onState(state)
    return state
  },
  notice: () => {},
  error: () => {}
}
const controller = new UpdateController(ports)
assert.equal(await controller.check(true), false)
assert.equal(requests, 0)
assert.equal(await controller.check(), false)
assert.equal(requests, 0)
assert.equal(await controller.saveSource('http://127.0.0.1:9088/updates'), true)
assert.equal(source, 'http://127.0.0.1:9088/updates/')
assert.equal(await controller.check(), true)
assert.equal(controller.state?.phase, 'available')
await controller.initialize()
assert.equal(controller.state?.phase, 'available')
const persisted = new UpdateController({
  ...ports,
  saveSource: async () => {
    throw new Error('存储失败')
  }
})
await persisted.initialize()
assert.equal(await persisted.saveSource('https://new.example.test/'), false)
assert.equal(persisted.source, source)

const directory = await mkdtemp(join(tmpdir(), 'flyenv-update-test-'))
const installer = join(directory, 'FlyEnv-Local-Setup-4.20.3.exe')
await writeFile(installer, '安装包测试数据')
await writeFile(`${installer}.blockmap`, 'blockmap')
const metadata = YAML.parse(await readFile(await writeUpdateManifest(installer, '4.20.3'), 'utf8'))
assert.equal(metadata.version, '4.20.3')
assert.equal(metadata.files[0].url, 'FlyEnv-Local-Setup-4.20.3.exe')
assert.equal(
  metadata.sha512,
  createHash('sha512')
    .update(await readFile(installer))
    .digest('base64')
)
assert.equal(metadata.files[0].sha512, metadata.sha512)
console.log('私有更新源、进度终态、重入、安装前停止、错误隔离和更新元数据测试通过')
