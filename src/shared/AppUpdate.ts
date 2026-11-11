export type AppUpdateAction = 'snapshot' | 'reset' | 'check' | 'download' | 'install'

export type AppUpdateState = {
  phase:
    | 'idle'
    | 'checking'
    | 'current'
    | 'available'
    | 'downloading'
    | 'downloaded'
    | 'installing'
    | 'error'
  currentVersion: string
  version: string
  source: string
  percent: number
  transferred: number
  total: number
  releaseNotes: string
  error: string
}

/** 更新源为目录 URL，保留部署子路径，空源不回退到公共地址。 */
export function normalizeUpdateSource(source: string): string {
  if (!source.trim()) return ''
  const url = new URL(source.trim())
  if (
    !['http:', 'https:'].includes(url.protocol) ||
    url.username ||
    url.password ||
    url.search ||
    url.hash
  ) {
    throw new Error('更新地址须为 HTTP 或 HTTPS 目录，不能包含账号、查询参数或片段')
  }
  if (/\.ya?ml$/i.test(url.pathname)) throw new Error('请输入更新目录地址，省略 latest.yml 文件名')
  url.pathname = url.pathname.replace(/\/+$/, '') + '/'
  return url.href
}
