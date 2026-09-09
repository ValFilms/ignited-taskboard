import { test } from "node:test";
import assert from "node:assert/strict";
import { createECDH, randomBytes } from "node:crypto";
import webpush from "web-push";
import { demoState } from "../lib/demo";
import { addDevice, removeDevice, queueNotices, subscriptionInput } from "../lib/push-state";
import { visibleState } from "../lib/workflow";
import * as push from "../app/api/push/route";
import * as workspace from "../app/api/workspace/route";
import { flushPush } from "../lib/push-server";
const ecdh = createECDH("prime256v1"); ecdh.generateKeys();
const subscription = { endpoint: "https://fcm.googleapis.com/fcm/send/fictional-device", keys: {
  p256dh: ecdh.getPublicKey().toString("base64url"), auth: randomBytes(16).toString("base64url"),
} };

test("Push subscription validation rejects arbitrary hosts, credentials and invalid keys", () => {
  assert.deepEqual(subscriptionInput(subscription), subscription);
  for (const endpoint of ["http://fcm.googleapis.com/a", "https://127.0.0.1/a", "https://evil.test/a", "https://web.push.apple.com.evil.test/a", "https://user:password@fcm.googleapis.com/a", "https://fcm.googleapis.com:8443/a", "https://fcm.googleapis.com/a#secret", "not-a-url"])
    assert.throws(() => subscriptionInput({ ...subscription, endpoint }));
  for (const keys of [{}, { auth: "bad", p256dh: subscription.keys.p256dh }, { ...subscription.keys, p256dh: "A".repeat(87) }]) assert.throws(() => subscriptionInput({ ...subscription, keys }));
});
test("Devices are account-bound, capped, idempotent and never exposed in workspace responses", () => {
  const s = demoState(); addDevice(s, "john", subscription); addDevice(s, "john", subscription);
  assert.equal(s.pushDevices!.length, 1);
  assert.throws(() => addDevice(s, "carl", subscription), /previous account/);
  removeDevice(s, "carl", subscription.endpoint); assert.equal(s.pushDevices!.length, 1);
  for (let i = 0; i < 4; i++) addDevice(s, "john", { ...subscription, endpoint: subscription.endpoint + i });
  assert.throws(() => addDevice(s, "john", { ...subscription, endpoint: subscription.endpoint + "sixth" }), /Five/);
  for (const m of s.members) { const visible = visibleState(s, m); assert(!("pushDevices" in visible)); assert(!("pushQueue" in visible)); }
});
test("Only new unread notices enter the durable queue; unsubscribe removes pending delivery", () => {
  const s = demoState(); addDevice(s, "owner", subscription);
  const before = new Set(s.notifications.map(n => n.id)); queueNotices(s, before); assert.equal(s.pushQueue!.length, 0);
  s.notifications.push({ id: "fresh", userId: "owner", clientId: "", text: "Private task", read: false, createdAt: new Date().toISOString() });
  queueNotices(s, before); queueNotices(s, before); assert.equal(s.pushQueue!.length, 1);
  removeDevice(s, "owner", subscription.endpoint); assert.equal(s.pushQueue!.length, 0);
});

test("Push API and sender regression use isolated transports", async t => {
  const originalFetch = globalThis.fetch, env = { ...process.env };
  const vapid = webpush.generateVAPIDKeys();
  Object.assign(process.env, { NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:9998", SUPABASE_SERVICE_ROLE_KEY: "fixture-private",
    WEB_PUSH_PUBLIC_KEY: vapid.publicKey, WEB_PUSH_PRIVATE_KEY: vapid.privateKey, WEB_PUSH_SUBJECT: "https://example.test" });
  let state = demoState(), version = 1, outcome = 201, sends: { endpoint: string; payload: any }[] = [];
  const reset = () => { state = demoState(); state.tasks = []; state.clients = []; state.notifications = []; version = 1; outcome = 201; sends = []; };
  const sender = t.mock.method(webpush, "sendNotification", async (sub: any, payload: any) => {
    sends.push({ endpoint: sub.endpoint, payload: JSON.parse(payload) });
    if (outcome !== 201) throw { statusCode: outcome };
    return { statusCode: 201, body: "", headers: {} };
  });
  globalThis.fetch = async (input, init) => {
    const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url);
    assert.equal(url.origin, "http://127.0.0.1:9998", "Never access live data in tests");
    if (url.pathname === "/auth/v1/user") {
      const id = new Headers(init?.headers).get("authorization")?.replace("Bearer ", "");
      return id && state.members.some(m => m.id === id) ? Response.json({ id }) : Response.json({ message: "invalid" }, { status: 401 });
    }
    assert.equal(url.pathname, "/rest/v1/workspace");
    if (init?.method === "PATCH") {
      if (url.searchParams.get("version") !== `eq.${version}`) return Response.json([]);
      const body = JSON.parse(String(init.body)); state = body.data; version = body.version; return Response.json([{ version }]);
    }
    return Response.json({ data: state, version });
  };
  const req = (body: unknown, user = "owner") => new Request("http://localhost/api", { method: "POST", headers: { Authorization: `Bearer ${user}` }, body: JSON.stringify(body) });
  try {
    await t.test("Authentication, private status, subscription and account isolation", async () => {
      reset(); assert.equal((await push.POST(req({ type: "status" }, ""))).status, 401);
      assert.equal((await push.POST(req({ type: "subscribe", subscription }, "carl"))).status, 200);
      const status = await (await push.POST(req({ type: "status", endpoint: subscription.endpoint }, "carl"))).json(); assert.equal(status.enabled, true); assert.equal(status.publicKey, vapid.publicKey);
      assert(!JSON.stringify(status).includes(vapid.privateKey));
      assert.equal((await (await push.POST(req({ type: "status", endpoint: subscription.endpoint }))).json()).enabled, false);
      assert.equal((await push.POST(req({ type: "test", endpoint: subscription.endpoint }))).status, 400); assert.equal(sends.length, 0);
      await push.POST(req({ type: "unsubscribe", endpoint: subscription.endpoint })); assert.equal(state.pushDevices!.length, 1);
    });
    await t.test("Real task action persists and sends only the recipient a generic push", async () => {
      reset(); addDevice(state, "owner", subscription);
      const response = await workspace.POST(req({ type: "createTask", task: { title: "Private client refilming instructions", assignee: "owner" } }, "carl"));
      assert.equal(response.status, 200); assert.equal(sends.length, 1); assert.equal(sends[0].payload.url, "/?inbox=1");
      assert(!JSON.stringify(sends[0].payload).includes("Private client"));
      assert.equal(state.pushQueue!.length, 0); const visible = await response.json(); assert(!visible.pushDevices); assert(!visible.pushQueue);
    });
    await t.test("Private messages push only to the recipient without message text and retries do not resend", async () => {
      reset(); addDevice(state, "carl", subscription);
      addDevice(state, "owner", {...subscription, endpoint: subscription.endpoint + "-owner"});
      const action = {type: "sendMessage", message: {id: crypto.randomUUID(), body: "Private chat secret", target: {kind: "direct", memberId: "carl"}}};
      assert.equal((await workspace.POST(req(action, "john"))).status, 200);
      assert.equal(sends.length, 1); assert.equal(sends[0].endpoint, subscription.endpoint);
      assert(!JSON.stringify(sends[0].payload).includes("Private chat secret"));
      assert.equal((await workspace.POST(req(action, "john"))).status, 200); assert.equal(sends.length, 1);
    });
    await t.test("Campaign completion persists the Closebot task and pushes its notification to Yaniv", async () => {
      reset(); state = demoState(); addDevice(state, "yaniv", subscription);
      const response = await workspace.POST(req({ type: "campaign", clientId: "demo-2", taskId: "campaign-2" }, "carl"));
      assert.equal(response.status, 200);
      const task = state.tasks.find(t => t.campaignTaskId === "campaign-2")!;
      assert.equal(task.assignee, "yaniv");
      const notice = state.notifications.find(n => n.taskId === task.id)!;
      assert(sends.some(s => s.payload.tag === notice.id));
      assert(sends.every(s => s.endpoint === subscription.endpoint));
      assert.equal(state.pushQueue!.length, 0);
      const sent = sends.length;
      assert.equal((await workspace.POST(req({ type: "campaign", clientId: "demo-2", taskId: "campaign-2" }, "carl"))).status, 400);
      assert.equal(sends.length, sent);
      assert.equal(state.tasks.filter(t => t.campaignTaskId === "campaign-2").length, 1);
    });
    await t.test("Failed push does not fail saved tasks; retry eventually drains the queue", async () => {
      reset(); addDevice(state, "owner", subscription); outcome = 503;
      assert.equal((await workspace.POST(req({ type: "createTask", task: { title: "Retry me", assignee: "owner" } }, "carl"))).status, 200);
      assert.equal(state.tasks.at(-1)!.title, "Retry me"); assert.equal(state.pushQueue!.length, 1); assert.equal(state.pushQueue![0].attempts, 1);
      await flushPush(); assert.equal(sends.length, 1, "Backoff prevents immediate retry");
      state.pushQueue![0].nextAttempt = 0; outcome = 201; await flushPush(); assert.equal(sends.length, 2); assert.equal(state.pushQueue!.length, 0);
    });
    await t.test("Expired subscriptions are removed", async () => {
      reset(); addDevice(state, "owner", subscription); outcome = 410;
      await workspace.POST(req({ type: "createTask", task: { title: "Expired device", assignee: "owner" } }, "carl"));
      assert.equal(state.pushDevices!.length, 0); assert.equal(state.pushQueue!.length, 0);
    });
    await t.test("Concurrent dispatch claims each queued notice once", async () => {
      reset(); addDevice(state, "owner", subscription);
      const before = new Set(state.notifications.map(n => n.id)); state.notifications.push({ id: "concurrent", userId: "owner", clientId: "", text: "New", createdAt: new Date().toISOString(), read: false });
      queueNotices(state, before); await Promise.all([flushPush(), flushPush()]); assert.equal(sends.length, 1); assert.equal(state.pushQueue!.length, 0);
    });
    await t.test("Explicit test sends only to current device and is rate limited", async () => {
      reset(); addDevice(state, "owner", subscription);
      assert.equal((await push.POST(req({ type: "test", endpoint: subscription.endpoint }))).status, 200);
      assert.equal((await push.POST(req({ type: "test", endpoint: subscription.endpoint }))).status, 400);
      assert.equal(sends.length, 1); assert.equal(sends[0].payload.title, "Ignited test notification");
    });
    await t.test("Unavailable sender reports setup needed and still permits unsubscribe", async () => {
      reset(); addDevice(state, "owner", subscription); delete process.env.WEB_PUSH_PRIVATE_KEY;
      assert.equal((await (await push.POST(req({ type: "status" }))).json()).configured, false);
      assert.equal((await push.POST(req({ type: "subscribe", subscription }))).status, 400);
      assert.equal((await push.POST(req({ type: "unsubscribe", endpoint: subscription.endpoint }))).status, 200);
    });
  } finally {
    sender.mock.restore(); globalThis.fetch = originalFetch;
    for (const key of Object.keys(process.env)) if (!(key in env)) delete process.env[key]; Object.assign(process.env, env);
  }
});
