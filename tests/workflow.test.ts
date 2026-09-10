import { test } from "node:test";
import assert from "node:assert/strict";
import { demoState } from "../lib/demo";
import { transition, visibleState, tick, importClient } from "../lib/workflow";
const now = Date.UTC(2026, 8, 7, 0);
test("in-app refresh checks deadlines and reading a notification only changes the recipient's selected item", () => {
  const s = demoState();
  // Pin the fixture to this test's clock, not the day the suite happens to run.
  s.tasks.find(t => t.id === "edit-1")!.dueAt = new Date(now + 24 * 3600000).toISOString();
  const john = s.members[2];
  const state = tick(transition(s, john, { type: "refresh" }, now), now + 1000 * 3600 * 72);
  const mine = state.notifications.filter(n => n.userId === john.id);
  assert(mine.length > 0);
  const other = state.notifications.find(n => n.userId !== john.id)!;
  const next = transition(state, john, { type: "read", key: mine[0].id }, now);
  assert.equal(next.notifications.find(n => n.id === mine[0].id)!.read, true);
  assert.equal(next.notifications.find(n => n.id === other.id)!.read, other.read);
  const denied = transition(state, john, { type: "read", key: other.id }, now);
  assert.equal(denied.notifications.find(n => n.id === other.id)!.read, other.read);
});
test("members receive only assigned work and necessary client context", () => {
  const s = demoState(),
    john = s.members[2],
    v = visibleState(s, john);
  assert.equal(v.clients.length, 2);
  assert(v.tasks.every((t) => t.assignee === "john"));
  assert(v.clients.every((c) => c.email === "" && c.closebot === ""));
  assert.deepEqual(v.events, []);
  assert.deepEqual(v.members, s.members, "Teammates need the name/role directory to assign tasks");
  assert.throws(
    () =>
      transition(
        s,
        john,
        { type: "check", clientId: "demo-5", key: "Business intake" },
        now,
      ),
    /Owners only/,
  );
});
test("only primary owner approves; approval completes edit and assigns 24h campaign task", () => {
  const s = demoState();
  assert.throws(
    () =>
      transition(
        s,
        s.members[1],
        { type: "approve", clientId: "demo-0", taskId: "edit-0" },
        now,
      ),
    /Only/,
  );
  const next = transition(
    s,
    s.members[0],
    { type: "approve", clientId: "demo-0", taskId: "edit-0" },
    now,
  );
  assert.equal(next.tasks[0].status, "done");
  const campaign = next.tasks.find(
    (t) => t.clientId === "demo-0" && t.kind === "campaign",
  )!;
  assert.equal(campaign.assignee, "carl");
  assert.equal(Date.parse(campaign.dueAt!), now + 24 * 3600000);
});
test("revision starts fresh 6h including weekends; resubmission pauses deadline and alerts", () => {
  let s = demoState();
  s = transition(
    s,
    s.members[0],
    {
      type: "revise",
      clientId: "demo-0",
      taskId: "edit-0",
      value: "Trim intro",
    },
    now,
  );
  assert.equal(Date.parse(s.tasks[0].dueAt!), now + 6 * 3600000);
  const n = s.notifications.length;
  tick(s, now);
  assert.equal(s.notifications.length, n);
  tick(s, now + 6 * 3600000);
  assert(s.notifications.some((n) => n.id === "edit-0:1:overdue:john"));
  s = transition(
    s,
    s.members[2],
    {
      type: "submit",
      clientId: "demo-0",
      taskId: "edit-0",
      value: "https://drive.google.com/file/d/abc123/view",
    },
    now + 7 * 3600000,
  );
  assert.equal(s.tasks[0].dueAt, null);
  const notices = s.notifications.filter((n) => n.clientId === "demo-0").length;
  tick(s, now + 50 * 3600000);
  assert.equal(
    s.notifications.filter((n) => n.clientId === "demo-0").length,
    notices,
  );
  assert.equal(s.tasks[0].status, "review");
});
test("cannot act on another assignee or bypass edit review", () => {
  const s = demoState();
  assert.throws(
    () =>
      transition(
        s,
        s.members[3],
        {
          type: "submit",
          clientId: "demo-1",
          taskId: "edit-1",
          value: "https://drive.google.com/file/d/abc/view",
        },
        now,
      ),
    /assigned/,
  );
  assert.throws(
    () =>
      transition(
        s,
        s.members[0],
        { type: "approve", clientId: "demo-1", taskId: "edit-1" },
        now,
      ),
    /No edit/,
  );
});
test("launch requires call and external payment confirmation; timer and reminder are exact", () => {
  let s = demoState();
  assert.throws(
    () =>
      transition(s, s.members[0], { type: "launch", clientId: "demo-3" }, now),
    /Confirm/,
  );
  for (const key of ["launchCall", "paymentConfirmed"])
    s = transition(
      s,
      s.members[1],
      { type: "launchCheck", clientId: "demo-3", key },
      now,
    );
  s = transition(s, s.members[0], { type: "launch", clientId: "demo-3" }, now);
  assert.equal(Date.parse(s.clients[3].trialEnd!), now + 14 * 86400000);
  tick(s, now + 11 * 86400000);
  assert.equal(
    s.notifications.filter((n) => n.id.startsWith("demo-3:trial:")).length,
    2,
  );
  tick(s, now + 12 * 86400000);
  assert.equal(
    s.notifications.filter((n) => n.id.startsWith("demo-3:trial:")).length,
    2,
  );
});
test("form import is idempotent; old records stay quiet and do not imply completed onboarding", () => {
  const s = demoState();
  const p = {
    sourceId: "response-1",
    name: "A business",
    person: "Example",
    email: "a@example.com",
    location: "Miami",
    historical: true,
  };
  const n = s.notifications.length;
  importClient(s, p, now);
  importClient(s, p, now);
  assert.equal(s.clients.length, 9);
  assert.equal(s.notifications.length, n);
  assert.equal(s.clients[8].stage, "Onboarding");
  assert(Object.values(s.clients[8].onboarding).every((v) => !v));
  assert.throws(
    () => importClient(s, { ...p, sourceId: "response-2" }, now),
    /duplicate/,
  );
});
test("intake accepts missing contacts, preserves business details and supports owner completion", () => {
  const s = demoState();
  const payload = { sourceId: "sheet-blank-contact", name: "New detailing business",
    person: "", email: "", location: "", phone: "555-0100", offer: "$150 detail", historical: true };
  const count = s.clients.length;
  importClient(s, payload, now);
  importClient(s, payload, now);
  assert.equal(s.clients.length, count + 1);
  const client = s.clients[count];
  assert.equal(client.email, "");
  assert.equal(client.person, "");
  assert.equal(client.phone, payload.phone);
  assert.equal(client.offer, payload.offer);
  assert(Object.values(client.onboarding).every((v) => !v));
  assert.throws(() => importClient(s, { ...payload, sourceId: "another-response" }, now), /duplicate/);
  const updated = transition(s, s.members[0], { type: "profile", clientId: client.id,
    profile: { person: "Client contact", email: "contact@example.com", location: "City" } }, now);
  assert.equal(updated.clients[count].email, "contact@example.com");
  updated.clients[count].stage = "Active";
  updated.clients[count].onboarding["Business intake"] = true;
  const notices = updated.notifications.length;
  importClient(updated, { ...payload, name: "Renamed business", phone: "555-0101" }, now);
  assert.equal(updated.clients.length, count + 1);
  assert.equal(updated.clients[count].name, "Renamed business");
  assert.equal(updated.clients[count].phone, "555-0101");
  assert.equal(updated.clients[count].email, "contact@example.com");
  assert.equal(updated.clients[count].stage, "Active");
  assert.equal(updated.clients[count].onboarding["Business intake"], true);
  assert.equal(updated.notifications.length, notices);
  assert.throws(() => transition(s, s.members[2], { type: "profile", clientId: client.id,
    profile: { email: "changed@example.com" } }, now));
});
test("reminders deduplicate; active care assigns only one outstanding update", () => {
  const s = demoState();
  s.clients[7].nextUpdate = new Date(now).toISOString();
  tick(s, now);
  tick(s, now + 3600000);
  assert.equal(
    s.tasks.filter((t) => t.clientId === "demo-7" && t.kind === "update")
      .length,
    1,
  );
  assert.equal(
    new Set(s.notifications.map((n) => n.id)).size,
    s.notifications.length,
  );
});
test("owners can reassign within role without resetting deadlines or exposing another task", () => {
  const s = demoState();
  s.members.push({ id: "editor-2", name: "Second editor", role: "editor" });
  const due = s.tasks[1].dueAt;
  const next = transition(
    s,
    s.members[1],
    {
      type: "reassign",
      clientId: "demo-1",
      taskId: "edit-1",
      value: "editor-2",
    },
    now,
  );
  assert.equal(next.tasks[1].assignee, "editor-2");
  assert.equal(next.tasks[1].dueAt, due);
  assert(
    !visibleState(next, next.members[2]).clients.some((c) => c.id === "demo-1"),
  );
  assert.throws(
    () =>
      transition(
        s,
        s.members[0],
        {
          type: "reassign",
          clientId: "demo-1",
          taskId: "edit-1",
          value: "carl",
        },
        now,
      ),
    /matching role/,
  );
});
