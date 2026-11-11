import { EventEmitter } from 'node:events'
import type { AppUpdater } from 'electron-updater/out/AppUpdater'
import { normalizeUpdateSource, type AppUpdateAction, type AppUpdateState } from '@shared/AppUpdate'

export type UpdateEngine = Pick<
  AppUpdater,
  | 'on'
  | 'setFeedURL'
  | 'checkForUpdates'
  | 'downloadUpdate'
  | 'quitAndInstall'
  | 'autoDownload'
  | 'autoInstallOnAppQuit'
  | 'allowDowngrade'
  | 'requestHeaders'
>

/** 主进程拥有更新下载及安装，renderer 仅提交命令和绑定状态。 */
export default class UpdateManager extends EventEmitter {
  private busy = false
  private state: AppUpdateState

  constructor(
    private engine: UpdateEngine,
    currentVersion: string,
    private beforeInstall: () => Promise<void>
  ) {
    super()
    this.state = {
      phase: 'idle',
      currentVersion,
      version: '',
      source: '',
      percent: 0,
      transferred: 0,
      total: 0,
      releaseNotes: '',
      error: ''
    }
    engine.autoDownload = false
    engine.autoInstallOnAppQuit = false
    engine.allowDowngrade = false
    // 覆盖库默认的分阶段更新用户标识，更新请求仅获取版本及安装文件。
    engine.requestHeaders = { 'x-user-staging-id': '' }
    engine.on('update-available', (info) =>
      this.patch({
        phase: 'available',
        version: info.version,
        releaseNotes: this.notes(info.releaseNotes)
      })
    )
    engine.on('update-not-available', (info) =>
      this.patch({ phase: 'current', version: info.version })
    )
    engine.on('download-progress', (info) =>
      this.patch({
        phase: 'downloading',
        percent: Math.min(100, Math.max(0, info.percent)),
        transferred: info.transferred,
        total: info.total
      })
    )
    engine.on('update-downloaded', (info) =>
      this.patch({ phase: 'downloaded', percent: 100, version: info.version })
    )
    engine.on('error', (error) =>
      this.patch({ phase: 'error', error: error instanceof Error ? error.message : String(error) })
    )
  }

  snapshot(): AppUpdateState {
    return { ...this.state }
  }

  private patch(values: Partial<AppUpdateState>) {
    Object.assign(this.state, values)
    this.emit('state', this.snapshot())
  }

  private notes(value: unknown): string {
    if (typeof value === 'string') return value
    if (Array.isArray(value))
      return value
        .map((item) => (typeof item?.note === 'string' ? item.note : ''))
        .filter(Boolean)
        .join('\n')
    return ''
  }

  async run(action: AppUpdateAction, source = ''): Promise<AppUpdateState> {
    if (action === 'snapshot') return this.snapshot()
    if (this.busy) throw new Error('更新任务正在进行，请等待当前操作完成')
    this.busy = true
    try {
      if (action === 'reset') {
        this.patch({
          phase: 'idle',
          version: '',
          source: '',
          percent: 0,
          transferred: 0,
          total: 0,
          error: '',
          releaseNotes: ''
        })
      } else if (action === 'check') {
        const url = normalizeUpdateSource(source)
        if (!url) throw new Error('请先配置更新目录地址')
        this.patch({
          phase: 'checking',
          source: url,
          version: '',
          percent: 0,
          error: '',
          releaseNotes: ''
        })
        this.engine.setFeedURL({ provider: 'generic', url, useMultipleRangeRequest: false })
        const result = await this.engine.checkForUpdates()
        if (!result) throw new Error('当前运行方式不支持自动更新，请使用安装版进行检查')
      } else if (action === 'download') {
        if (this.state.phase !== 'available') throw new Error('请先检查并选择可用的新版本')
        this.patch({ phase: 'downloading', percent: 0, error: '' })
        await this.engine.downloadUpdate()
        if (this.snapshot().phase !== 'downloaded') throw new Error('安装包下载未完成')
      } else if (action === 'install') {
        if (this.state.phase !== 'downloaded') throw new Error('请先完整下载并校验更新包')
        this.patch({ phase: 'installing', error: '' })
        await this.beforeInstall()
        this.engine.quitAndInstall(false, true)
        if (this.snapshot().phase === 'error') throw new Error(this.state.error)
      } else throw new Error('未知的应用更新操作')
      return this.snapshot()
    } catch (error) {
      this.patch({
        phase: action === 'install' && this.state.phase === 'installing' ? 'downloaded' : 'error',
        error: error instanceof Error ? error.message : String(error)
      })
      throw error
    } finally {
      this.busy = false
    }
  }
}
