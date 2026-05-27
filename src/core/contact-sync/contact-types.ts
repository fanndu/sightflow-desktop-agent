export type ContactSyncStage =
  | 'idle'
  | 'prepare'
  | 'open-contacts'
  | 'detect-list'
  | 'scan-visible-contacts'
  | 'open-detail'
  | 'extract-detail'
  | 'save'
  | 'skip'
  | 'fail'
  | 'scroll-next'
  | 'complete'
  | 'stopped'
  | 'failed'

export type ContactSyncOutcome = 'success' | 'incomplete' | 'skipped' | 'failed'

export type WechatContactStatus = 'complete' | 'incomplete'

export type ContactFailureReason =
  | 'non_personal'
  | 'existing'
  | 'missing_wechat_id'
  | 'missing_nickname'
  | 'not_detail_page'
  | 'click_failed'
  | 'extract_failed'
  | 'window_not_found'
  | 'permission_required'
  | 'unsupported_platform'
  | 'stopped'
  | 'unknown'

export interface WechatContactRecord {
  wechatId: string
  nickname: string
  remark: string
  tags: string[]
  region: string
  source: string
  status: WechatContactStatus
  missingFields: string[]
  lastSyncedAt: string
}

export interface WechatContactFailure {
  id: string
  visibleName: string
  wechatId?: string
  reason: ContactFailureReason
  message: string
  stage: ContactSyncStage
  occurredAt: string
}

export interface ContactSyncCounts {
  totalSeen: number
  saved: number
  incomplete: number
  skipped: number
  failed: number
}

export interface ContactSyncRunMetadata {
  runId: string
  startedAt: string
  endedAt?: string
  status: 'running' | 'complete' | 'stopped' | 'failed'
  counts: ContactSyncCounts
  failures: WechatContactFailure[]
  lastStage: ContactSyncStage
  error?: string
}

export interface ContactSyncState {
  running: boolean
  stage: ContactSyncStage
  currentContact: string | null
  counts: ContactSyncCounts
  failures: WechatContactFailure[]
  startedAt: string | null
  endedAt: string | null
  error: string | null
}

export interface ContactSyncProgress extends ContactSyncState {
  message?: string
}

export interface ContactListSummary {
  total: number
  complete: number
  incomplete: number
  failures: number
}

export interface ContactListResult {
  contacts: WechatContactRecord[]
  failures: WechatContactFailure[]
  summary: ContactListSummary
  latestRun: ContactSyncRunMetadata | null
}

export interface ContactDetailDraft {
  nickname: string
  wechatId: string
  remark?: string
  tags?: string[] | string
  region?: string
  source?: string
  pageType?: string
  missingFields?: string[]
}
