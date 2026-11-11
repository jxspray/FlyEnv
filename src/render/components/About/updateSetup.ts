import IPC from '@/util/IPC'
import { reactiveBind } from '@/util/Index'
import { StorageGetAsync, StorageSetAsync } from '@/util/Storage'
import { MessageError, MessageSuccess } from '@/util/Element'
import { UpdateController } from './UpdateController'
import type { AppUpdateState } from '@shared/AppUpdate'

export default reactiveBind(
  new UpdateController({
    request: (action, source, progress) =>
      new Promise<AppUpdateState>((resolve, reject) => {
        IPC.send('application:update', action, source).then((key: string, response: any) => {
          if (response?.code === 200) {
            progress(response.data)
            return
          }
          IPC.off(key)
          if (response?.code === 0) resolve(response.data)
          else reject(new Error(response?.msg || '更新操作失败'))
        })
      }),
    loadSource: async () => (await StorageGetAsync<{ url: string }>('app-update-source')).url,
    saveSource: (source) => StorageSetAsync('app-update-source', { url: source }),
    notice: MessageSuccess,
    error: MessageError
  })
)
