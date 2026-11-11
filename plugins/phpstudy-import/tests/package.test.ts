import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { createReadStream } from 'node:fs'
import { mkdtemp, mkdir, readFile, writeFile } from 'node:fs/promises'
import { resolve, join, dirname } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import PluginManager from '../../../src/main/plugins/PluginManager'
import PluginLoader from '../../../src/fork/PluginLoader'
import * as Vue from 'vue'
import * as ElementPlus from 'element-plus'

const project = resolve(dirname(fileURLToPath(import.meta.url)), '../../..')
const release = join(project, 'release/plugins/phpstudy-import')
const registry = JSON.parse(await readFile(join(release, 'registry.json'), 'utf8'))
const archiveName = new URL(registry.plugins[0].artifact.url).pathname.split('/').pop()!
const root = await mkdtemp(join(project, 'tmp/phpstudy-plugin-install-'))
const base = join(root, 'server')
await mkdir(base)
global.Server = {
  BaseDir: base,
  AppDir: root,
  Static: join(project, 'dist/electron/static'),
  Cache: root,
  NginxDir: join(base, 'nginx'),
  ApacheDir: join(base, 'apache'),
  PhpDir: join(base, 'php'),
  isWindows: true,
  isMacOS: false,
  isLinux: false,
  DataDirectoryReady: true
} as typeof global.Server
const server = createServer(async (request, response) => {
  const name = request.url?.split('?')[0].slice(1)
  if (name === 'registry.json') {
    response.setHeader('Content-Type', 'application/json')
    response.end(JSON.stringify(registry))
    return
  }
  if (name === 'official.json') {
    response.end('{"schemaVersion":1,"plugins":[]}')
    return
  }
  if (name === archiveName) {
    createReadStream(join(release, name)).pipe(response)
    return
  }
  response.writeHead(404)
  response.end()
})
await new Promise<void>((done) => server.listen(0, '127.0.0.1', done))
const address = server.address() as { port: number }
const url = `http://127.0.0.1:${address.port}`
registry.plugins[0].artifact.url = `${url}/${archiveName}`
const previousOfficial = process.env.FLYENV_PLUGIN_REGISTRY_URL
process.env.FLYENV_PLUGIN_REGISTRY_URL = `${url}/official.json`
const manager = new PluginManager({
  pluginsRoot: join(root, 'plugins'),
  statePath: join(root, 'plugins.json'),
  fetchImpl: fetch,
  secretProtect: {
    encrypt: (value) => Buffer.from(value).toString('base64'),
    decrypt: (value) => Buffer.from(value, 'base64').toString()
  }
})
try {
  await manager.addSource(`${url}/registry.json`)
  const catalog = await manager.listCatalog()
  assert.equal(catalog.length, 1)
  const item = catalog[0]
  await manager.install({
    id: item.id,
    version: item.version,
    apiVersion: item.apiVersion,
    url: item.artifact.url,
    sha256: item.artifact.sha256,
    source: item.source
  })
  await manager.refresh()
  assert.equal(manager.listInstalled()[0].enabled, true)
  const snapshot = manager.getForkSnapshot()
  assert.ok(snapshot['phpstudy-import'])
  ;(global.Server as any).Plugins = snapshot
  // 真实包通过公共插件加载器解析，未注册内置分支。
  const runtime = await new PluginLoader().load('phpstudy-import')
  const source = join(root, 'phpstudy')
  const vhosts = join(source, 'Extensions/Nginx1/conf/vhosts')
  const webRoot = join(root, 'www')
  await mkdir(vhosts, { recursive: true })
  await mkdir(webRoot)
  await writeFile(
    join(vhosts, 'sample.conf'),
    `server { listen 18881; server_name plugin.test; root "${webRoot.replaceAll('\\', '/')}"; }`
  )
  const scanned = await runtime.exec('scan', source)
  assert.equal(scanned.candidates.length, 1)
  assert.deepEqual(scanned.candidates[0].blockers, [])
  assert.deepEqual(scanned.candidates[0].webServers, ['nginx'])

  const rendered = (await manager.getRendererPlugins())[0]
  assert.ok(rendered.css)
  assert.doesNotMatch(
    rendered.code,
    /__vite_glob|createWebHashHistory|__FLYENV_PLUGIN_HOST__\s*=|HostStore/
  )
  const calls: string[] = []
  const removed: string[] = []
  let refreshes = 0
  let controller: any
  const host = {
    vue: {
      ...Vue,
      reactive: (value: any) => {
        const reactive = Vue.reactive(value)
        if (typeof value?.refreshVersions === 'function' && typeof value?.scan === 'function')
          controller = reactive
        return reactive
      }
    },
    'element-plus': ElementPlus,
    ipc: {
      send: (command: string, method: string) => ({
        then: (callback: (key: string, result: any) => void) => {
          const key = `test-${calls.length}`
          calls.push(`${command}/${method}`)
          queueMicrotask(() => {
            if (method === 'scan') callback(key, { code: 0, data: scanned })
            else if (method === 'importSites') {
              callback(key, {
                code: 200,
                msg: { completed: 0, total: 1, current: 'plugin.test', outcomes: [] }
              })
              assert.ok(!removed.includes(key), '200 进度仍保留监听')
              callback(key, {
                code: 0,
                data: {
                  completed: 1,
                  total: 1,
                  current: '',
                  outcomes: [
                    {
                      key: scanned.candidates[0].key,
                      name: 'plugin.test',
                      status: 'success',
                      message: '完成'
                    }
                  ],
                  backup: 'backup',
                  warnings: []
                }
              })
            } else callback(key, { code: 0, data: true })
          })
        }
      }),
      off: (key: string) => {
        removed.push(key)
      }
    },
    stores: {
      AppStore: () => ({
        initHost: async () => {
          refreshes++
        },
        config: { setup: { hosts: { write: true, ipv6: true } } }
      }),
      BrewStore: () => ({
        module: () => ({
          fetchInstalled: async () => true,
          installed: [{ bin: 'php-cgi.exe', path: 'php', version: '8.2.9', num: 82, enable: true }]
        })
      })
    },
    aside: { AsideSetup: () => ({}) },
    components: { VersionManager: Vue.defineComponent({}) },
    lang: { I18nT: (key: string) => key }
  }
  ;(globalThis as any).window = { Server: global.Server }
  ;(globalThis as any).__FLYENV_PLUGIN_HOST__ = host
  // renderer 通过宿主提供的 Vue、IPC 与状态加载。
  const entry = snapshot['phpstudy-import'].entry
  const renderModule = await import(
    pathToFileURL(resolve(dirname(entry), '../render/index.mjs')).href
  )
  assert.equal(renderModule.default.typeFlag, 'phpstudy-import')
  assert.ok(controller)
  await controller.prepare()
  assert.equal(refreshes, 1)
  assert.equal(await controller.scan(source), true)
  const candidate = scanned.candidates[0]
  await controller.start([
    {
      key: candidate.key,
      fingerprint: candidate.fingerprint,
      host: candidate.host,
      php: { bin: 'php-cgi.exe', path: 'php', version: '8.2.9', num: 82 },
      confirmed: true
    }
  ])
  assert.equal(refreshes, 2)
  assert.ok(calls.includes('app-fork:phpstudy-import/scan'))
  assert.ok(calls.includes('app-fork:phpstudy-import/importSites'))
  assert.ok(calls.includes('app-fork:host/writeHosts'))
  assert.equal(removed.length, calls.length)

  await manager.setEnabled('phpstudy-import', false)
  assert.equal((await manager.getRendererPlugins()).length, 0)
  assert.equal(Object.keys(manager.getForkSnapshot()).length, 0)
  await manager.setEnabled('phpstudy-import', true)
  assert.equal((await manager.getRendererPlugins()).length, 1)
  await manager.uninstall('phpstudy-import')
  assert.equal(manager.listInstalled().length, 0)
  await manager.removeSource(`${url}/registry.json`)
  console.log('独立插件安装、扫描、renderer 宿主桥接、IPC 终态清理、启停用及卸载测试通过')
} finally {
  server.closeAllConnections()
  server.close()
  if (previousOfficial === undefined) delete process.env.FLYENV_PLUGIN_REGISTRY_URL
  else process.env.FLYENV_PLUGIN_REGISTRY_URL = previousOfficial
}
