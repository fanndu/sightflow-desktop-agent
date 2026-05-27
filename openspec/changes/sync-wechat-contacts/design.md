## Context

SightFlow should behave like a compact WeChat automation controller, not a broad operations dashboard. The current app already has macOS desktop automation primitives for WeChat reply workflows: window discovery, screenshots, VLM layout recognition, RobotJS actions, main-process IPC, renderer events, and local settings. Contact sync needs those low-level primitives, but it is not the same workflow as auto-reply.

The contact sync flow must operate on macOS desktop personal WeChat with Chinese UI. It opens the WeChat contacts tab, scans the contact list, opens each personal contact in the right-side detail panel, extracts structured contact fields, and persists valid contacts by WeChat ID. It must not run while reply automation or any other desktop automation flow is active.

The UI should stay small and tool-like. The main window should show status and actions; the full contact table should live in a separate contact viewer window opened from the controller.

## Goals / Non-Goals

**Goals:**

- Keep the main app as a small WeChat controller/floating utility.
- Add a dedicated contact sync chain separate from `RPADevice` and the reply session.
- Support only macOS desktop personal WeChat in Chinese UI.
- Read nickname, WeChat ID, remark, tags, region, and source from the right-side contact detail panel.
- Use WeChat ID as the stable contact ID.
- Persist contacts and latest sync metadata locally.
- Add a contact viewer window for search, table viewing, and failure inspection.
- Enforce mutual exclusion between contact sync, reply automation, and future desktop automation operations.

**Non-Goals:**

- No Windows support in this change.
- No Enterprise WeChat support.
- No CSV export.
- No direct local WeChat database/file extraction.
- No support for non-Chinese WeChat UI.
- No broad dashboard, Xiaohongshu, or multi-channel operations UI in this change.

## Decisions

### Decision: Use a separate Contact Sync chain

Add modules under a dedicated contact sync area:

```text
src/core/contact-sync/
  contact-types.ts
  contact-store.ts
  mac-wechat-contact-device.ts
  mac-wechat-contact-vision.ts
  wechat-contact-sync-session.ts
```

The reply engine continues to use its existing runtime/session/device path. Contact sync gets its own session state machine.

Rationale: Contact sync has different stages, success criteria, storage, and progress UI from reply automation. Separating the chains preserves the small-controller product model and avoids overloading `RPADevice`.

Alternative considered: adding contact methods to `RPADevice`. Rejected because `RPADevice` is currently the reply device and would become a mixed-purpose automation object.

### Decision: Main controller stays compact

The main window should return to a small controller shape, approximately:

```text
SightFlow WeChat Controller
  WeChat Status
  Auto Reply
  Contact Sync
  Runtime Log
  Settings / Permission Check
```

The contact sync card includes:

```text
Contacts count
Profile completeness
Sync failures
Last synced time
[Sync Contacts] [View Contacts]
```

Rationale: The app's job is controlling WeChat automation, not replacing a CRM dashboard. Contact tables are too dense for the main floating controller.

Alternative considered: embedding the full contact table in the main window. Rejected because it would make the tool feel like a heavy dashboard again.

### Decision: Contact viewer is a separate window

Add a contact viewer window opened by `View Contacts`.

It should contain:

```text
Search by nickname / WeChat ID / remark
Optional failure-only filter
Contact table:
  nickname, WeChat ID, remark, tags, region, source, status, last synced time
Footer summary:
  total contacts, complete records, incomplete records, failures
```

Rationale: Contact review is a secondary task that needs more horizontal space and should not crowd the controller.

Alternative considered: navigating the main window into a contacts route. Rejected for this phase because separate windows already match the app's settings-window pattern.

### Decision: WeChat ID is required for persistence

Persist contact records keyed by WeChat ID:

```ts
type WechatContactRecord = {
  id: string // `wechat:${wechatId}`
  wechatId: string
  nickname: string
  remark: string
  tags: string[]
  region: string
  source: string
  status: 'complete' | 'incomplete'
  firstSeenAt: number
  lastSeenAt: number
  detailSyncedAt: number
}
```

Required fields:

```text
wechatId
nickname
```

Optional fields:

```text
remark
tags
region
source
```

Rationale: The user confirmed WeChat ID is stable and will not change. Contacts without WeChat ID cannot be safely deduplicated.

### Decision: Use three VLM prompt families

The implementation should define separate VLM prompts:

1. Contacts layout prompt
   - Detect contacts tab/button, contacts list region, and right-side detail panel region.
2. Visible list prompt
   - Extract visible personal contact candidates and click coordinates.
   - Skip headings and non-personal entries like new friends, group chats, tags, and public accounts.
3. Detail panel prompt
   - Validate the right-side panel is a contact detail page.
   - Extract nickname, WeChat ID, remark, tags, region, and source.
   - Return strict JSON.
   - Never guess missing fields.

The final detail prompt should be generated from user-provided screenshots before implementation.

Rationale: These are different perception problems. Isolating prompts makes failures easier to diagnose and retry.

### Decision: Use an automation mutex

The main process owns a single desktop automation mutex:

```text
idle
 ├─ reply-engine
 ├─ contact-sync
 └─ future-task
```

Contact sync cannot start while the reply engine is running. The reply engine cannot start while contact sync is running.

Rationale: Both flows use the same WeChat window, pointer, keyboard, screenshot source, and permissions. Concurrent execution is unsafe.

### Decision: Start fresh, skip existing contacts by default

Each sync starts scanning from the contacts list. If a detail extraction returns a WeChat ID already in local storage, skip it by default.

Rationale: This keeps recovery simple and avoids overwriting existing data. A future refresh mode can update existing contacts if needed.

## Risks / Trade-offs

- [Risk] VLM extraction may hallucinate fields. → Mitigation: require strict JSON, allow empty optional fields, require WeChat ID and nickname, and record malformed results as failures.
- [Risk] WeChat UI changes may break prompts. → Mitigation: scope to macOS personal WeChat Chinese UI and validate page type before extraction.
- [Risk] Scrolling may miss or duplicate rows. → Mitigation: dedupe by WeChat ID and visible row signatures; end only after repeated no-new-contact scans.
- [Risk] Sync may take a long time. → Mitigation: show current stage/contact and skip existing contacts by default.
- [Risk] User interaction may disrupt automation. → Mitigation: fail clearly, release the mutex, and allow rerun.
- [Risk] Personal contact data is sensitive. → Mitigation: only read visible UI fields through explicit user-triggered sync; no CSV export in this change.

## Migration Plan

- Add new storage with empty default state; no existing data migration is required.
- Replace the over-complex main dashboard with a compact WeChat controller as part of this change if it is still present.
- Add the separate contact viewer window without changing existing settings window behavior.
- Rollback by hiding contact sync controls and disabling the new IPC handlers; reply automation remains separate.

## Open Questions

- User still needs to provide screenshots of the WeChat right-side contact detail panel for final VLM prompt tuning.
- Exact visual layout of the compact controller can be refined during implementation, but it must remain a small utility rather than a large dashboard.
