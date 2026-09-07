# Ignited team workspace

Next.js app for Ignited Content Co. See [SPEC.md](SPEC.md) for workflow and access rules.

## Run

Node 24, npm. `npm ci`, `npm run dev`. `npm test` checks permissions and state transitions; `npm run build` includes TypeScript validation.

## Activate the private workspace

1. Create a dedicated Supabase project. Run `supabase/schema.sql`. Storage bucket `raw-footage` must remain private with no public read policies. Check your plan's maximum upload size; the current Free-plan configuration caps individual files at 50 MB. Larger raw videos require a storage plan change and matching app/bucket limits.
2. Disable public Auth signup. Create the primary owner's Auth account without sending an unsolicited invitation; provision passwords securely outside chat. Insert that user's UUID/name as `approver` using the example SQL. Create Yaniv, John and Carl's actual accounts, then add their UUIDs in Team settings as manager, editor and campaign specialist. Team settings save existing membership only; they do not create Auth users or send mail.
3. Add the five keys from `.env.example` to Vercel. The two NEXT_PUBLIC values are public project credentials. `SUPABASE_SERVICE_ROLE_KEY`, `FORM_WEBHOOK_SECRET`, and `CRON_SECRET` are server-only. Generate independent long random secrets for webhook and scheduler. Never commit `.env` files. Redeploy after setting public values.
4. Verify unauthorized requests to `/api/workspace` and `/api/files` fail, team users see only their own work, and database access with anon/authenticated credentials returns no rows. Verify actual upload/download with both owner and assigned editor accounts. Live integration tests require your project and are not implied by the unit tests.
5. Configure an external scheduler to GET `/api/cron` every five minutes, with `Authorization: Bearer CRON_SECRET`. Alternatively use a Vercel plan that supports this cadence and add the cron definition. **No once-daily Hobby cron is substituted for five-minute deadlines.** Cron creates in-app notices; it does not deliver push/email. Check successful HTTP responses and scheduler failures.
6. Connect the actual Google Form via the Apps Script below. Review field mapping using a real test response. Use a stable Google Forms response ID. Confirm duplicate replays do not add clients. Backfill explicitly with `historical: true`; inspect a small batch before importing the full history.

## Automatic sync for the connected response sheet

`integrations/google-intake.gs` is the connector for Mobile Detailing (Responses). Install it in a **private standalone** Apps Script project; the shared sheet's bound project must not hold the webhook secret. Set `FORM_WEBHOOK_SECRET` in that project's Script Properties to match Vercel production, create the taskboard approver account, then run `installSync` and authorize the Google permissions. Confirm both triggers exist and a successful execution before treating sync as active.

The form-submit trigger processes new responses; a five-minute timer catches edits and retries failed requests while browsers are closed. Google controls actual trigger timing. Only changed rows are sent, and only successful responses are acknowledged. Reinstalling does not duplicate triggers. Existing rows are tagged as historical before the first run and produce no old onboarding notifications.

Response IDs use the sheet ID, tab ID and original timestamp, so sorting rows and changing business details retain the same client. **Do not alter original response timestamps.** Duplicate timestamps stop the run for review. Deleting a sheet row does not delete its client or work history. Source details update in place; blank contact names/emails preserve any contact information filled in by an owner. Task assignments, stage, deadlines and approval history remain unchanged. Names/emails are currently absent from the Form; owners can complete them in the app.

Use Apps Script Executions and Script Properties `LAST_SUCCESS_AT` / `LAST_ERROR` to inspect sync health. A maximum of 50 changed rows is attempted per run; outstanding rows retry at the next interval. The separate `/api/cron` reminder scheduler is still configured independently.

## Alternative Google Forms trigger

Use a **form-bound** Apps Script project and an installable `onFormSubmit` trigger. Set script properties `APP_URL` and `FORM_WEBHOOK_SECRET` privately. The example deliberately expects named questions; adapt these names to the real form. This trigger does not read a Sheet and does not mark onboarding complete.

```javascript
function onFormSubmit(e) {
  const props = PropertiesService.getScriptProperties();
  const answers = Object.fromEntries(e.response.getItemResponses().map(r =>
    [r.getItem().getTitle(), String(r.getResponse())]));
  const required = ['Business name', 'Person name', 'Email', 'General location'];
  required.forEach(k => { if (!answers[k]) throw new Error('Missing mapped field: ' + k); });
  const response = UrlFetchApp.fetch(props.getProperty('APP_URL') + '/api/form', {
    method: 'post', contentType: 'application/json', muteHttpExceptions: true,
    headers: {Authorization: 'Bearer ' + props.getProperty('FORM_WEBHOOK_SECRET')},
    payload: JSON.stringify({sourceId: e.response.getId(), name: answers['Business name'],
      person: answers['Person name'], email: answers['Email'], location: answers['General location']})
  });
  if (response.getResponseCode() !== 200) throw new Error('Intake failed: ' + response.getResponseCode());
}
```

For existing responses, use the same stable IDs and add `historical: true`. Do not automatically rerun all old form triggers or send retroactive notifications. Submission failures must be reviewed in Apps Script executions; the endpoint is idempotent for safe retries.

## Notifications and mobile

While the app is visible, authenticated refreshes check deadlines and update the inbox every 15 seconds. New unread notices appear as dismissible pop-ups; opening one marks only that notice read. Existing inbox entries do not replay as pop-ups at sign-in. A server scheduler is still needed when no one is using the app. Browser/PWA push is **not implemented or enabled**, and there is no email provider. iOS web push requires Home Screen installation on iOS/iPadOS 16.4+ plus a user permission gesture and a configured push sender. Android/desktop also need permission and a push service. The manifest supports standalone display; offline functionality is not provided.

Official setup references: [Vercel cron limits](https://vercel.com/docs/cron-jobs/usage-and-pricing), [Apple web push](https://webkit.org/blog/13878/web-push-for-web-apps-on-ios-and-ipados/), [Supabase Auth](https://supabase.com/docs/guides/auth), [private Storage](https://supabase.com/docs/guides/storage/security/access-control).

## Operational notes

- Raw uploads bypass Vercel body limits via signed Supabase upload URLs. Failed/unsubmitted uploads may leave orphan files; owners can clean those from storage after confirming they are not referenced.
- The server uses a service credential, so all access must continue to pass through the checked API. No direct database policies for client reads should be added without a security review.
- Google Drive permissions are separate. The app cannot make a private file accessible; editors should share with appropriate reviewers.
- For first activation, verify SQL, storage, login, form trigger, reminders and roles with test records before using real clients. No team invitations have been sent.
- No live Supabase, Google Form, scheduler, email or push credentials are supplied in this repository.
