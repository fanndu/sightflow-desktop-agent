import { AIClient } from '../ai-client'
import { BBox, bboxToCropBounds, bboxToScreenCoords } from '../rpa/vision-utils'
import { captureWechatWindow } from '../rpa/screenshot-utils'
import { ContactDetailDraft } from './contact-types'

export interface ContactLayoutResult {
  contactsTab: BBox | null
  listRegion: BBox | null
  detailRegion: BBox | null
}

export interface VisibleContactCandidate {
  visibleName: string
  rowBBox: BBox
  isPersonal: boolean
  skipReason?: string
}

export interface VisibleContactsResult {
  contacts: VisibleContactCandidate[]
  pageSignature: string
}

export interface DetailParseResult {
  detail: ContactDetailDraft | null
  raw: unknown
  error?: string
}

const CONTACTS_LAYOUT_PROMPT = `你是 macOS 微信桌面端通讯录界面解析专家。

请观察截图，判断当前是否是微信主窗口，并找出：
1. 左侧导航栏里的【通讯录/联系人】按钮；
2. 中间联系人列表区域；
3. 右侧联系人详情面板区域。

只输出 JSON，不要解释：
{
  "contactsTab": [x1,y1,x2,y2] | null,
  "listRegion": [x1,y1,x2,y2] | null,
  "detailRegion": [x1,y1,x2,y2] | null
}

坐标使用截图归一化坐标 0-1000。`

const VISIBLE_CONTACTS_PROMPT = `你是 macOS 微信桌面端通讯录列表解析专家。

请只识别截图中【中间联系人列表】当前可见的条目。过滤公众号、群聊、企业/服务号、文件传输助手、微信团队等非个人联系人。

只输出 JSON，不要解释：
{
  "pageSignature": "用当前可见个人联系人名字拼出的稳定签名",
  "contacts": [
    {
      "visibleName": "列表中显示的名字",
      "rowBBox": [x1,y1,x2,y2],
      "isPersonal": true,
      "skipReason": ""
    }
  ]
}

如果看到非个人条目，也可以放入 contacts 并标记 isPersonal=false 和 skipReason。
坐标使用当前截图归一化坐标 0-1000。`

const CONTACT_DETAIL_PROMPT = `你是 macOS 微信桌面端【右侧联系人详情页】解析专家。

## 页面结构参考
右侧详情页通常是白色背景，顶部有头像、显示名、性别图标和“...”菜单；下面依次可能出现：
- 顶部基础资料：昵称、微信号、地区
- “朋友资料”：备注、电话、朋友权限等
- “朋友圈”缩略图
- “视频号”
- “更多信息”：个性签名、添加时间、来源/添加来源/添加方式等
- 底部按钮：发消息、语音聊天、视频聊天

## 识别规则
1. 只读取当前右侧详情面板，不要读取左侧会话/通讯录列表。
2. 如果当前不是个人微信联系人详情页，输出 pageType="not_contact_detail"。
3. nickname 优先读取“昵称：”后的值；如果没有“昵称：”，再用顶部头像右侧的显示名。
4. wechatId 只读取“微信号：”后的稳定 ID，不要把手机号、备注、显示名当作微信号。
5. remark 读取“朋友资料”里的“备注”字段；没有则空字符串。
6. tags 读取“标签”字段；没有则空数组。不要把个性签名、朋友权限、视频号当标签。
7. region 读取“地区：”后的完整地区文本，例如“北京 昌平”；没有则空字符串。
8. source 读取“来源 / 添加来源 / 添加方式”等字段；没有则空字符串。不要把“添加时间”当来源。
9. 忽略电话、朋友权限、朋友圈、视频号、个性签名、添加时间、底部按钮。
10. 如果某个字段在截图里看不清或不存在，保持空值，并把字段名放入 missingFields。

只输出 JSON，不要解释：
{
  "pageType": "contact_detail" | "not_contact_detail",
  "nickname": "",
  "wechatId": "",
  "remark": "",
  "tags": [],
  "region": "",
  "source": "",
  "missingFields": []
}

## 示例
如果页面显示：
昵称：A0000 下花园测漏水15033666196 小王
微信号：wxh1280955543
地区：北京 昌平
朋友资料 > 备注：A0000 下花园测漏水15033666196 小王

应输出：
{
  "pageType": "contact_detail",
  "nickname": "A0000 下花园测漏水15033666196 小王",
  "wechatId": "wxh1280955543",
  "remark": "A0000 下花园测漏水15033666196 小王",
  "tags": [],
  "region": "北京 昌平",
  "source": "",
  "missingFields": ["tags", "source"]
}`

function isBBox(value: unknown): value is BBox {
  return (
    Array.isArray(value) &&
    value.length === 4 &&
    value.every((item) => Number.isFinite(Number(item))) &&
    Number(value[2]) > Number(value[0]) &&
    Number(value[3]) > Number(value[1])
  )
}

function normalizeBBox(value: unknown): BBox | null {
  if (!isBBox(value)) return null
  return value.map((item) => Math.round(Number(item))) as BBox
}

function extractJson(text: string): unknown {
  const trimmed = text.trim()
  const fenced = /```(?:json)?\s*([\s\S]*?)```/i.exec(trimmed)
  const candidate = fenced?.[1]?.trim() || trimmed
  try {
    return JSON.parse(candidate)
  } catch {
    const objectStart = candidate.indexOf('{')
    const objectEnd = candidate.lastIndexOf('}')
    if (objectStart >= 0 && objectEnd > objectStart) {
      return JSON.parse(candidate.slice(objectStart, objectEnd + 1))
    }
    throw new Error('VLM 返回不是合法 JSON')
  }
}

function toRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {}
}

function toText(value: unknown): string {
  return String(value || '').trim()
}

function toTags(value: unknown): string[] {
  if (Array.isArray(value)) return value.map((item) => toText(item)).filter(Boolean)
  const text = toText(value)
  if (!text) return []
  return text
    .split(/[、,，\s]+/g)
    .map((item) => item.trim())
    .filter(Boolean)
}

export function parseContactLayoutResult(text: string): ContactLayoutResult {
  const data = toRecord(extractJson(text))
  return {
    contactsTab: normalizeBBox(data.contactsTab),
    listRegion: normalizeBBox(data.listRegion),
    detailRegion: normalizeBBox(data.detailRegion)
  }
}

export function parseVisibleContactsResult(text: string): VisibleContactsResult {
  const data = toRecord(extractJson(text))
  const contacts = Array.isArray(data.contacts) ? data.contacts : []
  const parsedContacts = contacts
    .map((item) => {
      const record = toRecord(item)
      const rowBBox = normalizeBBox(record.rowBBox)
      const visibleName = toText(record.visibleName)
      if (!rowBBox || !visibleName) return null
      return {
        visibleName,
        rowBBox,
        isPersonal: record.isPersonal !== false,
        skipReason: toText(record.skipReason)
      } satisfies VisibleContactCandidate
    })
    .filter(Boolean) as VisibleContactCandidate[]

  const pageSignature =
    toText(data.pageSignature) || parsedContacts.map((item) => item.visibleName).join('|')
  return { contacts: parsedContacts, pageSignature }
}

export function parseContactDetailResult(text: string): DetailParseResult {
  try {
    const raw = extractJson(text)
    const data = toRecord(raw)
    const pageType = toText(data.pageType)
    const detail: ContactDetailDraft = {
      pageType: pageType === 'contact_detail' ? 'contact_detail' : 'not_contact_detail',
      nickname: toText(data.nickname),
      wechatId: toText(data.wechatId),
      remark: toText(data.remark),
      tags: toTags(data.tags),
      region: toText(data.region),
      source: toText(data.source),
      missingFields: Array.isArray(data.missingFields)
        ? data.missingFields.map((item) => toText(item)).filter(Boolean)
        : []
    }
    return { detail, raw }
  } catch (error: unknown) {
    return {
      detail: null,
      raw: null,
      error: error instanceof Error ? error.message : String(error)
    }
  }
}

export async function detectContactLayout(aiClient: AIClient): Promise<{
  success: boolean
  layout?: ContactLayoutResult
  bounds?: { x: number; y: number; width: number; height: number }
  scaleFactor?: number
  error?: string
}> {
  const screenshot = await captureWechatWindow('wechat')
  if (!screenshot.success || !screenshot.screenshotBase64) {
    return { success: false, error: screenshot.error || '截图失败' }
  }
  const text = await aiClient.detectVision(CONTACTS_LAYOUT_PROMPT, screenshot.screenshotBase64)
  const layout = parseContactLayoutResult(text)
  return {
    success: Boolean(layout.contactsTab || layout.listRegion),
    layout,
    bounds: screenshot.bounds,
    scaleFactor: screenshot.display?.scaleFactor || 1,
    error: layout.contactsTab || layout.listRegion ? undefined : '未识别到微信通讯录布局'
  }
}

export async function detectVisibleContacts(
  aiClient: AIClient
): Promise<{ success: boolean; result?: VisibleContactsResult; error?: string }> {
  const screenshot = await captureWechatWindow('wechat')
  if (!screenshot.success || !screenshot.screenshotBase64) {
    return { success: false, error: screenshot.error || '截图失败' }
  }
  const text = await aiClient.detectVision(VISIBLE_CONTACTS_PROMPT, screenshot.screenshotBase64)
  const result = parseVisibleContactsResult(text)
  return { success: true, result }
}

export async function detectContactDetail(
  aiClient: AIClient,
  detailRegion?: BBox | null,
  windowBounds?: { width: number; height: number }
): Promise<DetailParseResult> {
  const crop =
    detailRegion && windowBounds ? bboxToCropBounds(detailRegion, windowBounds) : undefined
  const screenshot = await captureWechatWindow('wechat', crop)
  if (!screenshot.success || !screenshot.screenshotBase64) {
    return { detail: null, raw: null, error: screenshot.error || '截图失败' }
  }
  const text = await aiClient.detectVision(CONTACT_DETAIL_PROMPT, screenshot.screenshotBase64)
  return parseContactDetailResult(text)
}

export function bboxCenterToScreen(
  bbox: BBox,
  bounds: { x: number; y: number; width: number; height: number },
  scaleFactor: number
): [number, number] {
  return bboxToScreenCoords(bbox, bounds, scaleFactor)
}
