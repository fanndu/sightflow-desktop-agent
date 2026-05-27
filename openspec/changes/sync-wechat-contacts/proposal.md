## Why

SightFlow should remain a focused WeChat automation controller rather than a broad operations dashboard. Users need a compact way to sync macOS desktop personal WeChat contacts, then inspect the synced contact list in a separate window without making the main floating controller complex.

## What Changes

- Add macOS-only desktop personal WeChat contact synchronization using RPA/VLM.
- Add a standalone contact sync chain separate from the existing reply engine and `RPADevice` reply workflow.
- Add a compact main controller card for contact sync with sync status, counts, and actions.
- Add a separate contact list window opened from the main controller for viewing synced contacts and sync failures.
- Extract each contact from the WeChat right-side detail panel after clicking a contact row.
- Read nickname, WeChat ID, remark, tags, region, and source from the detail panel.
- Use WeChat ID as the stable contact identifier.
- Enforce mutual exclusion so contact sync, reply automation, and other desktop automation cannot run at the same time.
- Do not support Windows, Enterprise WeChat, CSV export, non-Chinese WeChat UI, or direct local WeChat database extraction in this change.

## Capabilities

### New Capabilities

- `wechat-contact-sync`: macOS desktop personal WeChat contact sync using a dedicated RPA/VLM flow, local persistence, progress reporting, and a compact controller plus separate contact viewer.

### Modified Capabilities

- None.

## Impact

- Main process: new contact sync controller, IPC handlers, progress events, and automation mutex integration.
- Core automation: new contact sync modules for macOS WeChat contacts tab/list/detail panel actions.
- VLM prompts: new prompt families for contacts layout, visible list extraction, and right-side contact detail extraction.
- Local data: new persisted WeChat contacts and sync run metadata keyed by WeChat ID.
- Renderer: main window should remain a small WeChat controller; contact results should appear in a separate contact viewer window.
- Permissions: relies on existing macOS Accessibility and Screen Recording permission model.
