import { Base } from '../Base'
import { ForkPromise } from '@shared/ForkPromise'
import { execPromiseWithEnv, readFile, writeFile, existsSync, mkdirp } from '../../Fn'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'
import { resolveAiCliCommand } from '../../util/AiCli'

// 仅提供本地 MCP 客户端配置写入，工具管理和会话执行入口已移除。
class OpenCode extends Base {
  constructor() {
    super()
    this.type = 'openCode'
  }

  private configHome() {
    const base = process.env.XDG_CONFIG_HOME || join(homedir(), '.config')
    return join(base, 'opencode')
  }

  private configFile() {
    const home = this.configHome()
    const jsonc = join(home, 'opencode.jsonc')
    if (existsSync(jsonc)) {
      return jsonc
    }
    return join(home, 'opencode.json')
  }

  private openCodeBin() {
    return resolveAiCliCommand('opencode')
  }

  private async readConfig(): Promise<any> {
    const file = this.configFile()
    if (!existsSync(file)) {
      return {}
    }
    try {
      const raw = await readFile(file, 'utf-8')
      // strip // and /* */ comments to tolerate JSONC
      const stripped = raw.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1')
      return JSON.parse(stripped)
    } catch (e) {
      console.log('openCode readConfig error: ', e)
      return {}
    }
  }

  addMcp(name: string, type: string, commandOrUrl: string, token?: string) {
    return new ForkPromise(async (resolve, reject) => {
      try {
        if (type === 'remote' || type === 'http' || type === 'sse') {
          const file = this.configFile()
          const config = await this.readConfig()
          config.mcp = config.mcp ?? {}
          config.mcp[name] = {
            type: 'remote',
            url: commandOrUrl,
            headers: {
              Authorization: `Bearer ${token ?? ''}`
            }
          }
          await mkdirp(dirname(file))
          await writeFile(file, JSON.stringify(config, null, 2))
          resolve(true)
          return
        }
        const cmd = `${this.openCodeBin()} mcp add ${name} -- ${commandOrUrl}`
        await execPromiseWithEnv(cmd)
        resolve(true)
      } catch (e: any) {
        reject(e?.message ?? 'fail')
      }
    })
  }
}

export default new OpenCode()
