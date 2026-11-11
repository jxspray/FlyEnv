import { createHash } from 'node:crypto'
import { createReadStream } from 'node:fs'
import { rename, stat, writeFile } from 'node:fs/promises'
import { basename, dirname, resolve } from 'node:path'
import YAML from 'yamljs'

/** 从最终安装包生成元数据，最后替换 latest.yml，避免客户端看到未就绪的版本。 */
export async function writeUpdateManifest(installer: string, version: string): Promise<string> {
  if (!/^\d+\.\d+\.\d+(?:-[\da-z.-]+)?$/i.test(version)) throw new Error('发布版本号格式不正确')
  if (!installer.toLowerCase().endsWith('.exe')) throw new Error('Windows 更新需要 NSIS exe 安装包')
  await stat(`${installer}.blockmap`)
  const hash = createHash('sha512')
  for await (const chunk of createReadStream(installer)) hash.update(chunk)
  const sha512 = hash.digest('base64')
  const manifest = {
    version,
    files: [{ url: basename(installer), sha512, size: (await stat(installer)).size }],
    path: basename(installer),
    sha512,
    releaseDate: new Date().toISOString()
  }
  const destination = resolve(dirname(installer), 'latest.yml')
  const temporary = `${destination}.${process.pid}.tmp`
  await writeFile(temporary, YAML.stringify(manifest, 4, 2), 'utf8')
  await rename(temporary, destination)
  return destination
}
