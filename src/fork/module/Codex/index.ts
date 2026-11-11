import { Base } from '../Base'
import { ForkPromise } from '@shared/ForkPromise'
import { execPromiseWithEnv, readFile, writeFile, existsSync, mkdirp } from '../../Fn'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'
import { parseToml, stringifyToml } from '@shared/toml'
import { optionalBearerHeaders } from '@shared/aiCliMcp'
import { resolveAiCliCommand } from '../../util/AiCli'

// 仅提供本地 MCP 客户端配置写入，工具管理和会话执行入口已移除。
class Codex extends Base {
  constructor() {
    super()
    this.type = 'codex'
  }

  private codexHome() {
    return process.env.CODEX_HOME || join(homedir(), '.codex')
  }

  private codexBin() {
    return resolveAiCliCommand('codex')
  }

  addMcp(name: string, type: string, commandOrUrl: string, token?: string) {
    return new ForkPromise(async (resolve, reject) => {
      try {
        if (type === 'http' || type === 'sse') {
          const file = join(this.codexHome(), 'config.toml')
          let data: any = {}
          if (existsSync(file)) {
            data = parseToml(await readFile(file, 'utf-8'))
          }
          const httpHeaders = optionalBearerHeaders(token)
          data.features = data.features ?? {}
          data.features.rmcp_client = true
          data.mcp_servers = data.mcp_servers ?? {}
          data.mcp_servers[name] = {
            url: commandOrUrl
          }
          if (httpHeaders) {
            data.mcp_servers[name].http_headers = httpHeaders
          }
          await mkdirp(dirname(file))
          await writeFile(file, stringifyToml(data))
          resolve(true)
          return
        }
        const cmd = `${this.codexBin()} mcp add ${name} -- ${commandOrUrl}`
        await execPromiseWithEnv(cmd)
        resolve(true)
      } catch (e: any) {
        reject(e?.message ?? 'fail')
      }
    })
  }
}

export default new Codex()
