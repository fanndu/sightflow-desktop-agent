import { AIClient } from '../ai-client'
import { getRobot, randomDelayIn } from '../rpa/util'
import { getWechatWindowInfo } from '../rpa/window-utils'
import { BBox } from '../rpa/vision-utils'
import {
  bboxCenterToScreen,
  ContactLayoutResult,
  detectContactDetail,
  detectContactLayout,
  detectVisibleContacts,
  VisibleContactsResult
} from './mac-wechat-contact-vision'
import { DetailParseResult } from './mac-wechat-contact-vision'

interface RobotController {
  moveMouse(x: number, y: number): void
  mouseClick(button?: string): void
  scrollMouse(x: number, y: number): void
}

const CONTACT_LIST_SCROLL_TICKS = 6
const CONTACT_LIST_SCROLL_DELTA = -35

export class ContactSyncStoppedError extends Error {
  constructor() {
    super('联系人同步已停止')
  }
}

export interface MacWechatContactDeviceState {
  layout: ContactLayoutResult | null
  windowBounds: { x: number; y: number; width: number; height: number } | null
  scaleFactor: number
}

export class MacWechatContactDevice {
  private layout: ContactLayoutResult | null = null
  private windowBounds: { x: number; y: number; width: number; height: number } | null = null
  private scaleFactor = 1

  constructor(
    private readonly aiClient: AIClient,
    private readonly shouldStop: () => boolean
  ) {}

  getState(): MacWechatContactDeviceState {
    return {
      layout: this.layout,
      windowBounds: this.windowBounds,
      scaleFactor: this.scaleFactor
    }
  }

  async prepareWindow(): Promise<void> {
    this.assertNotStopped()
    if (process.platform !== 'darwin') {
      throw new Error('联系人同步当前仅支持 macOS 桌面版个人微信。')
    }
    const info = await getWechatWindowInfo('wechat')
    if (!info?.bounds) {
      throw new Error('未找到微信窗口，请确保已打开且未被完全遮挡/最小化。')
    }
    this.windowBounds = info.bounds
    this.scaleFactor = info.display?.scaleFactor || 1
  }

  async openContactsTab(): Promise<void> {
    this.assertNotStopped()
    const detected = await detectContactLayout(this.aiClient)
    if (!detected.success || !detected.layout || !detected.bounds) {
      throw new Error(detected.error || '未识别到微信通讯录入口。')
    }
    this.layout = detected.layout
    this.windowBounds = detected.bounds
    this.scaleFactor = detected.scaleFactor || 1

    if (this.layout.contactsTab) {
      await this.clickBBox(this.layout.contactsTab)
      await randomDelayIn(450, 800)
      await this.refreshLayout()
    }
  }

  async refreshLayout(): Promise<ContactLayoutResult> {
    this.assertNotStopped()
    const detected = await detectContactLayout(this.aiClient)
    if (!detected.success || !detected.layout || !detected.bounds) {
      throw new Error(detected.error || '未识别到微信通讯录布局。')
    }
    this.layout = detected.layout
    this.windowBounds = detected.bounds
    this.scaleFactor = detected.scaleFactor || 1
    return this.layout
  }

  async scanVisibleContacts(): Promise<VisibleContactsResult> {
    this.assertNotStopped()
    const result = await detectVisibleContacts(this.aiClient)
    if (!result.success || !result.result) {
      throw new Error(result.error || '未识别到可见联系人列表。')
    }
    return result.result
  }

  async openContactDetail(rowBBox: BBox): Promise<void> {
    this.assertNotStopped()
    await this.clickBBox(rowBBox)
    await randomDelayIn(500, 900)
  }

  async extractCurrentDetail(): Promise<DetailParseResult> {
    this.assertNotStopped()
    return detectContactDetail(this.aiClient, this.layout?.detailRegion, this.requireWindowBounds())
  }

  async scrollContactsList(): Promise<void> {
    this.assertNotStopped()
    const robot = this.requireRobot()
    const bounds = this.requireWindowBounds()
    const listBBox = this.layout?.listRegion
    const [x, y] = listBBox
      ? bboxCenterToScreen(listBBox, bounds, this.scaleFactor)
      : [bounds.x + Math.round(bounds.width * 0.3), bounds.y + Math.round(bounds.height * 0.55)]

    robot.moveMouse(x, y)
    await randomDelayIn(60, 120)
    robot.mouseClick('left')
    await randomDelayIn(80, 140)
    for (let i = 0; i < CONTACT_LIST_SCROLL_TICKS; i += 1) {
      this.assertNotStopped()
      robot.scrollMouse(0, CONTACT_LIST_SCROLL_DELTA)
      await randomDelayIn(35, 70)
    }
    await randomDelayIn(900, 1300)
  }

  assertNotStopped(): void {
    if (this.shouldStop()) throw new ContactSyncStoppedError()
  }

  private async clickBBox(bbox: BBox): Promise<void> {
    const robot = this.requireRobot()
    const [x, y] = bboxCenterToScreen(bbox, this.requireWindowBounds(), this.scaleFactor)
    robot.moveMouse(x, y)
    await randomDelayIn(80, 160)
    robot.mouseClick('left')
  }

  private requireWindowBounds(): { x: number; y: number; width: number; height: number } {
    if (!this.windowBounds) throw new Error('微信窗口信息未准备好。')
    return this.windowBounds
  }

  private requireRobot(): RobotController {
    const robot = getRobot()
    if (!robot) throw new Error('鼠标键盘控制模块不可用，请确认依赖已正确打包。')
    return robot as RobotController
  }
}
