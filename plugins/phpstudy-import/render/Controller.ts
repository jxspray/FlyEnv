import type { SoftInstalled } from '@shared/app'
import type { ImportProgress, ImportResult, ImportSelection, ScanResult } from '../shared/types'

export type SiteImportPorts = {
  scan: (directory: string) => Promise<ScanResult>
  importSites: (
    directory: string,
    selections: ImportSelection[],
    progress: (value: ImportProgress) => void
  ) => Promise<ImportResult>
  versions: () => Promise<SoftInstalled[]>
  ready: () => Promise<boolean>
  loadDirectory: () => Promise<string>
  saveDirectory: (directory: string) => Promise<void>
  refreshHosts: () => Promise<void>
  syncHosts: () => Promise<void>
  notifyError: (message: string) => void
}

/** 跨页面保留操作快照与结果，组件只负责核对草稿。 */
export class SiteImportController {
  phase: 'idle' | 'scanning' | 'review' | 'importing' | 'finished' = 'idle'
  directory = 'E:\\phpstudy_pro'
  scanResult?: ScanResult
  versions: SoftInstalled[] = []
  versionsReady = false
  refreshing = false
  error = ''
  warnings: string[] = []
  progress: ImportProgress = { completed: 0, total: 0, current: '', outcomes: [] }
  result?: ImportResult

  constructor(private ports: SiteImportPorts) {}

  get running() {
    return this.phase === 'scanning' || this.phase === 'importing'
  }

  reset(): void {
    if (this.running || this.refreshing) return
    this.phase = 'idle'
    this.scanResult = undefined
    this.result = undefined
    this.error = ''
    this.warnings = []
    this.progress = { completed: 0, total: 0, current: '', outcomes: [] }
  }

  async prepare(): Promise<void> {
    if (this.running) return
    if (!this.scanResult) {
      try {
        this.directory = (await this.ports.loadDirectory()) || this.directory
      } catch {
        /* 首次使用无偏好。 */
      }
    }
    try {
      await this.ports.refreshHosts()
    } catch {
      this.warnings.push('已有站点读取失败，导入时将再次检查重复')
    }
    await this.refreshVersions()
  }

  async refreshVersions(): Promise<void> {
    if (this.refreshing || this.running) return
    this.refreshing = true
    this.versionsReady = false
    try {
      this.versions = (await this.ports.versions()).filter(
        (item) => item.enable !== false && item.version && item.num
      )
      this.versionsReady = true
      this.error = ''
    } catch (error) {
      this.error = `PHP 版本列表读取失败，${String(error)}`
    } finally {
      this.refreshing = false
    }
  }

  async scan(directory: string): Promise<boolean> {
    if (this.running || this.refreshing) return false
    this.phase = 'scanning'
    this.error = ''
    this.warnings = []
    this.result = undefined
    this.scanResult = undefined
    try {
      if (!directory.trim()) throw new Error('请选择 phpStudy 安装目录')
      if (!(await this.ports.ready())) throw new Error('FlyEnv 数据目录尚未准备好')
      this.scanResult = await this.ports.scan(directory.trim())
      this.directory = this.scanResult.directory
      try {
        await this.ports.saveDirectory(this.directory)
      } catch {
        this.warnings.push('来源目录偏好保存失败')
      }
      this.phase = 'review'
      return true
    } catch (error) {
      this.phase = 'idle'
      this.error = error instanceof Error ? error.message : String(error)
      this.ports.notifyError(this.error)
      return false
    }
  }

  async start(selections: ImportSelection[]): Promise<boolean> {
    if (this.running || this.refreshing || !this.scanResult || !this.versionsReady) return false
    if (!selections.length || selections.some((item) => !item.confirmed || !item.php?.version))
      return false
    const snapshot = JSON.parse(JSON.stringify(selections)) as ImportSelection[]
    const directory = this.scanResult.directory
    this.phase = 'importing'
    this.error = ''
    this.result = undefined
    this.progress = { completed: 0, total: snapshot.length, current: '', outcomes: [] }
    try {
      if (!(await this.ports.ready())) throw new Error('FlyEnv 数据目录尚未准备好')
      this.result = await this.ports.importSites(directory, snapshot, (value) => {
        this.progress = value
      })
      this.progress = this.result
      // 配置写入已完成，显示刷新和系统 hosts 同步分别报告自己的失败。
      try {
        await this.ports.refreshHosts()
      } catch {
        this.result.warnings.push('站点列表刷新失败，请重新进入站点页')
      }
      if (this.result.outcomes.some((item) => item.status === 'success')) {
        try {
          await this.ports.syncHosts()
        } catch (error) {
          this.result.warnings.push(`站点已导入，系统 hosts 同步失败，${String(error)}`)
        }
      }
      this.phase = 'finished'
      return true
    } catch (error) {
      this.phase = 'finished'
      this.error = error instanceof Error ? error.message : String(error)
      const reported = new Set(this.progress.outcomes.map((item) => item.key))
      this.progress.outcomes.push(
        ...snapshot
          .filter((item) => !reported.has(item.key))
          .map((item) => ({
            key: item.key,
            name: item.host.name,
            status: 'unknown' as const,
            message: '操作中断，请检查站点列表后再导入'
          }))
      )
      this.ports.notifyError(this.error)
      return false
    }
  }
}
