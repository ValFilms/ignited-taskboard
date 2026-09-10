import { test } from "node:test";
import assert from "node:assert/strict";
import { demoState } from "../lib/demo";
import { checklist, pipelineVersion, stages, taskVersion, tick, transition, type Action, type Stage, type State } from "../lib/workflow";
const now = Date.UTC(2026, 8, 10), hour = 3600000;
function fixture(stage: Stage = "Editing") {
  const s = demoState(); s.notifications = []; s.tasks = []; s.events = [];
  const c = s.clients[0]; s.clients = [c]; c.stage = stage;
  c.onboarding = Object.fromEntries(checklist.map(k => [k, true]));
  c.driveUrl = "https://drive.google.com/drive/folders/abcdefghijklmnop";
  c.rawFiles = [{path: "saved-original", name: "Original.mp4"}];
  c.launchCall = c.paymentConfirmed = true;
  s.tasks.push({id: "old", clientId: c.id, title: "Old editing", kind: "edit", assignee: "john", createdBy: "owner", status: "open", createdAt: new Date(now - hour).toISOString(), dueAt: new Date(now + hour).toISOString(), cycle: 0});
  return s;
}
function action(s: State, target: Stage): Action {
  return {type: "movePipeline", clientId: s.clients[0].id, pipelineVersion: pipelineVersion(s, s.clients[0]), value: target, reason: "Owner corrected the delivery stage"};
}
function move(s: State, target: Stage, actor = "owner") {
  return transition(s, s.members.find(m => m.id === actor)!, action(s, target), now);
}

test("Only the authenticated ad approver may override a pipeline stage", () => {
  for (const actor of ["john", "carl", "yaniv"]) assert.throws(() => move(fixture(), "Filming", actor), /Only the ad approver/);
  const s = fixture(); assert.throws(() => transition(s, {...s.members.find(m => m.id === "john")!, role: "approver"}, action(s, "Filming"), now), /Unauthorized/);
});
test("All distinct stage moves maintain one coherent destination and retain source records", () => {
  for (const from of stages) for (const target of stages.filter(stage => stage !== from)) {
    const s = fixture(from), before = structuredClone(s), next = move(s, target), c = next.clients[0];
    assert.equal(c.stage, target); assert.deepEqual(s, before);
    assert.deepEqual(c.rawFiles, before.clients[0].rawFiles); assert.equal(c.driveUrl, before.clients[0].driveUrl);
    assert.equal(next.tasks.find(t => t.id === "old")?.archivedBy, "owner");
    const pending = next.tasks.filter(t => !t.archivedAt && t.status !== "done" && t.kind !== "custom");
    assert.equal(pending.length, ["Editing", "In review", "Campaign setup"].includes(target) ? 1 : 0);
    if (pending[0]) {
      assert.equal(pending[0].status, target === "In review" ? "review" : "open");
      assert.equal(pending[0].dueAt, target === "In review" ? null : new Date(now + 24 * hour).toISOString());
      assert.equal(pending[0].assignee, target === "Campaign setup" ? "carl" : "john");
    }
    assert(next.events.some(e => e.text.includes(`${from} → ${target}`) && e.text.includes("Owner corrected")));
  }
});
test("Moves reject missing reasons, unknown or same stages and invalid review links atomically", () => {
  const s = fixture(), before = structuredClone(s);
  for (const change of [{reason: " "}, {reason: "x".repeat(2001)}, {reason: 2}, {value: "bogus"}, {value: "Editing"}, {pipelineVersion: undefined}])
    assert.throws(() => transition(s, s.members[0], {...action(s, "Filming"), ...change} as Action, now));
  for (const target of ["In review", "Campaign setup"] as Stage[]) {
    assert.throws(() => transition(s, s.members[0], {...action(s, target), driveUrl: "https://example.com/file"}, now), /Google Drive/);
  }
  assert.deepEqual(s, before);
});
test("Onboarding and actual launch prerequisites cannot be skipped by a move", () => {
  const s = fixture("Onboarding"); s.clients[0].onboarding[checklist[0]] = false;
  assert.throws(() => move(s, "Filming"), /Complete onboarding/);
  s.clients[0].launchCall = false; assert.throws(() => move(s, "Trial"), /Confirm launch/);
});
test("Missing destination members reject the entire move", () => {
  for (const [target, member] of [["Editing", "john"], ["Campaign setup", "carl"], ["Ready to launch", "yaniv"]] as const) {
    const s = fixture("Filming"); s.members = s.members.filter(m => m.id !== member); const before = structuredClone(s);
    assert.throws(() => move(s, target), /Configure/); assert.deepEqual(s, before);
  }
});
test("Refilm preserves comments and completed tasks, retires automatic work, keeps manual tasks", () => {
  const s = fixture("Ready to launch");
  s.tasks.push({...s.tasks[0], id: "completed", status: "done"}, {...s.tasks[0], id: "manual", kind: "custom"}, {...s.tasks[0], id: "integration", kind: "custom", campaignTaskId: "campaign-1", assignee: "yaniv"});
  s.messages = [{id: "comment", senderId: "john", body: "Keep this", threadId: "task:old", target: {kind: "task", taskId: "old"}, createdAt: new Date(now).toISOString()}];
  const next = move(s, "Filming"); assert.deepEqual(next.messages, s.messages);
  assert(!next.tasks.find(t => t.id === "completed")!.archivedAt); assert(!next.tasks.find(t => t.id === "manual")!.archivedAt);
  assert(next.tasks.find(t => t.id === "integration")!.archivedAt);
  assert.equal(next.clients[0].launchCall, false); assert.equal(next.clients[0].paymentConfirmed, false);
  const uploaded = transition(next, next.members[0], {type: "raw", clientId: next.clients[0].id, files: [{path: "refilm", name: "New.mp4"}]}, now);
  assert.equal(uploaded.clients[0].rawFiles.length, 2);
});
test("New work invalidates a stale stage form; unrelated client details and comments do not", () => {
  const s = fixture(), a = action(s, "Filming");
  s.tasks[0].status = "done";
  assert.throws(() => transition(s, s.members[0], a, now), /pipeline changed/);
  const current = action(s, "Filming"); s.clients[0].phone = "new phone";
  assert.doesNotThrow(() => transition(s, s.members[0], current, now));
  const moved = move(s, "Filming"); assert.throws(() => transition(moved, moved.members[0], current, now), /pipeline changed/);
});
test("Old reminders and queued push stop; new assignments notify the destination", () => {
  const s = fixture();
  s.notifications = [{id: "old-alert", userId: "john", taskId: "old", clientId: s.clients[0].id, text: "Due", read: false, createdAt: new Date(now).toISOString()}];
  s.pushQueue = [{id: "delivery", deviceId: "phone", noticeId: "old-alert", createdAt: now, attempts: 0, nextAttempt: now}];
  const next = move(s, "Campaign setup"); assert.equal(next.notifications[0].read, true); assert.equal(next.pushQueue?.length, 0);
  assert(next.notifications.some(n => n.userId === "carl" && n.taskId === next.tasks.at(-1)!.id));
  assert(next.notifications.some(n => n.userId === "john" && n.text.includes("moved")));
  const count = next.notifications.filter(n => n.taskId === "old").length; tick(next, now + 30 * hour);
  assert.equal(next.notifications.filter(n => n.taskId === "old").length, count);
});
test("Trial restart uses a new reminder cycle; active restarts recurrence without a backlog", () => {
  let s = move(fixture("Ready to launch"), "Trial"); tick(s, now + 12 * 24 * hour);
  const first = s.notifications.filter(n => n.id.includes(":trial:")); assert.equal(first.length, 2);
  s = move(s, "Active"); assert.equal(s.clients[0].trialEnd, undefined); assert.equal(s.clients[0].nextUpdate, new Date(now + 60 * hour).toISOString());
  s = move(s, "Trial"); tick(s, now + 12 * 24 * hour);
  assert.equal(s.notifications.filter(n => n.id.includes(":trial:")).length, 4);
});
test("Ready to launch creates the notified Yaniv handoff once; closing archives all unfinished tasks", () => {
  let s = move(fixture(), "Ready to launch");
  assert.equal(s.tasks.filter(t => t.campaignTaskId).length, 1);
  assert(s.notifications.some(n => n.userId === "yaniv" && n.taskId === s.tasks.at(-1)!.id));
  s = move(s, "Active"); s = move(s, "Ready to launch"); assert.equal(s.tasks.filter(t => t.campaignTaskId).length, 1);
  s.tasks.push({...s.tasks[0], id: "manual", kind: "custom", archivedAt: undefined});
  s = move(s, "Closed"); assert(s.tasks.filter(t => t.status !== "done").every(t => t.archivedAt));
});
test("Superseded open workflow tasks cannot be restored over the new assignment", () => {
  const s = move(fixture(), "Filming"), next = move(s, "Editing"), old = next.tasks[0];
  assert.throws(() => transition(next, next.members[0], {type: "restoreTask", taskId: old.id, taskVersion: taskVersion(old)}, now), /Another task/);
});
