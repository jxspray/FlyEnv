import { Base } from '../Base'
import { ForkPromise } from '@shared/ForkPromise'
import { readFile, writeFile, existsSync, mkdirp } from '../../Fn'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { optionalBearerHeaders } from '@shared/aiCliMcp'

// 仅提供本地 MCP 客户端配置写入，工具管理和会话执行入口已移除。
class Kimi extends Base {
  constructor() {
    super()
    this.type = 'kimi'
  }

  private kimiHome() {
    return process.env.KIMI_CODE_HOME || join(homedir(), '.kimi-code')
  }

  private mcpFile() {
    return join(this.kimiHome(), 'mcp.json')
  }

  addMcp(name: string, type: string, commandOrUrl: string, token?: string) {
    return new ForkPromise(async (resolve, reject) => {
      try {
        if (type !== 'http' && type !== 'sse') {
          reject('Kimi only supports HTTP/SSE MCP config files')
          return
        }
        const file = this.mcpFile()
        let data: any = {}
        if (existsSync(file)) {
          data = JSON.parse(await readFile(file, 'utf-8'))
        }
        data.mcpServers = data.mcpServers ?? {}
        const headers = optionalBearerHeaders(token)
        data.mcpServers[name] = {
          url: commandOrUrl
        }
        if (headers) {
          data.mcpServers[name].headers = headers
        }
        if (type === 'sse') {
          data.mcpServers[name].transport = 'sse'
        }
        await mkdirp(this.kimiHome())
        await writeFile(file, JSON.stringify(data, null, 2))
        resolve(true)
      } catch (e: any) {
        reject(e?.message ?? 'fail')
      }
    })
  }
}

export default new Kimi()
