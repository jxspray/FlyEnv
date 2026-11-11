import { Base } from '../Base'
import { ForkPromise } from '@shared/ForkPromise'
import { readFile, writeFile, existsSync, mkdirp } from '../../Fn'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { optionalBearerHeaders } from '@shared/aiCliMcp'

// 仅提供本地 MCP 客户端配置写入，工具管理和会话执行入口已移除。
class Antigravity extends Base {
  constructor() {
    super()
    this.type = 'antigravity'
  }

  private geminiHome() {
    return process.env.GEMINI_HOME || join(homedir(), '.gemini')
  }

  private mcpConfigFile() {
    return join(this.geminiHome(), 'config', 'mcp_config.json')
  }

  addMcp(name: string, type: string, commandOrUrl: string, token?: string) {
    return new ForkPromise(async (resolve, reject) => {
      try {
        const file = this.mcpConfigFile()
        let data: any = {}
        if (existsSync(file)) {
          const raw = await readFile(file, 'utf-8')
          if (raw.trim()) {
            try {
              data = JSON.parse(raw)
            } catch {
              data = {}
            }
          }
        }
        data.mcpServers = data.mcpServers ?? {}
        if (type === 'http' || type === 'sse') {
          const headers = optionalBearerHeaders(token)
          data.mcpServers[name] = {
            serverUrl: commandOrUrl
          }
          if (headers) {
            data.mcpServers[name].headers = headers
          }
        } else {
          const parts = commandOrUrl.split(' ').filter(Boolean)
          data.mcpServers[name] = {
            command: parts.shift() ?? '',
            args: parts
          }
        }
        await mkdirp(join(this.geminiHome(), 'config'))
        await writeFile(file, JSON.stringify(data, null, 2))
        resolve(true)
      } catch (e: any) {
        reject(e?.message ?? 'fail')
      }
    })
  }
}

export default new Antigravity()
