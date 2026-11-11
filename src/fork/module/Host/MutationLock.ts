import { open, unlink } from 'node:fs/promises'
import { join } from 'node:path'
import { setTimeout } from 'node:timers/promises'
import { AsyncLocalStorage } from 'node:async_hooks'
import { appDebugLog } from '@shared/utils'

const scope = new AsyncLocalStorage<{ active: boolean }>()

/** Host 编辑与批量导入跨 worker 串行，避免读改写丢失其他已完成站点。 */
export async function withHostMutationLock<T>(operation: () => PromiseLike<T>): Promise<T> {
  if (scope.getStore()?.active) return await operation()
  const path = join(global.Server.BaseDir!, 'host-mutation.lock')
  const deadline = Date.now() + 30_000
  let lock
  while (!lock) {
    try {
      lock = await open(path, 'wx')
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error
      if (Date.now() >= deadline)
        throw new Error(
          `站点操作锁等待超时，请确认其他操作已结束。若程序曾异常退出，请检查 ${path}`
        )
      await setTimeout(100)
    }
  }
  const context = { active: true }
  try {
    await lock.writeFile(String(process.pid))
    return await scope.run(context, operation)
  } finally {
    context.active = false
    try {
      await lock.close()
      await unlink(path)
    } catch (error) {
      // 释放锁属于附加清理，不能覆盖已经保存的站点结果。
      appDebugLog('站点操作锁释放失败', String(error)).catch(() => {})
    }
  }
}
