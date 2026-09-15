# GHL sales dashboard

Sales reads one GHL sub-account using server-only `GHL_PRIVATE_INTEGRATION_TOKEN`
and `GHL_LOCATION_ID`. It never writes GHL, delivery state, tasks, messages or
notifications. No migration, intake change or scheduler is needed. Workspace
approvers and managers can access it; the endpoint checks current membership on
every request. Other teammates and anonymous visitors receive no sales data.

The private integration needs `contacts.readonly`, `calendars.readonly`,
`calendars/events.readonly`, and `opportunities.readonly`. `users.readonly` is
optional for readable assignee names. Missing scopes are reported per dataset.
Never put the token in a public environment variable, source file or browser.

Unconfigured previews show a disconnected message, **not sample sales records**.
An authenticated preview connected to the real account reads real records. Such a
preview shares workspace data: regression mutations must still use isolated test
transports, not real clients. Do not enable push, cron or intake secrets for a
sales read test. Production publication still requires the owner's go-live.

When Vercel reports `preview` and a GHL token is configured, this build enforces
read-only workspace access. Normal refresh returns state without deadline ticks;
workspace mutations and other API actions (files, push, passwords, intake, cron)
are blocked. Login, version lookup and Sales reads remain available. The UI shows
a read-only banner. This guard is inactive in production and disconnected demos.

## Metrics

- Contacts: all contacts loaded from the configured account (including customers).
- New leads: records whose GHL type is `lead` and creation date falls in the range.
- Bookings: appointments in the range with status new, confirmed, showed or no-show.
  Awaiting confirmation, attended and no-show are distinguishable in Appointments.
  Cancelled/invalid appointments are excluded from bookings and remain visible.
- Booked contacts: unique loaded contacts with one of those appointments.
- Not booked: loaded contacts without a booking in the selected calendar/date
  range. This does not claim they have never booked. Incomplete calendar data or
  an unknown appointment status gives Unknown, not Not booked.
- Pipeline records are current, all-time snapshots. Values are opportunity
  estimates in the account currency, not payments or recognized revenue.

Date boundaries use UTC; times display in the viewer's timezone. Select up to 31
days, including future dates. Contacts and opportunities are not restricted to
the appointment date filter. Contact filters apply to the list; top metrics stay
account-wide for the selected calendar and date range.

Refresh occurs on opening Sales, manually, and every five minutes while the tab
is visible. Errors retain the previous timestamp/data with a visible warning.
The adapter uses bounded requests (45 seconds total, 12 seconds per request),
up to 5,000 contacts/opportunities, and up to 30 calendars. Pagination duplicates,
missing records or failures mark coverage incomplete. Incomplete totals are
unavailable or explicitly labelled loaded records. It never follows upstream
pagination URLs or returns raw provider errors or credentials.

Contact details include returned business/contact information, source, owner,
tags, custom field values, appointments and opportunities. Custom fields may use
their GHL field IDs when the API does not supply names. Open full contact in GHL
for conversations, notes, payments and other information not in this projection.

## Validation

`tests/sales.test.ts` exercises actual route authorization and isolated GHL/Supabase
transports, pagination, dates, status handling, missing scopes, account isolation,
safe errors and non-mutation. `npm run check` also runs all existing workflow,
chat, files, push, password, intake and release tests, TypeScript and the build.
Provider permission/response compatibility must additionally be verified in the
authenticated real-data preview. Passing mocks alone does not prove live access.

API contracts: [official OpenAPI schemas](https://github.com/GoHighLevel/highlevel-api-docs/tree/main/apps).
The contacts search POST is a read operation. Calendar requests use version
2021-04-15; contacts, opportunities and users use 2021-07-28.
