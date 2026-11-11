import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { writeUpdateManifest } from './update-manifest'

const { version } = JSON.parse(await readFile(resolve('package.json'), 'utf8'))
const installer = resolve(process.argv[2] || `release/FlyEnv-Local-Setup-${version}.exe`)
console.log(`更新元数据已生成 ${await writeUpdateManifest(installer, version)}`)
