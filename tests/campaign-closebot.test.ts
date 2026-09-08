import { test } from "node:test";
import assert from "node:assert/strict";
import { demoState } from "../lib/demo";
import { transition, visibleState, tick } from "../lib/workflow";

const now = Date.UTC(2026, 8, 8);
const action = { type: "campaign", clientId: "demo-2", taskId: "campaign-2" };

test("Campaign completion creates a linked Closebot task and notification for Yaniv's actual account", () => {
  const s = demoState();
  s.members[1] = { ...s.members[1], id: "actual-auth-uuid", name: " YANIV Itskovich " };
  const next = transition(s, s.members[3], action, now);
  const task = next.tasks.find(t => t.campaignTaskId === action.taskId)!;
  assert(task);
  assert.equal(task.assignee, "actual-auth-uuid");
  assert.equal(task.clientId, action.clientId);
  assert.equal(task.kind, "custom");
  assert.equal(task.title, "Integrate Closebot with GHL and Facebook");
  assert.equal(task.status, "open");
  assert.equal(task.dueAt, null);
  assert.equal(task.createdBy, "owner");
  assert.equal(next.clients.find(c => c.id === action.clientId)!.stage, "Ready to launch");
  const notices = next.notifications.filter(n => n.taskId === task.id);
  assert.equal(notices.length, 1);
  assert.equal(notices[0].userId, task.assignee);
  assert.equal(notices[0].read, false);
  assert(visibleState(next, next.members[1]).tasks.some(t => t.id === task.id));
  assert(!visibleState(next, next.members[2]).tasks.some(t => t.id === task.id));
  assert(!s.tasks.some(t => t.campaignTaskId));
  assert.throws(() => transition(next, next.members[3], action, now), /not open/);
  assert.equal(next.tasks.filter(t => t.campaignTaskId === action.taskId).length, 1);
});

test("Yaniv can complete and reopen the automatic task; completion notifies the client owner", () => {
  let s = demoState(); s = transition(s, s.members[3], action, now);
  const id = s.tasks.find(t => t.campaignTaskId === action.taskId)!.id;
  assert.throws(() => transition(s, s.members[3], { type: "completeTask", taskId: id }, now), /Only task participants/);
  s = transition(s, s.members[1], { type: "completeTask", taskId: id }, now + 1);
  assert.equal(s.tasks.find(t => t.id === id)!.status, "done");
  assert(s.notifications.some(n => n.taskId === id && n.userId === "owner" && n.text.includes("completed")));
  s = transition(s, s.members[1], { type: "reopenTask", taskId: id }, now + 2);
  assert.equal(s.tasks.find(t => t.id === id)!.status, "open");
  assert.equal(s.clients.find(c => c.id === action.clientId)!.stage, "Ready to launch");
});

test("Missing or ambiguous Yaniv membership fails atomically instead of silently assigning someone else", () => {
  for (const duplicate of [false, true]) {
    const s = demoState();
    if (duplicate) s.members.push({ id: "other-yaniv", name: "Yaniv Other", role: "manager" });
    else s.members[1].name = "Another manager";
    const before = structuredClone(s);
    assert.throws(() => transition(s, s.members[3], action, now), /Configure one team member named Yaniv/);
    assert.deepEqual(s, before);
  }
});

test("Refresh and deadline processing do not backfill old campaigns or duplicate Closebot tasks", () => {
  let s = demoState();
  s = transition(s, s.members[0], { type: "refresh" }, now);
  tick(s, now);
  assert(!s.tasks.some(t => t.campaignTaskId));
  s = transition(s, s.members[3], action, now);
  const id = s.tasks.find(t => t.campaignTaskId === action.taskId)!.id;
  tick(s, now + 86400000);
  tick(s, now + 86400000);
  assert.equal(s.tasks.filter(t => t.campaignTaskId === action.taskId).length, 1);
  assert.equal(s.notifications.filter(n => n.taskId === id).length, 1);
});
