# Ignited Content Co. — version 1

Internal delivery workspace for the agency's mobile-detailing clients. GitHub owns source; Vercel hosts Next.js. Supabase provides Auth, private raw-footage storage, and a durable workspace record. No live data is bundled in source.

## Access

The primary owner is the only ad approver. Yaniv is a manager with full board, clients, tasks and settings access. Editors and campaign specialists see only their assigned tasks and related client context/files, with contact email, phone, Closebot setup and onboarding/payment details redacted. Server endpoints verify Supabase identity and current membership on each request. Anonymous and authenticated database roles cannot access workspace tables directly; server service credentials never reach the browser. File access uses short-lived signed URLs after the same visibility check.

## Delivery

1. Google Form submission creates an Onboarding client with all checklist items incomplete. Required source fields: stable submission ID, business name, person, email, location. Form receipt is separate from onboarding completion.
2. Owners confirm ad-account access, GHL setup, GHL training and business intake. Completion notifies both owners that filming can start.
3. Owners upload raw location shout-out videos directly. Successful upload verification creates the editing task, assigned to the configured editor, due in 24 elapsed hours.
4. Editor submits a Google Drive **file** link. The same editing task enters review, its due date becomes null, and overdue/approaching alerts stop. The primary owner is notified. Drive embeds are shown with a direct-file fallback; permissions still belong to Drive.
5. Only the primary owner approves or requests revisions. Revision notes are required; revisions restart the task with a fresh six elapsed hours. No immediate six-hour warning duplicates the assignment notice. Resubmission pauses again.
6. Approval completes editing and assigns campaign setup, due in 24 elapsed hours. Campaign work happens externally. Assigned specialist marks setup complete.
7. Ready to launch is a hold. Either owner confirms the client call and external payment/card setup, then records actual ads launched. No card data or charges are handled here.
8. Actual launch starts a 14-day timer. Both owners receive an in-app trial review reminder three days before the end. They record continue at $530/month or close; no billing integration is implied.
9. Continued clients receive owner-assigned progress-update tasks every 84 hours (3½ days), with first task after 60 hours and a 24-hour completion deadline. One outstanding task per client prevents backlog duplication. Owners should still maintain at least two updates weekly; late completion does not count as meeting that service target.

## Ownership and reminders

New clients default to the primary owner. Assignment to Yaniv is manual and reversible. Automatic load balancing was not confirmed. Daily campaign reminders and ad-refresh reminders are omitted. Task notices are in-app; approaching reminders go to assignee and primary owner six hours before deadline, overdue reminders at/after due. Each reminder has a stable task/cycle/recipient key to prevent duplicates. A five-minute external scheduler is required for unattended delivery. Deadlines use UTC elapsed time and display in each viewer's local timezone.

## Intake and external systems

The Google Form is authoritative. GHL remains the separate sales system; Closebot booking remains external. No Stripe matching, roster import, automatic charging or client-specific checkout generation. Form response ID replays are ignored; matching email + business name with a different response ID requires manual duplicate review. Historical imports use historical=true and send no old assignment notices. Confirm actual Form/Sheet column names before wiring.

## Deployment state and limits

Without Supabase public configuration, a clearly labeled demo uses fictional data held in memory for one browser session. Role switching is available only in that demo. No uploads, email, push or live sync are simulated as successful. With Supabase configured, the app requires sign-in and the demo disappears. Production activation requires the SQL schema, private bucket, registered team Auth users, environment secrets and verified scheduler/form setup. Push/email delivery and automatic Drive folder sync are future work. No public signup or automatic team invitations.

The version-one durable store uses a single JSON workspace record with optimistic version checks and retry to prevent lost updates. Appropriate for a small internal team, not an unbounded CRM. Notifications/activity are retained; archive/retention policy and normalized tables are future scale work.
