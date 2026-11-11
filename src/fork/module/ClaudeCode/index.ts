import { Base } from '../Base'
import { ForkPromise } from '@shared/ForkPromise'
import { execPromiseWithEnv, readFile, writeFile, existsSync, mkdirp } from '../../Fn'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'
import { resolveAiCliCommand } from '../../util/AiCli'

// 仅提供本地 MCP 客户端配置写入，工具管理和会话执行入口已移除。
class ClaudeCode extends Base {
  constructor() {
    super()
    this.type = 'claudeCode'
  }

  private claudeBin() {
    return resolveAiCliCommand('claude')
  }

  addMcp(name: string, type: string, commandOrUrl: string, token?: string) {
    return new ForkPromise(async (resolve, reject) => {
      try {
        if (type === 'http' || type === 'sse') {
          const file = join(homedir(), '.claude.json')
          let data: any = {}
          if (existsSync(file)) {
            data = JSON.parse(await readFile(file, 'utf-8'))
          }
          data.mcpServers = data.mcpServers ?? {}
          data.mcpServers[name] = {
            type: 'http',
            url: commandOrUrl,
            headers: {
              Authorization: `Bearer ${token ?? ''}`
            }
          }
          await mkdirp(dirname(file))
          await writeFile(file, JSON.stringify(data, null, 2))
          resolve(true)
          return
        }
        const cmd = `${this.claudeBin()} mcp add ${name} -- ${commandOrUrl}`
        await execPromiseWithEnv(cmd)
        resolve(true)
      } catch (e: any) {
        reject(e?.message ?? 'fail')
      }
    })
  }
}

export default new ClaudeCode()
