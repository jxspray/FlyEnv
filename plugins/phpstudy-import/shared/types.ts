import type { AppHost } from '@shared/app'

export type SourceWebServer = 'nginx' | 'apache'

export type ImportCandidate = {
  key: string
  fingerprint: string
  sources: string[]
  webServers?: SourceWebServer[]
  phpVersion: string
  phpEndpoint: string
  host: AppHost
  warnings: string[]
  blockers: string[]
}

export type ScanResult = {
  directory: string
  candidates: ImportCandidate[]
  warnings: string[]
}

export type ImportSelection = {
  key: string
  fingerprint: string
  host: AppHost
  php: { bin: string; path: string; version: string; num: number }
  confirmed: boolean
}

export type ImportOutcome = {
  key: string
  name: string
  status: 'success' | 'failed' | 'skipped' | 'unknown'
  message: string
}

export type ImportProgress = {
  completed: number
  total: number
  current: string
  outcomes: ImportOutcome[]
}

export type ImportResult = ImportProgress & {
  backup: string
  warnings: string[]
}
