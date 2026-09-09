import { test } from "node:test";
import assert from "node:assert/strict";
import { demoState } from "../lib/demo";
import { transition, visibleState, taskVersion, canChangeTaskClient, type State, type Task } from "../lib/workflow";

const now = Date.UTC(2026, 8, 10);
function fixture() {
  const s = demoState();
  return transition(s, s.members[3], {type: "createTask", task: {title: "Follow up on the footage", notes: "Original instructions", assignee: "john", dueAt: new Date(now + 86400000).toISOString()}}, now);
}
const fields = (t: Task) => ({title: t.title, notes: t.notes || "", assignee: t.assignee, dueAt: t.dueAt});
function move(s: State, actor: string, clientId: string | undefined, snapshot = s.tasks.at(-1)!) {
  return transition(s, s.members.find(m => m.id === actor)!, {
    type: "editTask", taskId: snapshot.id, taskVersion: taskVersion(snapshot), clientId, task: fields(snapshot),
  }, now + 1000);
}

for (const actor of ["owner", "yaniv", "carl"]) test(`${actor} can move a manual task from general to client, another client and back without losing its history`, () => {
  let s = fixture();
  // Karl has access to demo-2 from his campaign work and demo-1 from this separate assignment.
  s = transition(s, s.members[0], {type: "createTask", clientId: "demo-1", task: {title: "Separate client context", assignee: "carl", dueAt: null}}, now);
  const original = s.tasks.at(-2)!, id = original.id;
  s = transition(s, s.members[2], {type: "sendMessage", message: {id: crypto.randomUUID(), body: "Keep this comment", target: {kind: "task", taskId: id}}}, now);
  const clients = structuredClone(s.clients), comments = structuredClone(s.messages), originalNotices = structuredClone(s.notifications);
  for (const clientId of ["demo-2", "demo-1", ""]) {
    const before = s.tasks.find(t => t.id === id)!;
    s = move(s, actor, clientId, before);
    const task = s.tasks.find(t => t.id === id)!;
    assert.equal(task.clientId, clientId);
    for (const key of ["id", "title", "notes", "createdBy", "createdAt", "kind", "assignee", "dueAt", "status", "cycle"] as const) assert.equal(task[key], original[key]);
    assert.deepEqual(s.clients, clients); assert.deepEqual(s.messages, comments);
    assert.deepEqual(s.notifications.slice(0, originalNotices.length), originalNotices);
    assert.equal(task.updatedBy, actor); assert.notEqual(taskVersion(task), taskVersion(before));
    assert(s.events.some(e => e.clientId === before.clientId && e.text.includes("moved task")));
    assert(s.events.some(e => e.clientId === clientId && e.text.includes("moved task")));
    const added = s.notifications.slice(-([...new Set([task.createdBy, task.assignee])].filter(id => id !== actor).length));
    assert(added.every(n => n.clientId === clientId && n.taskId === id));
  }
});

test("Recipients cannot edit the client; assigners can only select accessible non-closed clients", () => {
  const s = fixture(), original = structuredClone(s);
  assert.throws(() => move(s, "john", "demo-1"), /Only the task assigner/);
  assert.throws(() => move(s, "carl", "demo-6"), /accessible/);
  for (const clientId of ["missing", " ", null, 0, {}, []]) {
    assert.throws(() => move(s, "owner", clientId as string), /valid client|accessible/);
  }
  assert.deepEqual(s, original);
  s.clients[6].stage = "Closed";
  assert.throws(() => move(s, "owner", "demo-6"), /not closed/);
});

test("Client context follows the task, preserves field redaction and drops the old client's access", () => {
  let s = fixture();
  s.clients[2].email = "private@example.test"; s.clients[2].phone = "555-0100";
  const id = s.tasks.at(-1)!.id, john = s.members[2];
  assert(!visibleState(s, john).clients.some(c => c.id === "demo-2"));
  s = move(s, "owner", "demo-2");
  let visible = visibleState(s, john);
  assert.equal(visible.tasks.find(t => t.id === id)!.clientId, "demo-2");
  assert.equal(visible.clients.find(c => c.id === "demo-2")!.email, "");
  assert.equal(visible.clients.find(c => c.id === "demo-2")!.phone, "");
  s = move(s, "yaniv", "demo-6"); visible = visibleState(s, john);
  assert(!visible.clients.some(c => c.id === "demo-2")); assert(visible.clients.some(c => c.id === "demo-6"));
  s = move(s, "owner", ""); assert(!visibleState(s, john).clients.some(c => c.id === "demo-6"));
  assert(visibleState(s, john).tasks.some(t => t.id === id));
});

test("Older edit forms keep the client link, and an already-closed link can be kept or removed", () => {
  let s = move(fixture(), "owner", "demo-6");
  s.clients[6].stage = "Closed";
  assert.equal(move(s, "owner", undefined).tasks.at(-1)!.clientId, "demo-6");
  assert.equal(move(s, "carl", "demo-6").tasks.at(-1)!.clientId, "demo-6");
  assert.equal(move(s, "carl", "").tasks.at(-1)!.clientId, "");
});

test("Completed manual tasks can change client without reopening; archived tasks must be restored first", () => {
  let s = fixture(), t = s.tasks.at(-1)!;
  s = transition(s, s.members[2], {type: "completeTask", taskId: t.id}, now + 1); t = s.tasks.at(-1)!;
  s = move(s, "owner", "demo-2");
  assert.equal(s.tasks.at(-1)!.status, "done"); assert.equal(s.tasks.at(-1)!.completedAt, t.completedAt);
  const archived = transition(s, s.members[0], {type: "archiveTask", taskId: t.id, taskVersion: taskVersion(s.tasks.at(-1)!)}, now + 2);
  assert.throws(() => move(archived, "owner", ""), /Restore/);
});

test("Automatic workflow tasks, including campaign-linked Closebot work, cannot switch clients", () => {
  const s = fixture(), custom = s.tasks.at(-1)!;
  const tasks = [...s.tasks.slice(0, 3), {...custom, id: "update", kind: "update" as const, clientId: "demo-7", assignee: "owner"},
    {...custom, id: "closebot", clientId: "demo-2", campaignTaskId: "campaign-2"}];
  s.tasks = tasks;
  for (const t of tasks) {
    assert.equal(canChangeTaskClient(t), false);
    for (const actor of ["owner", "yaniv"]) {
      for (const target of ["", "demo-6"]) assert.throws(() => move(s, actor, target, t), /Workflow tasks/);
      assert.equal(move(s, actor, t.clientId, t).tasks.find(task => task.id === t.id)!.clientId, t.clientId);
    }
  }
});

test("A stale client edit cannot overwrite another client move or task edit", () => {
  const s = fixture(), old = s.tasks.at(-1)!;
  const moved = move(s, "owner", "demo-2");
  assert.throws(() => move(moved, "yaniv", "demo-6", old), /changed while/);
  const changed = transition(s, s.members[3], {type: "editTask", taskId: old.id, taskVersion: taskVersion(old), task: {...fields(old), notes: "New instructions"}}, now + 1);
  assert.throws(() => move(changed, "owner", "demo-2", old), /changed while/);
  assert.equal(changed.tasks.at(-1)!.notes, "New instructions"); assert.equal(changed.tasks.at(-1)!.clientId, "");
});
