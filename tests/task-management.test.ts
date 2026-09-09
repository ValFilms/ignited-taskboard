import { test } from "node:test";
import assert from "node:assert/strict";
import { demoState } from "../lib/demo";
import { transition, tick, visibleState, taskVersion, canManageTask, type Action, type State, type Task } from "../lib/workflow";
import { tasksForView } from "../lib/task-views";
import { queueNotices } from "../lib/push-state";

const now = Date.UTC(2026, 8, 10), hour = 3600000;
function fixture(creator = "carl", assignee = "john") {
  const base = demoState(); base.tasks = []; base.clients = []; base.notifications = [];
  return transition(base, base.members.find(m => m.id === creator)!, {type: "createTask", task: {title: "Film new intro", assignee, notes: "Keep the original comment history", dueAt: new Date(now + 24 * hour).toISOString()}}, now);
}
function manage(s: State, actor: string, type: string, task = s.tasks[0], data?: Action["task"]) {
  return transition(s, s.members.find(m => m.id === actor)!, {type, taskId: task.id, taskVersion: taskVersion(task), ...(data ? {task: data} : {})}, now + 1000);
}
const edit = (t: Task) => ({title: "Updated intro", notes: "New instructions", assignee: t.assignee, dueAt: t.dueAt});

for (const creator of ["owner", "yaniv", "john", "carl"]) for (const actor of ["owner", "yaniv", "john", "carl"]) {
  test(`${actor} editing/archive permissions on a task assigned by ${creator}`, () => {
    const s = fixture(creator, actor), allowed = actor === creator || ["owner", "yaniv"].includes(actor);
    assert.equal(canManageTask(s.tasks[0], s.members.find(m => m.id === actor)!), allowed);
    for (const type of ["editTask", "archiveTask"]) {
      if (allowed) assert.doesNotThrow(() => manage(s, actor, type, s.tasks[0], edit(s.tasks[0])));
      else assert.throws(() => manage(s, actor, type, s.tasks[0], edit(s.tasks[0])), /Only the task assigner/);
    }
    const archived = manage(s, creator, "archiveTask");
    if (allowed) assert.doesNotThrow(() => manage(archived, actor, "restoreTask"));
    else assert.throws(() => manage(archived, actor, "restoreTask"), /Only the task assigner/);
  });
}

test("Editing changes only editable fields, preserves creator and history, and notifies the participants", () => {
  const s = fixture(), original = structuredClone(s.tasks[0]);
  s.messages = [{id: crypto.randomUUID(), senderId: "john", body: "A saved comment", threadId: `task:${original.id}`, target: {kind: "task", taskId: original.id}, createdAt: new Date(now).toISOString()}];
  const next = manage(s, "yaniv", "editTask", original, {...edit(original), assignee: "owner", dueAt: null});
  const t = next.tasks[0];
  assert.equal(t.title, "Updated intro"); assert.equal(t.notes, "New instructions"); assert.equal(t.assignee, "owner"); assert.equal(t.dueAt, null);
  assert.equal(t.createdBy, "carl"); assert.equal(t.createdAt, original.createdAt); assert.equal(t.kind, "custom"); assert.equal(t.cycle, 1);
  assert.equal(t.updatedBy, "yaniv"); assert.deepEqual(next.messages, s.messages); assert.deepEqual(s.tasks[0], original);
  assert(next.events.some(e => e.text.includes("Yaniv updated task")));
  for (const id of ["carl", "owner", "john"]) assert(next.notifications.some(n => n.userId === id && n.text.includes("updated")));
  assert(!visibleState(next, next.members[2]).tasks.some(t => t.id === original.id));
});

test("Stale edit, delete and restore requests cannot overwrite newer changes", () => {
  const s = fixture(), old = s.tasks[0], next = manage(s, "carl", "editTask", old, edit(old));
  for (const type of ["editTask", "archiveTask"]) assert.throws(() => transition(next, next.members[0], {type, taskId: old.id, taskVersion: taskVersion(old), task: edit(old)}, now), /changed while/);
  assert.throws(() => transition(next, next.members[0], {type: "editTask", taskId: old.id, task: edit(old)}, now), /changed while/);
  const archived = manage(next, "carl", "archiveTask");
  assert.throws(() => transition(archived, archived.members[0], {type: "restoreTask", taskId: old.id, taskVersion: taskVersion(next.tasks[0])}, now), /changed while/);
});

test("Edit validation preserves old overdue deadlines, rejects malformed values and forged protected fields", () => {
  const s = fixture(); s.tasks[0].dueAt = new Date(now - hour).toISOString(); const t = s.tasks[0];
  assert.doesNotThrow(() => manage(s, "owner", "editTask", t, edit(t)));
  for (const bad of [{title: " "}, {title: 7}, {title: "x".repeat(161)}, {notes: 7}, {notes: "x".repeat(4001)}, {assignee: "outsider"}, {dueAt: "bad"}, {dueAt: 0}, {dueAt: new Date(now - 2 * hour).toISOString()}])
    assert.throws(() => manage(s, "owner", "editTask", t, {...edit(t), ...bad} as Action["task"]));
  const next = manage(s, "owner", "editTask", t, {...edit(t), createdBy: "john", status: "done", kind: "campaign", clientId: "private", archivedAt: "forged"} as Action["task"]);
  assert.equal(next.tasks[0].createdBy, "carl"); assert.equal(next.tasks[0].status, "open"); assert.equal(next.tasks[0].kind, "custom"); assert.equal(next.tasks[0].clientId, ""); assert.equal(next.tasks[0].archivedAt, undefined);
  assert.throws(() => transition(s, {...s.members[2], role: "approver"}, {type: "archiveTask", taskId: t.id, taskVersion: taskVersion(t)}, now), /Unauthorized/);
});

test("Archive preserves task and comments, removes it from active filters, and cancels old reminders", () => {
  let s = fixture(), t = s.tasks[0];
  s = transition(s, s.members[2], {type: "sendMessage", message: {id: crypto.randomUUID(), body: "Keep this comment", target: {kind: "task", taskId: t.id}}}, now);
  tick(s, now + 25 * hour);
  const oldNotices = new Set(s.notifications.map(n => n.id));
  s.pushDevices = [{id: "device", userId: "john", endpoint: "fake", keys: {auth: "fake", p256dh: "fake"}, createdAt: now}];
  queueNotices(s, new Set(), now); assert(s.pushQueue!.length);
  const archived = manage(s, "carl", "archiveTask");
  assert.equal(archived.tasks[0].status, t.status); assert.equal(archived.tasks[0].dueAt, t.dueAt); assert.deepEqual(archived.messages, s.messages);
  assert.equal(archived.tasks[0].archivedBy, "carl"); assert(archived.notifications.filter(n => oldNotices.has(n.id)).every(n => n.read)); assert.deepEqual(archived.pushQueue, []);
  const count = archived.notifications.length; tick(archived, now + 100 * hour); assert.equal(archived.notifications.length, count);
  for (const filter of ["mine", "sent", "all", "overdue", "completed"]) assert.deepEqual(tasksForView(archived.tasks, "john", filter), []);
  assert.equal(tasksForView(archived.tasks, "john", "archive").length, 1);
  const unrelated = visibleState(archived, {...archived.members[2], id: "unrelated"}); assert.deepEqual(unrelated.tasks, []); assert.deepEqual(unrelated.messages, []);
  for (const type of ["completeTask", "reopenTask", "reassignTask"]) assert.throws(() => transition(archived, archived.members[0], {type, taskId: t.id, value: "john"}, now), /Restore/);
  assert.throws(() => manage(archived, "owner", "editTask", archived.tasks[0], edit(t)), /Restore/);
  assert.throws(() => transition(archived, archived.members[2], {type: "sendMessage", message: {id: crypto.randomUUID(), body: "New comment", target: {kind: "task", taskId: t.id}}}, now), /Restore/);
  const restored = manage(archived, "carl", "restoreTask");
  assert.equal(restored.tasks[0].archivedAt, undefined); assert.equal(restored.tasks[0].archivedBy, undefined); assert.equal(restored.tasks[0].cycle, t.cycle + 1);
  assert.deepEqual(restored.messages, s.messages); assert.equal(tasksForView(restored.tasks, "john", "mine").length, 1);
  assert.doesNotThrow(() => transition(restored, restored.members[2], {type: "sendMessage", message: {id: crypto.randomUUID(), body: "Back to work", target: {kind: "task", taskId: t.id}}}, now));
});

test("Completed tasks restore as completed, with their completion timestamp and comments intact", () => {
  let s = fixture(); s = transition(s, s.members[2], {type: "completeTask", taskId: s.tasks[0].id}, now + 1);
  const complete = structuredClone(s.tasks[0]);
  const updated = manage(s, "owner", "editTask", complete, edit(complete));
  assert.equal(updated.tasks[0].status, "done");
  assert.throws(() => manage(s, "owner", "editTask", complete, {...edit(complete), assignee: "carl"}), /Completed/);
  const restored = manage(manage(s, "carl", "archiveTask"), "yaniv", "restoreTask");
  assert.equal(restored.tasks[0].status, "done"); assert.equal(restored.tasks[0].completedAt, complete.completedAt); assert.equal(tasksForView(restored.tasks, "john", "completed").length, 1);
});

for (const index of [0, 1, 2]) test(`Owners can manage legacy workflow task ${index} without bypassing its workflow`, () => {
  const s = demoState(), t = s.tasks[index]; t.dueAt = t.status === "review" ? null : new Date(now + 24 * hour).toISOString();
  for (const owner of ["owner", "yaniv"]) {
    const updated = manage(s, owner, "editTask", t, edit(t));
    assert.deepEqual(updated.clients, s.clients); assert.equal(updated.tasks[index].status, t.status);
    assert.throws(() => manage(s, owner, "editTask", t, {...edit(t), assignee: "owner"}), /matching role/);
    const archived = manage(s, owner, "archiveTask", t); assert.deepEqual(archived.clients, s.clients);
    for (const type of ["submit", "approve", "revise", "campaign", "reassign"]) assert.throws(() => transition(archived, archived.members[0], {type, clientId: t.clientId, taskId: t.id, value: "john"}, now), /Restore/);
    const restored = manage(archived, owner, "restoreTask", archived.tasks[index]); assert.equal(restored.tasks[index].status, t.status); assert.deepEqual(restored.clients, s.clients);
  }
  assert.throws(() => manage(s, t.assignee, "archiveTask", t), /Only the task assigner/);
  if (t.status === "review") assert.throws(() => manage(s, "owner", "editTask", t, {...edit(t), dueAt: new Date(now + hour).toISOString()}), /awaiting approval/);
});

test("Restoring an old workflow task cannot conflict with a newer task or advance a client's stage", () => {
  const s = demoState(), old = s.tasks[1]; let archived = manage(s, "owner", "archiveTask", old);
  archived.clients[1].stage = "Ready to launch";
  assert.throws(() => manage(archived, "owner", "restoreTask", archived.tasks[1]), /moved on/);
  archived.clients[1].stage = "Editing";
  archived.tasks.push({...old, id: "replacement"});
  assert.throws(() => manage(archived, "owner", "restoreTask", archived.tasks[1]), /already active/);
});

test("Deleting an overdue recurring update skips its occurrence, and later recurrence prevents duplicate restoration", () => {
  const s = demoState(); s.tasks = []; s.notifications = []; s.clients = [s.clients[7]]; s.clients[0].nextUpdate = new Date(now - hour).toISOString();
  tick(s, now); const task = s.tasks[0]; assert.equal(task.createdBy, s.clients[0].owner);
  s.clients[0].nextUpdate = new Date(now - hour).toISOString();
  const archived = manage(s, "owner", "archiveTask"); tick(archived, now + hour); assert.equal(archived.tasks.length, 1);
  tick(archived, now + 85 * hour); assert.equal(archived.tasks.length, 2); assert(!archived.tasks[1].archivedAt);
  assert.throws(() => manage(archived, "owner", "restoreTask", archived.tasks[0]), /already active/);
});

test("A workflow transition invalidates an old edit snapshot and automatic assignments record who assigned", () => {
  const s = demoState(), original = s.tasks[0];
  const approved = transition(s, s.members[0], {type: "approve", clientId: original.clientId, taskId: original.id}, now);
  assert.equal(approved.tasks.at(-1)!.createdBy, "owner");
  assert.throws(() => transition(approved, approved.members[1], {type: "editTask", taskId: original.id, taskVersion: taskVersion(original), task: edit(original)}, now), /changed while/);
});
