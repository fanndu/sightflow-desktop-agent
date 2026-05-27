## ADDED Requirements

### Requirement: Compact WeChat controller
The system SHALL present the main application as a compact WeChat automation controller rather than a broad operations dashboard.

#### Scenario: Main controller shows focused WeChat controls
- **WHEN** the user opens the main app window
- **THEN** the system shows WeChat status, auto-reply controls, contact sync controls, runtime log, settings access, and permission status without Xiaohongshu or broad operations dashboard sections

#### Scenario: Contact sync controls are visible
- **WHEN** the main controller loads
- **THEN** the system shows a contact sync card with contacts count, profile completeness, sync failures, last sync time, a sync contacts action, and a view contacts action

### Requirement: Separate contact viewer window
The system SHALL provide a separate contact viewer window for synced WeChat contacts.

#### Scenario: User opens contact viewer
- **WHEN** the user clicks the main controller's view contacts action
- **THEN** the system opens a separate contact viewer window

#### Scenario: Contact viewer displays contacts
- **WHEN** synced contacts exist and the contact viewer opens
- **THEN** the viewer displays a searchable table with nickname, WeChat ID, remark, tags, region, source, status, and last synced time

#### Scenario: Contact viewer displays failures
- **WHEN** sync failures exist and the user enables the failure view or filter
- **THEN** the viewer displays failed sync items with failure reason and available context

### Requirement: Start macOS personal WeChat contact sync
The system SHALL allow the user to start contact sync for macOS desktop personal WeChat when WeChat is available, required permissions are granted, and no other automation task is running.

#### Scenario: Sync starts successfully
- **WHEN** the user starts contact sync on macOS with desktop personal WeChat open, Accessibility permission granted, Screen Recording permission granted, and no active automation task
- **THEN** the system starts a contact sync run and emits initial sync state

#### Scenario: Sync is blocked by unsupported platform
- **WHEN** the user starts contact sync on a non-macOS platform
- **THEN** the system does not start sync and reports that only macOS desktop personal WeChat is supported

#### Scenario: Sync is blocked by missing permissions
- **WHEN** the user starts contact sync without required macOS Accessibility or Screen Recording permission
- **THEN** the system does not start sync and reports permission-required guidance

### Requirement: Enforce automation mutual exclusion
The system MUST allow only one desktop automation operation to run at a time across contact sync, reply automation, and other automation tasks.

#### Scenario: Reply engine blocks contact sync
- **WHEN** the reply engine is running and the user starts contact sync
- **THEN** the system does not start contact sync and reports that another automation task is running

#### Scenario: Contact sync blocks reply engine
- **WHEN** contact sync is running and the user starts the reply engine
- **THEN** the system does not start the reply engine and reports that contact sync is running

### Requirement: Open WeChat contacts list
The system SHALL use RPA/VLM to open the desktop personal WeChat contacts tab and identify the contacts list region and right-side detail panel region.

#### Scenario: Contacts list is identified
- **WHEN** contact sync prepares the WeChat window
- **THEN** the system opens the contacts tab and identifies the contacts list region plus the right-side detail panel region

#### Scenario: Contacts list cannot be identified
- **WHEN** the contacts tab, contacts list, or right-side detail panel cannot be identified
- **THEN** the sync run fails at the task level and reports the failed stage

### Requirement: Scan visible contacts
The system SHALL extract visible personal contact candidates from the WeChat contacts list and skip non-personal entries.

#### Scenario: Personal contact candidates are extracted
- **WHEN** the visible contacts list contains personal contacts
- **THEN** the system extracts candidates with click targets for opening the right-side detail panel

#### Scenario: Non-personal entries are skipped
- **WHEN** the visible contacts list contains group headings, new-friend entry, group chat entry, tags entry, public account entry, or other non-personal entries
- **THEN** the system records those entries as skipped and does not open them as contact details

### Requirement: Extract right-side detail fields
The system SHALL click each personal contact candidate and extract nickname, WeChat ID, remark, tags, region, and source from the right-side contact detail panel using a dedicated VLM prompt.

#### Scenario: Required detail fields are extracted
- **WHEN** the right-side panel shows a contact detail page with nickname and WeChat ID
- **THEN** the system extracts nickname, WeChat ID, remark, tags, region, and source as structured data

#### Scenario: Optional detail fields are missing
- **WHEN** the detail page contains nickname and WeChat ID but omits remark, tags, region, or source
- **THEN** the system saves the contact with empty optional fields and marks the contact as incomplete

#### Scenario: Right-side panel is not a contact detail page
- **WHEN** the right-side panel does not show a personal contact detail page after clicking a candidate
- **THEN** the system records a failed item and continues according to retry policy

### Requirement: Persist contacts by WeChat ID
The system MUST use WeChat ID as the stable identifier for saved contacts and MUST NOT save a main contact record without WeChat ID.

#### Scenario: New contact is saved
- **WHEN** detail extraction returns a valid WeChat ID and nickname not already present in local storage
- **THEN** the system saves a new contact keyed by WeChat ID

#### Scenario: Existing contact is skipped
- **WHEN** detail extraction returns a WeChat ID already present in local storage and refresh mode is not enabled
- **THEN** the system records the item as skipped and leaves the existing contact unchanged

#### Scenario: Missing WeChat ID fails item
- **WHEN** detail extraction does not return a valid WeChat ID
- **THEN** the system does not save the item as a contact and records a failed item with a missing-WeChat-ID reason

### Requirement: Complete list scanning
The system SHALL continue scanning and scrolling through the contacts list until the end of the list is detected.

#### Scenario: New contacts appear after scroll
- **WHEN** the current visible contacts have been processed and scrolling reveals new contact candidates
- **THEN** the system processes the newly visible candidates and updates progress

#### Scenario: End of list is detected
- **WHEN** repeated scroll attempts produce no new visible contact signatures
- **THEN** the system completes the sync run and reports final counts

### Requirement: Report progress and outcomes
The system SHALL report sync state, current stage, current contact, and counts for discovered, successful, incomplete, skipped, and failed items to the renderer.

#### Scenario: Progress updates during sync
- **WHEN** contact sync changes stage, starts a contact, saves a contact, skips an item, or records a failure
- **THEN** the system emits progress with current stage and updated counts

#### Scenario: Final sync summary is emitted
- **WHEN** contact sync completes, is stopped, or fails at the task level
- **THEN** the system emits a terminal state with summary counts and failure details

### Requirement: Stop sync safely
The system SHALL allow the user to stop an active contact sync run and release the automation lock.

#### Scenario: Stop active sync
- **WHEN** the user stops an active contact sync run
- **THEN** the system stops at a safe boundary, emits a stopped state, and releases the automation lock

#### Scenario: Stop when not running
- **WHEN** the user requests stop and contact sync is not active
- **THEN** the system reports that no contact sync is running
