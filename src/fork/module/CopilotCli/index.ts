import { Base } from '../Base'
import { ForkPromise } from '@shared/ForkPromise'
import { execPromiseWithEnv, readFile, writeFile, remove, existsSync, mkdirp, uuid } from '../../Fn'
import { tmpdir, homedir } from 'node:os'
import { join } from 'node:path'
import { optionalBearerHeaders } from '@shared/aiCliMcp'
import { resolveAiCliCommand } from '../../util/AiCli'

// 仅提供本地 MCP 客户端配置写入，工具管理和会话执行入口已移除。
class CopilotCli extends Base {
  constructor() {
    super()
    this.type = 'copilotCli'
  }

  private copilotHome() {
    return process.env.COPILOT_CONFIG_DIR || join(homedir(), '.copilot')
  }

  private mcpConfigFile() {
    return join(this.copilotHome(), 'mcp-config.json')
  }

  private copilotBin() {
    return resolveAiCliCommand('copilot')
  }

  private runCommand(command: string) {
    return new ForkPromise<string>(async (resolve) => {
      const tmp = join(tmpdir(), `${uuid()}.txt`)
      try {
        await execPromiseWithEnv(`${command} > "${tmp}" 2>&1`)
        const content = await readFile(tmp, 'utf-8')
        resolve(content)
      } catch {
        resolve('')
      } finally {
        if (existsSync(tmp)) {
          await remove(tmp)
        }
      }
    })
  }

  addMcp(name: string, type: string, commandOrUrl: string, token?: string) {
    return new ForkPromise(async (resolve, reject) => {
      try {
        if (type === 'http' || type === 'sse') {
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
          const headers = optionalBearerHeaders(token)
          data.mcpServers[name] = {
            tools: ['*'],
            type: 'http',
            url: commandOrUrl,
            source: 'user'
          }
          if (headers) {
            data.mcpServers[name].headers = headers
          }
          await mkdirp(this.copilotHome())
          await writeFile(file, JSON.stringify(data, null, 2))
          resolve(true)
          return
        }
        const bin = this.copilotBin()
        // stdio/local: everything after `--` is the command and its args.
        const cmd = `${bin} mcp add ${name} -- ${commandOrUrl}`
        const output = await this.runCommand(cmd)
        // The CLI prints an error to stdout/stderr on failure; treat known markers as errors.
        if (/error|failed|usage:/i.test(output) && !/added|success/i.test(output)) {
          reject(output.trim() || 'fail')
          return
        }
        resolve(true)
      } catch (e: any) {
        reject(e?.message ?? 'fail')
      }
    })
  }
}

export default new CopilotCli()
