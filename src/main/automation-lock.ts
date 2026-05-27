export type AutomationOwner = 'idle' | 'reply-engine' | 'contact-sync' | 'future-task'

export interface AutomationLockSnapshot {
  owner: AutomationOwner
  acquiredAt: string | null
}

export interface AutomationAcquireResult {
  ok: boolean
  owner: AutomationOwner
  message?: string
}

class AutomationLock {
  private owner: AutomationOwner = 'idle'
  private acquiredAt: string | null = null

  acquire(owner: Exclude<AutomationOwner, 'idle'>): AutomationAcquireResult {
    if (this.owner !== 'idle') {
      return {
        ok: false,
        owner: this.owner,
        message: this.createBusyMessage(owner, this.owner)
      }
    }

    this.owner = owner
    this.acquiredAt = new Date().toISOString()
    return { ok: true, owner }
  }

  release(owner: Exclude<AutomationOwner, 'idle'>): void {
    if (this.owner !== owner) return
    this.owner = 'idle'
    this.acquiredAt = null
  }

  snapshot(): AutomationLockSnapshot {
    return { owner: this.owner, acquiredAt: this.acquiredAt }
  }

  private createBusyMessage(
    requested: Exclude<AutomationOwner, 'idle'>,
    current: AutomationOwner
  ): string {
    if (requested === 'contact-sync' && current === 'reply-engine') {
      return '自动回复正在运行，请先停止回复引擎再同步联系人。'
    }
    if (requested === 'reply-engine' && current === 'contact-sync') {
      return '联系人同步正在运行，请等待同步结束或先停止同步。'
    }
    return '已有自动化任务正在运行，请稍后再试。'
  }
}

export const automationLock = new AutomationLock()
