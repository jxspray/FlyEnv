import IPC from '@/util/IPC'
import { reactiveBind } from '@/util/Index'
import { StorageGetAsync, StorageSetAsync } from '@/util/Storage'
import { BrewStore } from '@/store/brew'
import { AppStore } from '@/store/app'
import { MessageError } from '@/util/Element'
import { ensureDataDirectoryReady } from '@/core/DataDirectoryStartup'
import { SiteImportController } from './Controller'
import type { ImportProgress } from '../shared/types'

/** 200 只更新进度，0/1 才移除监听；模块单例持有全部 IPC 生命周期。 */
function request<T>(
  module: string,
  method: string,
  args: unknown[],
  progress?: (value: ImportProgress) => void
): Promise<T> {
  return new Promise((resolve, reject) => {
    IPC.send(`app-fork:${module}`, method, ...args).then((key: string, response: any) => {
      if (response?.code === 200) {
        if (response.msg && typeof response.msg === 'object') progress?.(response.msg)
        return
      }
      IPC.off(key)
      if (response?.code === 0) resolve(response.data)
      else reject(new Error(response?.msg || '站点导入请求失败'))
    })
  })
}

export default reactiveBind(
  new SiteImportController({
    scan: (directory) => request('phpstudy-import', 'scan', [directory]),
    importSites: (directory, selections, progress) =>
      request(
        'phpstudy-import',
        'importSites',
        [directory, selections, JSON.parse(JSON.stringify(AppStore().config.setup))],
        progress
      ),
    versions: async () => {
      const module = BrewStore().module('php')
      if (!(await module.fetchInstalled(true, { fresh: true, updateCurrent: false })))
        throw new Error('无法刷新已安装 PHP')
      return module.installed
    },
    ready: ensureDataDirectoryReady,
    loadDirectory: () => StorageGetAsync<string>('site-import-directory'),
    saveDirectory: (directory) => StorageSetAsync('site-import-directory', directory),
    refreshHosts: async () => {
      // 由宿主更新自己的列表和筛选状态，插件只绑定公开入口。
      await AppStore().initHost()
    },
    syncHosts: async () => {
      const settings = AppStore().config.setup.hosts
      const saved = await request<boolean>('host', 'writeHosts', [
        settings.write,
        settings.ipv6 !== false
      ])
      if (saved !== true) throw new Error('系统 hosts 同步失败')
    },
    notifyError: MessageError
  })
)
