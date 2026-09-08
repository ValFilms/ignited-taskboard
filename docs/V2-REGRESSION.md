# v2 validation

Scope: phone usability, teammate-assigned tasks, actionable dashboard/profile
controls, and opt-in Web Push. Work is staged separately from production.

## Automated checks

`npm run check` passed on Node 24: **151 tests**, TypeScript and production build.
Tests use fictional data, isolated Supabase transports and a stub push provider.
No test writes touch production Supabase, uploads, team accounts or intake.

- All 16 combinations of task creator/assignee across the four roles.
- General and client-linked tasks; input/deadline validation; unrelated staff
  access denial; creator tracking; reassignment; completion/reopening and notices.
- Existing delivery lifecycle, restricted ad approval, file authorization,
  intake replay, concurrent saves and reminder deduplication remain covered.
- Push subscription ownership, endpoint allowlist, private response redaction,
  device limits, unsubscribe, generic payloads and explicit test rate limits.
- Durable delivery claims, parallel sender deduplication, backoff, expired-device
  removal and preservation of task saves when push delivery fails.
- GitHub account isolation and release reservation/restore checks. Windows test
  fixtures now launch the fake CLI portably and allow slower local Git I/O for
  the two-process reservation test. No production helper behavior was weakened.

## Browser checks

- Phone layouts at 320px and 390px: labeled bottom navigation, stacked client
  stages, readable controls, settings and light mode. No page-width overflow in
  the inspected board/settings layouts after hydration.
- Karl creates a client refilming task for the owner; it appears in Assigned by
  me and the owner's Assigned to me; the owner completes it successfully.
- Custom-task dialog, all teammate choices, optional deadline, instructions,
  completion state and reopen control.
- Top-right profile menu on phone and desktop, appearance switch and settings
  navigation. Summary cards open the appropriate view or stage filter.
- Desktop inspection at 1280px: board and profile menu render without page-width
  overflow. The horizontal delivery board remains independently scrollable.

## Integration boundary

The shared preview uses the fictional session demo. Real sign-in, uploads and
phone push delivery cannot be exercised there. A separate authenticated staging
workspace is required to validate physical-device permissions, background arrival,
notification clicks after sign-in, and the external five-minute scheduler.

The accessible Supabase organization currently lists the live Taskboard and a
separate Portfolio project; neither was repurposed for testing. Push setup is
documented in [PUSH.md](PUSH.md). Provider acceptance in automated tests is not
evidence of notification arrival on a phone. Production publication still requires
the user's go-live instruction after reviewing the exact preview.
