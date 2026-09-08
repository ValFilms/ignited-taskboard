# Device push notifications

v2 adds authenticated Web Push subscriptions, a push-only service worker, device
controls in Settings, and durable delivery retries. This is separate from in-app
pop-ups. No paid notification provider is required by this implementation.

## Private server configuration

Use a dedicated staging workspace to test sign-in and actual device delivery.
The fictional session demo deliberately cannot subscribe or send real push.
Do not point a test preview at production client records.

Generate an independent VAPID pair with `web-push.generateVAPIDKeys()` in a private
administrative process. Store `WEB_PUSH_PUBLIC_KEY`, `WEB_PUSH_PRIVATE_KEY` and
`WEB_PUSH_SUBJECT` in the deployment environment. The subject must be an HTTPS
contact URL or a monitored `mailto:` address. Never print or commit the private
key. Keep each environment's pair stable; rotating it requires devices to
unsubscribe and subscribe again. The public key is served to authenticated team
members by `/api/push`. Only the private key is secret.

The existing private Supabase workspace JSON stores optional `pushDevices` and
`pushQueue` fields. No SQL migration or public database policy is required. Neither
field is returned by the workspace API, including to owners. Maximum five devices
per member; unsubscribe is per device. Signing out removes the current device's
subscription when connectivity permits. A device cannot be claimed by another
account while its previous subscription remains registered.

Task actions, intake, file completion and deadline checks enqueue newly created
notices after optimistic concurrency validation. The sender claims at most ten
deliveries per request with a one-minute lease, and sends a generic notification.
Client names and task notes are never sent in the push payload. A click opens the
inbox and requires a valid sign-in to read details.

Failed sends retry on subsequent workspace mutations or `/api/cron`, with
exponential backoff, at most five attempts and a one-day lifetime. A 404/410
removes the expired subscription. Read notices and removed members are filtered
before claiming. The queue is capped at 500 pending device deliveries. Browser
push is best effort; a process interruption after provider acceptance can cause
a retry, with the stable notification tag replacing a duplicate on the device.
In-app notices remain available independently of delivery success.

Keep the existing five-minute authenticated reminder scheduler calling
`GET /api/cron` with `Authorization: Bearer CRON_SECRET` so deadlines and retries
continue when everyone closes the app. Do not silently replace it with a daily
Hobby cron. This feature does not install or alter an external scheduler.

## Each teammate's device

1. On iPhone/iPad 16.4+, open the site in Safari, choose Share → Add to Home Screen,
   and open the installed app. Android/desktop users can open a supported HTTPS
   browser; installation is optional there.
2. Sign in. Open the profile menu → Settings & notifications.
3. Tap Enable push notifications, then Allow in the device prompt.
4. Tap Send test notification. Provider acceptance is reported separately from
   actual arrival; check the device notification center and Focus settings.
5. Close the app, assign a fictional task from a different account, and verify
   arrival and that tapping the notice opens the inbox. Repeat on each platform.

Permission must be requested through the teammate's own button tap. If blocked,
change the browser/site or OS notification permission and reopen the app.

References: [Apple Web Push](https://webkit.org/blog/13878/web-push-for-web-apps-on-ios-and-ipados/),
[PushManager.subscribe](https://developer.mozilla.org/en-US/docs/Web/API/PushManager/subscribe),
[web-push sender](https://github.com/web-push-libs/web-push).
