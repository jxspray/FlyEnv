import { createHash } from 'node:crypto'
import { readFile, mkdir, writeFile, rename, rm } from 'node:fs/promises'
import { dirname, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { buildPlugin, packPlugin } from '../../scripts/plugin-builder'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const output = resolve(root, 'dist/plugins/phpstudy-import/package')
if (!output.startsWith(resolve(root, 'dist/plugins/phpstudy-import') + sep))
  throw new Error('插件构建目录校验失败')
await buildPlugin('phpstudy-import', { outputRoot: output, minify: true })
const manifest = JSON.parse(await readFile(resolve(output, 'plugin.json'), 'utf8'))
const release = resolve(root, 'release/plugins/phpstudy-import')
await mkdir(release, { recursive: true })
const filename = `phpstudy-import-${manifest.version}.flyenv-plugin`
const archive = resolve(release, filename)
// 7zip 的 a 命令会更新已有归档，先生成新文件以免保留旧版本中已删除的条目。
const temporaryArchive = `${archive}.${process.pid}.tmp`
await rm(temporaryArchive, { force: true })
try {
  await packPlugin(output, temporaryArchive)
  await rename(temporaryArchive, archive)
} finally {
  await rm(temporaryArchive, { force: true })
}
const sha256 = createHash('sha256')
  .update(await readFile(archive))
  .digest('hex')
const registry = {
  schemaVersion: 1,
  plugins: [
    {
      apiVersion: manifest.apiVersion,
      id: manifest.id,
      name: manifest.name,
      version: manifest.version,
      description: manifest.description,
      module: manifest.module,
      platforms: manifest.module.platform,
      artifact: { url: `http://127.0.0.1:9089/${filename}`, sha256 }
    }
  ]
}
await writeFile(resolve(release, 'registry.json'), JSON.stringify(registry, null, 2) + '\n', 'utf8')
console.log(`插件包已生成 ${archive}`)
console.log(`本地安装源已生成 ${resolve(release, 'registry.json')}`)
