import {
  ContactDetailDraft,
  ContactListResult,
  ContactListSummary,
  ContactSyncRunMetadata,
  WechatContactFailure,
  WechatContactRecord
} from './contact-types'

const CONTACTS_KEY = 'wechatContacts.records'
const LATEST_RUN_KEY = 'wechatContacts.latestRun'

export interface StoreLike {
  get(key: string): unknown
  set(key: string, value: unknown): void
}

export function normalizeWechatId(value: unknown): string {
  return String(value || '').trim()
}

export function normalizeText(value: unknown): string {
  return String(value || '').trim()
}

export function normalizeTags(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.map((item) => normalizeText(item)).filter(Boolean)
  }
  const text = normalizeText(value)
  if (!text) return []
  return text
    .split(/[、,，\s]+/g)
    .map((item) => item.trim())
    .filter(Boolean)
}

export function validateContactDetail(detail: ContactDetailDraft): {
  ok: boolean
  missingFields: string[]
  message?: string
} {
  const missingFields: string[] = []
  if (!normalizeWechatId(detail.wechatId)) missingFields.push('wechatId')
  if (!normalizeText(detail.nickname)) missingFields.push('nickname')

  if (detail.pageType && detail.pageType !== 'contact_detail') {
    return { ok: false, missingFields, message: '当前页面不是微信联系人详情页' }
  }

  return {
    ok: missingFields.length === 0,
    missingFields,
    message: missingFields.length ? `缺少字段: ${missingFields.join(', ')}` : undefined
  }
}

export function createContactRecord(
  detail: ContactDetailDraft,
  now = new Date()
): WechatContactRecord {
  const validation = validateContactDetail(detail)
  const optionalMissing = ['remark', 'tags', 'region', 'source'].filter((key) => {
    if (key === 'tags') return normalizeTags(detail.tags).length === 0
    return !normalizeText((detail as unknown as Record<string, unknown>)[key])
  })
  const missingFields = Array.from(
    new Set([...(detail.missingFields || []), ...validation.missingFields, ...optionalMissing])
  )

  return {
    wechatId: normalizeWechatId(detail.wechatId),
    nickname: normalizeText(detail.nickname),
    remark: normalizeText(detail.remark),
    tags: normalizeTags(detail.tags),
    region: normalizeText(detail.region),
    source: normalizeText(detail.source),
    status: optionalMissing.length === 0 ? 'complete' : 'incomplete',
    missingFields,
    lastSyncedAt: now.toISOString()
  }
}

export class ContactStore {
  constructor(private readonly store: StoreLike) {}

  listContacts(): WechatContactRecord[] {
    const records = this.readRecords()
    return Object.values(records).sort((a, b) => a.nickname.localeCompare(b.nickname, 'zh-Hans-CN'))
  }

  hasContact(wechatId: string): boolean {
    return Boolean(this.readRecords()[normalizeWechatId(wechatId)])
  }

  upsertContact(record: WechatContactRecord): void {
    const records = this.readRecords()
    records[record.wechatId] = record
    this.store.set(CONTACTS_KEY, records)
  }

  getLatestRun(): ContactSyncRunMetadata | null {
    const raw = this.store.get(LATEST_RUN_KEY)
    if (!raw || typeof raw !== 'object') return null
    return raw as ContactSyncRunMetadata
  }

  saveRun(run: ContactSyncRunMetadata): void {
    this.store.set(LATEST_RUN_KEY, run)
  }

  listFailures(): WechatContactFailure[] {
    return this.getLatestRun()?.failures || []
  }

  getSummary(): ContactListSummary {
    const contacts = this.listContacts()
    const complete = contacts.filter((record) => record.status === 'complete').length
    return {
      total: contacts.length,
      complete,
      incomplete: contacts.length - complete,
      failures: this.listFailures().length
    }
  }

  getListResult(): ContactListResult {
    return {
      contacts: this.listContacts(),
      failures: this.listFailures(),
      summary: this.getSummary(),
      latestRun: this.getLatestRun()
    }
  }

  private readRecords(): Record<string, WechatContactRecord> {
    const raw = this.store.get(CONTACTS_KEY)
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {}
    return raw as Record<string, WechatContactRecord>
  }
}
