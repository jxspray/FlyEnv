import { LazyRuntime } from './LazyRuntime'

type CapturerConfigLike = {
  key: string[]
}

type ConfigurableCapturer<TConfig extends CapturerConfigLike> = {
  configUpdate(config: TConfig): void
}

export const syncCapturerConfig = async <TConfig extends CapturerConfigLike>(
  runtime: Pick<LazyRuntime<ConfigurableCapturer<TConfig>>, 'load' | 'peek'>,
  getConfig: () => TConfig
): Promise<void> => {
  const config = getConfig()
  const capturer = runtime.peek()
  if (capturer) {
    capturer.configUpdate(config)
    return
  }
  if (config.key.length === 0) return

  const loadedCapturer = await runtime.load()
  loadedCapturer.configUpdate(getConfig())
}

export const nodePtyRuntime = new LazyRuntime(async () => (await import('../NodePTY')).default)
export const capturerRuntime = new LazyRuntime(async () => (await import('../Capturer')).default)
export const httpServerRuntime = new LazyRuntime(
  async () => (await import('../HttpServer')).default
)
export const siteSuckerRuntime = new LazyRuntime(
  async () => (await import('../../ui/SiteSucker')).default
)
export const mcpAuditRuntime = new LazyRuntime(async () => (await import('../MCPAudit')).default)
export const appUpdateRuntime = new LazyRuntime(async () => {
  const [{ default: UpdateManager }, { default: updater }, { app }, { default: logger }] =
    await Promise.all([
      import('../UpdateManager'),
      import('electron-updater'),
      import('electron'),
      import('../Logger')
    ])
  updater.autoUpdater.logger = logger
  return new UpdateManager(updater.autoUpdater, app.getVersion(), async () => {
    if (!global.application) throw new Error('应用尚未初始化完成')
    await global.application.stop()
  })
})
