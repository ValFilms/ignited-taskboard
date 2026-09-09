# Ignited Content Co. — version 1

Internal delivery workspace for the agency's mobile-detailing clients. GitHub owns source; Vercel hosts Next.js. Supabase provides Auth, private raw-footage storage, and a durable workspace record. No live data is bundled in source.

## Access

The primary owner is the only ad approver. Yaniv is a manager with full board, clients, tasks and settings access. Editors and campaign specialists see only their assigned tasks and related client context/files, with contact email, phone, Closebot setup and onboarding/payment details redacted. Server endpoints verify Supabase identity and current membership on each request. Anonymous and authenticated database roles cannot access workspace tables directly; server service credentials never reach the browser. File access uses short-lived signed URLs after the same visibility check.

## Delivery

1. Google Form submission creates an Onboarding client with all checklist items incomplete. Required source fields: stable submission ID, business name, person, email, location. Form receipt is separate from onboarding completion.
2. Owners confirm ad-account access, GHL setup, GHL training and business intake. Completion notifies both owners that filming can start.
3. Owners upload raw location shout-out videos directly. Successful upload verification creates the editing task, assigned to the configured editor, due in 24 elapsed hours.
4. Editor submits a Google Drive **folder** containing the edited videos; individual file links remain supported. The same editing task enters review, its due date becomes null, and overdue/approaching alerts stop. The primary owner is notified. Folders open in Drive for review; individual files retain their embedded preview and direct link. Link-sharing resource keys are preserved. John must share access with the reviewer; the app does not change Drive permissions or sync folder contents.
5. Only the primary owner approves or requests revisions. Revision notes are required; revisions restart the task with a fresh six elapsed hours. No immediate six-hour warning duplicates the assignment notice. Resubmission pauses again.
6. Approval completes editing and assigns campaign setup, due in 24 elapsed hours. Campaign work happens externally. Assigned specialist marks setup complete. This automatically creates one client-linked task for Yaniv to integrate Closebot with GHL and the Facebook account, with an inbox notification and push for subscribed devices. It has no deadline and uses the team task completion/reassignment controls; the client owner receives completion updates. The member's unique first name resolves Yaniv's actual account ID; missing or ambiguous membership stops completion with a setup error. Existing completed campaigns are not backfilled. This follow-up does not add a new launch prerequisite or perform the external integrations itself.
7. Ready to launch is a hold. Either owner confirms the client call and external payment/card setup, then records actual ads launched. No card data or charges are handled here.
8. Actual launch starts a 14-day timer. Both owners receive an in-app trial review reminder three days before the end. They record continue at $530/month or close; no billing integration is implied.
9. Continued clients receive owner-assigned progress-update tasks every 84 hours (3½ days), with first task after 60 hours and a 24-hour completion deadline. One outstanding task per client prevents backlog duplication. Owners should still maintain at least two updates weekly; late completion does not count as meeting that service target.

## Client progress board

The Active stage displays one summary card with the number of matching clients,
including a zero state. It opens a separate, alphabetically ordered active-client
list with name/location search and owner filtering. Board filters carry into this
list, which shows the matching and total active counts and offers Clear filters.
Each client opens the existing detail drawer; closing it preserves the list and
filters. Back to board restores the kanban. Stage changes automatically update
group membership and counts. This is presentation only: individual client records,
tasks, reminders and visibility rules remain the source of truth.

## Ownership and reminders

All configured teammates may create custom tasks for any teammate, including
themselves. A custom task can be general or linked to a currently accessible,
non-closed client, with a required title, optional instructions and optional future
deadline. The creator and owners can edit or reassign it; the creator, assignee
and owners can complete or reopen it.
Creators retain visibility of tasks they requested; assignees receive the related
client context with the same private-field redaction as existing staff access.
The name/role directory is visible to every teammate for choosing assignees.
Other people's unrelated tasks remain hidden. Custom tasks do not advance client
stages or change the ad approval rules. Completion notifies the other participant.

Task assigners (the saved creator), Yaniv and Val (the manager and approver roles)
may edit task titles, instructions, assignees and open-task deadlines, and delete
or restore tasks. This applies to custom and workflow tasks. Workflow assignees
must retain the matching role, review deadlines stay paused, and completed tasks
keep their assignee and deadline. Manually created custom tasks can change their
client to another accessible, non-closed client or General team task, including
after completion. Their ID, comments, assignee, deadline and completion stay intact
unless another editable field is also changed. Omitting the client in an edit keeps
the existing link; keeping an already-closed client is allowed. Client context and
file access follow the new link under the existing visibility rules, and both old
and new client activity record the move. Automatic editing, campaign, progress-update
and campaign-linked Closebot tasks keep their original client. Editing cannot change
a task's kind, creator, completion or approval state. Legacy workflow tasks without a recorded
creator are managed by owners; new workflow assignments record the triggering
owner, or the client owner for scheduled tasks. Receiving a task does not grant
editing/deletion rights. All permissions are checked by the server.

Delete moves a task into **My work → Archive** after confirmation. Optional archive
metadata stays with the original task; nothing is permanently erased. Archived
tasks keep their original status, deadline, assignment and comments, but leave
active/completed lists, approval queues and task counts. Their reminders and pending
task notifications stop. Comments remain readable under the same visibility rules
and are read-only until restoration. Archive supports search and newest-first order.
The task's assigner and both owners can restore it; other participants can read it.

Archiving a workflow task does not advance the client stage. Restoration requires
the corresponding stage and no newer active task for the same step. Closed clients
cannot resume archived open work. Archiving a recurring progress update skips that
occurrence; a future scheduled occurrence can still appear, without immediately
recreating the deleted task. A completed task restores as completed. Original
overdue deadlines remain overdue after restoration and can then be edited.

Edit/delete/restore requests include the task snapshot version. A concurrent task
change rejects the stale action instead of overwriting the newer work, including
during database save retries. Successful changes record the actor/time, retain
comments and activity, and notify other task participants. No schema migration or
external-service configuration is required.

Profile controls open settings, the inbox, personal work, appearance and sign-out.
Every teammate can change their own password in Settings using their current
password, a new password of 8–256 characters, and matching confirmation. The
server verifies team membership and reauthenticates the signed-in account before
updating it through Supabase Auth. Usernames and assignments remain unchanged.
The demo validates sample input but never saves passwords. Forgotten-password
recovery and changing another member's password are not part of this flow.
Phone navigation stays at the bottom; client stages stack vertically on phones.
Web Push device subscriptions and server delivery are described in [PUSH.md](docs/PUSH.md).
Notification settings include personal setup instructions for the roster names
Karl (Vivo Y04s, Android 15/Funtouch OS 15) and John (Galaxy A07, Android 16).
These are the phones provided by the owner, not detected hardware. Instructions
cover Chrome, Android permission, battery restrictions and a real-device delivery
check. Enable/test controls and status always apply to the current device;
Check device status rereads browser permission and the account's subscription
after returning from phone settings. Other members retain the general guide.

New clients default to the primary owner. Assignment to Yaniv is manual and reversible. Automatic load balancing was not confirmed. Daily campaign reminders and ad-refresh reminders are omitted. Task notices are in-app; approaching reminders go to assignee and primary owner six hours before deadline, overdue reminders at/after due. Each reminder has a stable task/cycle/recipient key to prevent duplicates. A five-minute external scheduler is required for unattended delivery. Deadlines use UTC elapsed time and display in each viewer's local timezone.

## Team messaging and task comments

Every current teammate can use shared team chat or private one-to-one text
conversations. The messenger has a searchable conversation list, message bubbles,
unread counts, a bottom composer, and a full-screen conversation view on phones.
Drafts survive switching conversations while the messenger remains open. Desktop
Enter sends, Shift+Enter inserts a newline; phone keyboards retain newline entry.
Messages are plain text, up to 4,000 characters. History is retained, with the
latest 50 shown first and an option to reveal older messages.

All task types, including completed tasks, support comments and @first-name
mentions. Owners, the assignee and creator can access a task conversation;
reassignment revokes a former assignee's access unless they are also its creator
or an owner. Mentioning someone never grants access. Private conversations are
returned only to their two participants, including when another viewer is an
owner. Database administrators still have administrative storage access.

Team messages notify other teammates, direct messages notify their recipient,
and task comments notify other task participants. Mentions change the alert text
without duplicating alerts. Existing Web Push sends generic notifications to
enabled recipient devices; message text is never included in the push payload.
Opening a visible conversation at its latest messages marks its own alerts read.
Chat/task views poll every five seconds while visible; this is not typing presence
or instantaneous streaming. No read receipts, attachments, voice calls, message
editing/deletion, end-to-end encryption, or offline sending are included.

Messages use an optional field in the existing private workspace record. No SQL
migration or separate messaging service is required. API checks derive authors,
times and recipients, and client message IDs make retries idempotent. The same
single-record storage scale limits below apply to message history.

## First-time teammate walkthrough

After sign-in, teammates without a saved completion are offered a hands-on tour.
The practice workspace renders the same Workspace, task dialogs, client drawer,
chat and settings components as the app. A persistent guide highlights each real
control; Next unlocks when the navigation or action succeeds. It covers received
tasks, comments and mentions, completion, assigning to another teammate, tracking
requested work, team/private chat, the inbox and profile/settings. Role-specific
steps cover John’s Drive-folder submission, Karl’s campaign handoff, Yaniv’s
onboarding/integration work, and Val’s checklist, revision, approval and launch.
The upload and push steps explain the real controls without requiring external
files or device permission in practice. The sample editor’s resubmission during
the approval lesson is explicitly identified as a practice simulation.

Practice uses a new fictional state per run and the normal workflow validator;
it never calls workspace, Auth, file or push APIs. The original workspace is inert
and its polling pauses while the tutorial is open. Practice messages/notices stay
in memory, with pop-ups suppressed so they cannot cover the guide. Exit discards
the run; Return to step helps recover after closing a dialog. The guide moves into
native task dialogs/client drawers and compacts on phone input focus. Instructions
can be expanded again. The base workspace components and permissions are shared.

Finishing practice discards its state and explicitly returns to real account setup
for optional device push and a personal password. The verified-current-password
flow saves tutorial version 1 in Auth metadata in the same password update; invalid
or failed changes leave setup incomplete. The preference follows the account and
is never an authorization control. Completion from v5 is respected. Settings
offers a replay, and completed teammates do not have to change their password again.
Finish later leaves setup incomplete for the next sign-in/reload. Demo completion
is in memory and real passwords are never changed.

## Intake and external systems

The Google Form is authoritative. GHL remains the separate sales system; Closebot booking remains external. No Stripe matching, roster import, automatic charging or client-specific checkout generation. Form response ID replays are ignored; matching email + business name with a different response ID requires manual duplicate review. Historical imports use historical=true and send no old assignment notices. Confirm actual Form/Sheet column names before wiring.

## Deployment state and limits

Without Supabase public configuration, a clearly labeled demo uses fictional data held in memory for one browser session. Role switching is available only in that demo. No uploads, email, push or live sync are simulated as successful. With Supabase configured, the app requires sign-in and the demo disappears. Production activation requires the SQL schema, private bucket, registered team Auth users, environment secrets and verified scheduler/form setup. Web Push additionally requires VAPID sender configuration and each device's permission/subscription. Email and automatic Drive folder sync are future work. No public signup or automatic team invitations.

The version-one durable store uses a single JSON workspace record with optimistic version checks and retry to prevent lost updates. Appropriate for a small internal team, not an unbounded CRM. Notifications/activity are retained; archive/retention policy and normalized tables are future scale work.
