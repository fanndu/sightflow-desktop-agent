import {
  ContactSyncCounts,
  ContactSyncProgress,
  ContactSyncRunMetadata,
  ContactSyncStage,
  WechatContactFailure
} from './contact-types'
import { ContactStore, createContactRecord, validateContactDetail } from './contact-store'
import { ContactSyncStoppedError, MacWechatContactDevice } from './mac-wechat-contact-device'

function createCounts(): ContactSyncCounts {
  return { totalSeen: 0, saved: 0, incomplete: 0, skipped: 0, failed: 0 }
}

function createRunId(): string {
  return `wechat-contact-sync-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

export class WechatContactSyncSession {
  private stopRequested = false
  private state: ContactSyncProgress = {
    running: false,
    stage: 'idle',
    currentContact: null,
    counts: createCounts(),
    failures: [],
    startedAt: null,
    endedAt: null,
    error: null
  }
  private run: ContactSyncRunMetadata | null = null

  constructor(
    private readonly device: MacWechatContactDevice,
    private readonly store: ContactStore,
    private readonly onProgress: (state: ContactSyncProgress) => void
  ) {}

  getState(): ContactSyncProgress {
    return {
      ...this.state,
      counts: { ...this.state.counts },
      failures: [...this.state.failures]
    }
  }

  requestStop(): void {
    this.stopRequested = true
  }

  isStopRequested(): boolean {
    return this.stopRequested
  }

  async start(): Promise<ContactSyncProgress> {
    const startedAt = new Date().toISOString()
    this.run = {
      runId: createRunId(),
      startedAt,
      status: 'running',
      counts: createCounts(),
      failures: [],
      lastStage: 'prepare'
    }
    this.state = {
      running: true,
      stage: 'prepare',
      currentContact: null,
      counts: createCounts(),
      failures: [],
      startedAt,
      endedAt: null,
      error: null,
      message: '正在准备微信窗口'
    }
    this.emit()

    try {
      await this.setStage('prepare', '正在检查微信窗口')
      await this.device.prepareWindow()
      await this.checkStop()

      await this.setStage('open-contacts', '正在打开微信通讯录')
      await this.device.openContactsTab()
      await this.checkStop()

      await this.setStage('detect-list', '正在识别通讯录列表')
      await this.device.refreshLayout()
      await this.scanPages()

      await this.finish('complete', '同步完成')
      return this.getState()
    } catch (error: unknown) {
      if (error instanceof ContactSyncStoppedError || this.stopRequested) {
        await this.finish('stopped', '同步已停止')
        return this.getState()
      }
      await this.finish('failed', error instanceof Error ? error.message : String(error))
      return this.getState()
    }
  }

  private async scanPages(): Promise<void> {
    const processedSignatures = new Set<string>()
    let repeatedScrollAttempts = 0

    for (let page = 0; page < 200; page += 1) {
      await this.checkStop()
      await this.setStage('scan-visible-contacts', `正在扫描第 ${page + 1} 屏联系人`)
      const visible = await this.device.scanVisibleContacts()
      const signature = visible.pageSignature || `page-${page}`

      if (processedSignatures.has(signature)) {
        repeatedScrollAttempts += 1
        if (repeatedScrollAttempts >= 2) {
          this.emit('未检测到新的联系人列表，已停止翻页')
          return
        }
        await this.setStage('scroll-next', '当前列表未变化，正在重试翻页')
        await this.device.scrollContactsList()
        page -= 1
        continue
      }

      repeatedScrollAttempts = 0
      processedSignatures.add(signature)

      for (const candidate of visible.contacts) {
        await this.checkStop()
        this.state.counts.totalSeen += 1
        this.state.currentContact = candidate.visibleName

        if (!candidate.isPersonal) {
          this.recordFailure(
            candidate.visibleName,
            'non_personal',
            candidate.skipReason || '非个人联系人',
            'skip'
          )
          this.state.counts.skipped += 1
          this.emit('已跳过非个人联系人')
          continue
        }

        await this.setStage('open-detail', `正在打开 ${candidate.visibleName} 的详情`)
        await this.device.openContactDetail(candidate.rowBBox)

        await this.setStage('extract-detail', `正在读取 ${candidate.visibleName} 的详情`)
        const parsed = await this.device.extractCurrentDetail()
        if (!parsed.detail) {
          this.recordFailure(
            candidate.visibleName,
            'extract_failed',
            parsed.error || '详情页解析失败',
            'extract-detail'
          )
          this.state.counts.failed += 1
          continue
        }

        const validation = validateContactDetail(parsed.detail)
        if (!validation.ok) {
          const reason = validation.missingFields.includes('wechatId')
            ? 'missing_wechat_id'
            : validation.missingFields.includes('nickname')
              ? 'missing_nickname'
              : 'not_detail_page'
          this.recordFailure(
            candidate.visibleName,
            reason,
            validation.message || '详情字段不完整',
            'extract-detail'
          )
          this.state.counts.failed += 1
          continue
        }

        if (this.store.hasContact(parsed.detail.wechatId)) {
          this.state.counts.skipped += 1
          this.emit('已跳过已有微信号')
          continue
        }

        await this.setStage('save', `正在保存 ${candidate.visibleName}`)
        const record = createContactRecord(parsed.detail)
        this.store.upsertContact(record)
        if (record.status === 'complete') {
          this.state.counts.saved += 1
        } else {
          this.state.counts.incomplete += 1
        }
        this.emit('联系人已保存')
      }

      await this.setStage('scroll-next', '正在滚动到下一屏')
      await this.device.scrollContactsList()
    }
  }

  private async checkStop(): Promise<void> {
    this.device.assertNotStopped()
  }

  private async setStage(stage: ContactSyncStage, message: string): Promise<void> {
    this.state.stage = stage
    this.state.message = message
    if (this.run) this.run.lastStage = stage
    this.emit(message)
  }

  private recordFailure(
    visibleName: string,
    reason: WechatContactFailure['reason'],
    message: string,
    stage: ContactSyncStage
  ): void {
    const failure: WechatContactFailure = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      visibleName,
      reason,
      message,
      stage,
      occurredAt: new Date().toISOString()
    }
    this.state.failures.push(failure)
    this.emit(message)
  }

  private async finish(status: 'complete' | 'stopped' | 'failed', message: string): Promise<void> {
    const endedAt = new Date().toISOString()
    this.state.running = false
    this.state.stage = status
    this.state.endedAt = endedAt
    this.state.error = status === 'failed' ? message : null
    this.state.message = message
    if (this.run) {
      this.run.status = status
      this.run.endedAt = endedAt
      this.run.counts = { ...this.state.counts }
      this.run.failures = [...this.state.failures]
      this.run.lastStage = status
      this.run.error = this.state.error || undefined
      this.store.saveRun(this.run)
    }
    this.emit(message)
  }

  private emit(message?: string): void {
    this.onProgress({
      ...this.getState(),
      message: message || this.state.message
    })
  }
}
