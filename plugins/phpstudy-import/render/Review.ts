import type { AppHost, SoftInstalled } from '@shared/app'
import type { ImportCandidate, ImportSelection, SourceWebServer } from '../shared/types'
import { candidateBlockers, duplicateSite } from '../fork/Runner'

export type ImportDraft = {
  candidate: ImportCandidate
  selected: boolean
  versionKey: string
  host: AppHost
}

export const versionKey = (version: Pick<SoftInstalled, 'bin' | 'version'>) =>
  `${version.bin}\n${version.version}`

export const sourceProblems = (draft: ImportDraft) => candidateBlockers(draft.host, draft.candidate)

export function createDraft(candidate: ImportCandidate, versions: SoftInstalled[]): ImportDraft {
  const exact = versions.find((version) => version.version === candidate.phpVersion)
  return {
    candidate,
    selected: candidate.blockers.length === 0,
    versionKey: exact ? versionKey(exact) : '',
    host: JSON.parse(JSON.stringify(candidate.host))
  }
}

export function draftProblems(
  draft: ImportDraft,
  drafts: ImportDraft[],
  versions: SoftInstalled[],
  existing: Pick<AppHost, 'name' | 'alias'>[]
): string[] {
  const problems = sourceProblems(draft)
  if (!versions.some((version) => versionKey(version) === draft.versionKey))
    problems.push('请安装或选择可用的 PHP 版本')
  const selectedPhp = versions.find((version) => versionKey(version) === draft.versionKey)
  if (
    selectedPhp &&
    drafts.some((other) => {
      const php = versions.find((version) => versionKey(version) === other.versionKey)
      return other.selected && php?.num === selectedPhp.num && php?.version !== selectedPhp.version
    })
  )
    problems.push('同一 PHP 主次版本请使用相同的完整版本')
  if (!draft.host.name.trim() || !draft.host.root.trim()) problems.push('域名和项目目录不能为空')
  if (duplicateSite(draft.host, existing)) problems.push('域名或别名已在 FlyEnv 中存在')
  if (
    duplicateSite(
      draft.host,
      drafts.filter((other) => other !== draft && other.selected).map((other) => other.host)
    )
  )
    problems.push('与其他选中站点的域名或别名重复')
  return problems
}

export function selectionOf(draft: ImportDraft, versions: SoftInstalled[]): ImportSelection {
  const php = versions.find((version) => versionKey(version) === draft.versionKey)
  if (!php?.version || !php.num) throw new Error('目标 PHP 版本不可用')
  return {
    key: draft.candidate.key,
    fingerprint: draft.candidate.fingerprint,
    host: JSON.parse(JSON.stringify(draft.host)),
    php: { bin: php.bin, path: php.path, num: php.num, version: php.version },
    // 点击确认导入即确认当前选择及版本快照。
    confirmed: true
  }
}

export type SiteFilters = {
  domain: string
  phpVersion: string
  webServer: SourceWebServer | ''
}

/** 兼容旧扫描结果的路径信息，新结果直接使用结构化的来源服务。 */
export function candidateWebServers(candidate: ImportCandidate): SourceWebServer[] {
  if (candidate.webServers) return candidate.webServers
  const servers: SourceWebServer[] = ['nginx', 'apache']
  const sources = candidate.sources.map((path) => path.replace(/\\/g, '/').toLowerCase())
  return servers.filter((server) =>
    sources.some((path) => new RegExp(`(?:^|/)${server}[^/]*/conf/vhosts/`).test(path))
  )
}

export function filterDrafts(drafts: ImportDraft[], filters: SiteFilters): ImportDraft[] {
  const domain = filters.domain.trim().toLowerCase()
  return drafts.filter((draft) => {
    const names = `${draft.host.name}\n${draft.host.alias}`.toLowerCase()
    return (
      names.includes(domain) &&
      (!filters.phpVersion || (draft.candidate.phpVersion || '未识别') === filters.phpVersion) &&
      (!filters.webServer || candidateWebServers(draft.candidate).includes(filters.webServer))
    )
  })
}

/** 新选入的行必须可用，已有选择始终能够取消。 */
export function visibleSelection(drafts: ImportDraft[]) {
  const eligible = drafts.filter((draft) => !sourceProblems(draft).length)
  const selectedCount = drafts.filter((draft) => draft.selected).length
  const checked = selectedCount > 0 && eligible.every((draft) => draft.selected)
  return {
    eligible,
    checked,
    indeterminate: selectedCount > 0 && !checked,
    disabled: eligible.length === 0 && selectedCount === 0
  }
}
