import { normalizeUpdateSource, type AppUpdateAction, type AppUpdateState } from '@shared/AppUpdate'

export type UpdatePorts = {
  request: (
    action: AppUpdateAction,
    source: string,
    progress: (state: AppUpdateState) => void
  ) => Promise<AppUpdateState>
  loadSource: () => Promise<string>
  saveSource: (source: string) => Promise<void>
  notice: (message: string) => void
  error: (message: string) => void
}

/** 更新操作和结果跨 About 页面保留，配置草稿由页面持有。 */
export class UpdateController {
  source = ''
  busy = false
  error = ''
  state?: AppUpdateState
  private initialized?: Promise<void>

  constructor(private ports: UpdatePorts) {}

  initialize(): Promise<void> {
    if (!this.initialized) {
      this.initialized = (async () => {
        try {
          this.source = normalizeUpdateSource(await this.ports.loadSource())
        } catch {
          this.source = ''
        }
      })()
    }
    return this.initialized
  }

  async saveSource(value: string): Promise<boolean> {
    if (this.busy) return false
    this.busy = true
    this.error = ''
    try {
      await this.initialize()
      const source = normalizeUpdateSource(value)
      this.state = await this.ports.request('reset', '', (state) => {
        this.state = state
      })
      await this.ports.saveSource(source)
      this.source = source
      return true
    } catch (error) {
      this.error = error instanceof Error ? error.message : String(error)
      this.ports.error(this.error)
      return false
    } finally {
      this.busy = false
    }
  }

  async check(automatic = false): Promise<boolean> {
    await this.initialize()
    if (automatic && !this.source) return false
    const result = await this.run('check', automatic)
    if (result && automatic && this.state?.phase === 'available')
      this.ports.notice(`发现新版本 ${this.state.version}，请在关于我们中下载更新`)
    return result
  }

  download(): Promise<boolean> {
    return this.run('download')
  }
  install(): Promise<boolean> {
    return this.run('install')
  }

  private async run(action: AppUpdateAction, quiet = false): Promise<boolean> {
    if (this.busy) return false
    this.busy = true
    this.error = ''
    try {
      if (!this.source) throw new Error('请先填写并保存更新目录地址')
      this.state = await this.ports.request(action, this.source, (state) => {
        this.state = state
      })
      return true
    } catch (error) {
      this.error = error instanceof Error ? error.message : String(error)
      if (!quiet) this.ports.error(this.error)
      return false
    } finally {
      this.busy = false
    }
  }
}
