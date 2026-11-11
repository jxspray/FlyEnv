import { copyFile, cp, mkdir, stat, unlink } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { randomInt, randomUUID } from 'node:crypto'
import { Base } from '@fork/module/Base'
import { ForkPromise } from '@shared/ForkPromise'
import type { AppHost } from '@shared/app'
import Host from '@fork/module/Host'
import { fetchHostList } from '@fork/module/Host/HostFile'
import { withHostMutationLock } from '@fork/module/Host/MutationLock'
import Php from '@fork/module/Php.win'
import { scanPhpStudy } from './Scanner'
import { duplicateSite, runImport } from './Runner'
import type { ImportResult, ImportSelection } from '../shared/types'

async function validateHost(host: AppHost, php: ImportSelection['php']): Promise<void> {
  const names = [host.name, ...host.alias.split(/\s+/).filter(Boolean)]
  if (
    names.some(
      (name) => !/^(?:\*\.)?[a-z\d](?:[a-z\d.-]*[a-z\d])?$/i.test(name) || name.includes('..')
    )
  )
    throw new Error('域名或别名格式不正确')
  if (!(await stat(host.root)).isDirectory()) throw new Error('项目根目录不可用')
  if (/["\r\n]/.test(host.root)) throw new Error('项目目录包含无法用于站点配置的字符')
  if (!(await stat(php.bin)).isFile()) throw new Error('PHP 可执行文件已不存在，请重新选择版本')
  for (const port of Object.values(host.port)) {
    if (!Number.isInteger(port) || port < 1 || port > 65535)
      throw new Error('端口必须在 1 到 65535 之间')
  }
  if (host.useSSL) {
    for (const path of [host.ssl.cert, host.ssl.key]) {
      if (!(await stat(path)).isFile()) throw new Error('SSL 证书或私钥不可用')
    }
  }
}

async function backupHosts(): Promise<string> {
  return withHostMutationLock(async () => {
    const base = global.Server.BaseDir!
    const destination = join(base, 'backups', `site-import-${Date.now()}-${randomUUID()}`)
    await mkdir(destination, { recursive: true })
    if (existsSync(join(base, 'host.json')))
      await copyFile(join(base, 'host.json'), join(destination, 'host.json'))
    for (const directory of ['nginx', 'apache', 'caddy', 'frankenphp', 'rewrite']) {
      const source = join(base, 'vhost', directory)
      if (existsSync(source))
        await cp(source, join(destination, 'vhost', directory), { recursive: true })
    }
    return destination
  })
}

async function cleanupHost(host: AppHost): Promise<void> {
  for (const directory of ['nginx', 'apache', 'caddy', 'frankenphp', 'rewrite']) {
    const path = join(global.Server.BaseDir!, 'vhost', directory, `${host.id}.conf`)
    try {
      await unlink(path)
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
    }
  }
}

class SiteImport extends Base {
  private running = false

  scan(directory: string) {
    return new ForkPromise(async (resolve) => resolve(await scanPhpStudy(directory)))
  }

  importSites(directory: string, selections: ImportSelection[], setup: unknown) {
    return new ForkPromise<ImportResult>(async (resolve, reject, on) => {
      if (this.running) {
        reject(new Error('站点导入正在进行'))
        return
      }
      this.running = true
      try {
        const result = await runImport(
          selections,
          {
            scan: () => scanPhpStudy(directory),
            versions: async () => (await Php.allInstalledVersions(setup)) ?? [],
            backup: backupHosts,
            list: fetchHostList,
            add: (host) =>
              withHostMutationLock(async () => {
                if (duplicateSite(host, await fetchHostList())) return false
                await Host.handleHost(host, 'add')
                return true
              }),
            cleanup: cleanupHost,
            id: () => randomInt(1_000_000_000_000, 10_000_000_000_000),
            validate: validateHost
          },
          on
        )
        resolve(result)
      } catch (error) {
        reject(error)
      } finally {
        this.running = false
      }
    })
  }
}

export default new SiteImport()
