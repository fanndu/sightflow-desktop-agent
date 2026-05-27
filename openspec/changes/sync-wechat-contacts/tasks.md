## 1. UI Scope Reset

- [x] 1.1 Replace the broad operations dashboard with a compact WeChat controller main window.
- [x] 1.2 Remove Xiaohongshu and broad operations dashboard sections from the main UI.
- [x] 1.3 Add main controller sections for WeChat status, auto-reply, contact sync, runtime log, settings, and permission check.
- [x] 1.4 Restore a compact main window size appropriate for a floating utility/controller.

## 2. Contact Viewer Window

- [x] 2.1 Add a separate contact viewer BrowserWindow entry point or route.
- [x] 2.2 Add a `View Contacts` action in the main controller contact sync card.
- [x] 2.3 Render searchable contact table columns for nickname, WeChat ID, remark, tags, region, source, status, and last synced time.
- [x] 2.4 Add a failure view or filter for sync failures and their reasons.
- [x] 2.5 Add footer summary for total contacts, complete records, incomplete records, and failures.

## 3. Contact Data and Storage

- [x] 3.1 Add contact sync domain types for records, stages, progress counts, outcomes, failure reasons, and run metadata.
- [x] 3.2 Add local storage for WeChat contacts keyed by WeChat ID.
- [x] 3.3 Add local storage for latest sync run metadata and sync failure summaries.
- [x] 3.4 Add validation helpers that require WeChat ID and nickname while allowing empty remark, tags, region, and source.
- [x] 3.5 Add contact list/status read APIs for the renderer.

## 4. Automation Mutex

- [x] 4.1 Add a main-process automation mutex with idle, reply-engine, contact-sync, and future-task ownership.
- [x] 4.2 Make reply engine startup acquire the mutex and release it on stop/failure.
- [x] 4.3 Make contact sync startup acquire the mutex and release it on completion/stop/failure.
- [x] 4.4 Return clear busy errors when contact sync and reply automation conflict.

## 5. macOS WeChat Contact Device

- [x] 5.1 Create `src/core/contact-sync/` module structure separate from `RPADevice`.
- [x] 5.2 Implement macOS-only WeChat window preparation using existing window utilities and permission checks.
- [x] 5.3 Implement actions to open the WeChat contacts tab.
- [x] 5.4 Implement actions to click visible personal contact rows and wait for the right-side detail panel.
- [x] 5.5 Implement contacts list scrolling and visible-page signature collection.
- [x] 5.6 Implement safe stop checks at sync stage boundaries.

## 6. VLM Prompts and Parsers

- [x] 6.1 Add contacts layout prompt and parser for contacts tab, contacts list region, and right-side detail panel region.
- [x] 6.2 Add visible contact list prompt and parser for personal contact candidates and non-personal skipped entries.
- [x] 6.3 Generate the detail panel prompt from user-provided right-side detail screenshots.
- [x] 6.4 Add detail panel parser for nickname, WeChat ID, remark, tags, region, source, page type, and missing fields.
- [x] 6.5 Harden parsing for malformed JSON, missing WeChat ID, missing nickname, non-detail pages, and likely hallucinations.

## 7. Contact Sync Session

- [x] 7.1 Implement contact sync stages: prepare, open contacts, detect list, scan visible contacts, open detail, extract detail, save/skip/fail, scroll next, complete, stopped, and failed.
- [x] 7.2 Classify outcomes as success, incomplete, skipped, or failed.
- [x] 7.3 Skip existing contacts by WeChat ID by default.
- [x] 7.4 Detect end of list after repeated scrolls with no new visible contact signatures.
- [x] 7.5 Emit progress updates for stage, current contact, counts, skipped entries, failures, and terminal summary.

## 8. Main Process IPC

- [x] 8.1 Add IPC handlers for contact sync start, stop, status, and contact list retrieval.
- [x] 8.2 Add IPC or window event plumbing for contact sync progress and terminal state.
- [x] 8.3 Add IPC to open/focus the contact viewer window.
- [x] 8.4 Return user-facing errors for missing permissions, unsupported platform, busy automation, missing WeChat window, not running, and internal failures.

## 9. Verification

- [x] 9.1 Run typecheck and production build.
- [ ] 9.2 Verify the main window is compact and WeChat-only.
- [ ] 9.3 Verify contact viewer opens from the main controller.
- [ ] 9.4 Verify contact sync refuses to start without required macOS permissions.
- [ ] 9.5 Verify contact sync refuses to start while reply engine is running.
- [ ] 9.6 Verify reply engine refuses to start while contact sync is running.
- [ ] 9.7 Verify a manual sync run against macOS personal WeChat Chinese UI opens contacts, reads right-side details, saves valid contacts, skips non-personal entries, and reports failures.
- [ ] 9.8 Verify a second sync run skips existing WeChat IDs by default.
