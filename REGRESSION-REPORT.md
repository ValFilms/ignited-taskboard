# Ignited Taskboard regression report

Test date: September 8, 2026. Target: https://ignited-taskboard.vercel.app.

## Results

- **103 automated tests passed**, with no failures or skipped tests (`npm test`). This includes the parent API test and its individual cases.
- **36 live integration checks passed**, covering real accounts, API protection, database access restrictions, private storage, signed upload/download and cleanup.
- **Production build and TypeScript checks passed** (`npm run build`, `npm run typecheck`).
- Browser workflows were exercised using fictional local data, with separate live account and production interface checks. Desktop, 390 × 844 phone and 768 × 1024 tablet layouts were inspected.
- The latest **50 visible scheduled intake runs all completed successfully**, five minutes apart. Both the time trigger and spreadsheet form-submit trigger are installed. Four earlier failed runs were confined to initial setup on September 7, 1:58–2:03 PM; no recent failure appeared in the inspected history.
- **Fixes deployed and verified live.** Verified production build: [ignited-taskboard-7ou3hkx07](https://ignited-taskboard-7ou3hkx07-valfilms-projects.vercel.app), deployment `dpl_6ePko6XqiJG2DYaS3tj1ZRv6ZGC4`. All four accounts were checked again through the real sign-in UI. Staff land on My work and can reach Settings and Sign out at phone width; owners land on the 12-client board. Val's session was restored. No browser errors or warnings were recorded during these final checks.

## Coverage and evidence

| Feature | What was tested | Result |
| --- | --- | --- |
| Sign-in | Real Val, Yaniv, John and Karl accounts; wrong password; unknown/ambiguous usernames; case and whitespace handling; malformed input | Pass |
| Session recovery | Expired token retry, revoked token, failed refresh, no repeated forbidden mutations; live stale-session failure reproduced | Fixed; automated recovery tests pass |
| Permissions | Owner/manager/editor/campaign visibility; forbidden owner actions; forged role; cross-client task IDs; non-team user; direct database access | Pass |
| Intake | Required/optional fields, webhook secret, historical imports, duplicate retries, blank contacts, preserving manual contacts and workflow progress | Pass |
| Automatic sheet sync | Retry after failure, unchanged rows, edited/reordered rows, stable source IDs, duplicate timestamps, one-time trigger installation | Pass in script harness; scheduled production executions verified |
| Onboarding | Every checklist item, incomplete checklist rejection, completed handoff and owner notification | Pass in lifecycle tests and browser |
| Raw footage | Role/stage restrictions, allowed video formats, size limits, filename validation, missing/cross-client/duplicate files, stored metadata, repeat completion | Fixed; API tests pass |
| Private storage | Actual signed upload via public client, matching object metadata, unsigned download denial, exact signed download bytes, fixture deletion | Pass live |
| Editing | Assignment, 24-hour due date, valid/invalid Drive links, submission, paused approval clock | Pass in tests and browser |
| Review | Primary approver only, required revision notes, six-hour revision deadline, repeated cycles, resubmission, campaign assignment | Pass in tests and browser |
| Campaign setup | Assigned campaign specialist only, completion, owner notification, ready-to-launch handoff | Pass in tests and browser |
| Launch/trial | Call and payment confirmations, launch gating, 14-day trial, exact 72-hour reminder boundary, conversion | Pass in tests and browser |
| Ongoing care | First update after 60 hours, subsequent task at 84 hours, one outstanding update, summary requirement, owner reassignment | Pass |
| Closure | Trial/active stage requirement, all tasks completed, deadlines removed, no later reminder/task creation | Pass in tests; local browser closure verified |
| Notifications | Recipient isolation, individual/all read, initial backlog suppression, latest-three popup limit, deduplication, dismissal, inaccessible notice removal, user switch | Pass; ownership notification gaps fixed |
| Concurrency | Version conflicts, successful retries retaining another change, bounded failure, no-write polling, stale poll response protection | Server cases pass; client response ordering reviewed and fixed |
| Team settings | Approver protection, valid Auth UUID requirement, duplicate first names, role changes with open tasks or owned clients | Fixed; tests pass |
| Interface | Search, owner filter counts, role navigation, work/approval lists, Inbox, Sales explanation, Settings, profile save, activity log, modal Escape/focus wrap | Pass in browser |
| Responsive/accessibility | Desktop/phone/tablet inspection, page overflow checks, mobile navigation names, drawer fit, keyboard focus, inline validation, browser error logs | Pass for inspected screens; mobile accessible names added |

## Corrections made

1. Expired sessions now attempt one refresh and return to usable sign-in when renewal fails. Sign-out clears the displayed workspace, errors and pending selection.
2. Editor and campaign users open My work instead of an empty owner board.
3. Poll responses cannot replace a newer local action response; account changes invalidate pending results. Unchanged refreshes avoid unnecessary database writes.
4. Upload signing rejects missing, zero, negative, nonnumeric or oversized sizes and unsupported formats. Completion checks actual stored size/type, filename and unique paths; file responses prevent caching.
5. Reassigning an active update alerts its new owner without moving its deadline. Former assignees no longer receive notifications that link to inaccessible clients. Repeating the same assignment stays quiet.
6. Team edits cannot create ambiguous username logins, assign nonexistent Auth users, remove an existing client's owner role or strand open tasks under an incompatible role.
7. Mobile navigation retains accessible labels, and every role can reach Settings and Sign out on a phone. Intake connection text reflects received records instead of always claiming setup is required. Secret comparison safely handles byte-length differences.

## Test boundaries

- Workflow mutations used isolated state or fictional local browser data. The production workspace was not advanced, closed, reassigned or marked read for testing. Its JSON was unchanged across the live integration checks. The inspected production snapshot contained 12 clients: 11 Active and AllInOne Ready to launch.
- The API suite invokes the real route handlers and Supabase SDK through a simulated transport. Real provider connectivity and storage behavior were checked separately. This is not a full production workflow run using real client videos.
- The signed upload fixture was a small MP4 container header used to test transport, access control and byte integrity. Video decoding, large upload performance, interrupted-upload recovery and a maximum-size 50 MB upload were not exercised.
- Drive URL validation, iframe rendering and external-link fallback were tested. A fictional file correctly showed Drive's missing-file page. Playback and sharing permissions for a real client edit remain dependent on its actual Drive file.
- No new real Google Form response was submitted. The installed form-submit trigger and its handler were checked, while scheduled synchronization was observed live.
- Notifications are in-app popups and Inbox entries. Deadline checks run while the app is open and resume on reopening. Closed-app phone/OS push, SMS and email are outside the configured feature set. GHL sales sync is visibly unconnected.
- Responsive checks used the available Chromium browser; this was not a separate Safari/Firefox or physical iPhone test. It was not a load test or complete accessibility audit.

## Re-running

Run `npm test`, `npm run typecheck`, and `npm run build` from the repository. Automated tests use isolated data and do not require production credentials. Browser workflow tests can use `npm run dev` without Supabase environment variables; the app labels this fictional demo mode.
