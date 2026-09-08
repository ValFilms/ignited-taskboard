import { test } from "node:test";
import assert from "node:assert/strict";
import { demoState } from "../lib/demo";
import { transition, visibleState, tick, type Action } from "../lib/workflow";
const now = Date.UTC(2026, 8, 8);
const task = { title: "Refilm opening shot", assignee: "owner", notes: "Use the landscape shot", dueAt: new Date(now + 86400000).toISOString() };

for (const from of ["owner", "yaniv", "john", "carl"]) for (const to of ["owner", "yaniv", "john", "carl"]) {
  test(`${from} can assign a general task to ${to}`, () => {
    const s = demoState(), actor = s.members.find(m => m.id === from)!;
    const next = transition(s, actor, { type: "createTask", task: { ...task, assignee: to } }, now);
    const created = next.tasks.at(-1)!;
    assert.equal(created.createdBy, from); assert.equal(created.assignee, to); assert.equal(created.kind, "custom");
    assert(visibleState(next, next.members.find(m => m.id === to)!).tasks.some(t => t.id === created.id));
    assert(visibleState(next, actor).tasks.some(t => t.id === created.id));
    assert(next.notifications.some(n => n.userId === to && n.taskId === created.id));
    assert.deepEqual(next.clients, s.clients); assert.equal(s.tasks.length + 1, next.tasks.length);
  });
}
test("Karl's client refilming request reaches owner; unrelated staff cannot see or change it", () => {
  const s = demoState(), karl = s.members[3];
  const clientId = visibleState(s, karl).clients[0].id;
  const next = transition(s, karl, { type: "createTask", clientId, task }, now), created = next.tasks.at(-1)!;
  const john = next.members[2];
  assert(!visibleState(next, john).tasks.some(t => t.id === created.id));
  for (const type of ["completeTask", "reassignTask", "reopenTask"]) assert.throws(() => transition(next, john, { type, taskId: created.id, value: "john" }), /Only/);
  assert.throws(() => transition(s, karl, { type: "createTask", clientId: "demo-6", task }, now), /accessible/);
  assert.deepEqual(next.clients, s.clients);
});
test("Custom completion notifies creator, reopens, and never advances the delivery stage", () => {
  let s = demoState(); s = transition(s, s.members[3], { type: "createTask", task }, now);
  const id = s.tasks.at(-1)!.id, clients = structuredClone(s.clients);
  s = transition(s, s.members[0], { type: "completeTask", taskId: id }, now + 1);
  assert.equal(s.tasks.at(-1)!.status, "done"); assert(s.notifications.some(n => n.userId === "carl" && n.text.includes("completed")));
  assert.throws(() => transition(s, s.members[0], { type: "completeTask", taskId: id }), /already/);
  s = transition(s, s.members[3], { type: "reopenTask", taskId: id }, now + 2);
  assert.equal(s.tasks.at(-1)!.status, "open"); assert.equal(s.tasks.at(-1)!.cycle, 1); assert.deepEqual(s.clients, clients);
});
test("Any participant can hand off a custom task without moving its deadline", () => {
  let s = demoState(); s = transition(s, s.members[3], { type: "createTask", task }, now);
  const id = s.tasks.at(-1)!.id;
  s = transition(s, s.members[0], { type: "reassignTask", taskId: id, value: "john" }, now + 1);
  assert.equal(s.tasks.at(-1)!.assignee, "john"); assert.equal(s.tasks.at(-1)!.dueAt, task.dueAt);
  s = transition(s, s.members[2], { type: "reassignTask", taskId: id, value: "yaniv" }, now + 2);
  assert.equal(s.tasks.at(-1)!.assignee, "yaniv");
  assert(!visibleState(s, s.members[2]).tasks.some(t => t.id === id));
  assert(visibleState(s, s.members[3]).tasks.some(t => t.id === id));
});
test("Task input is validated and automatic workflow tasks cannot bypass review", () => {
  const s = demoState();
  for (const bad of [{ title: " " }, { title: 123 }, { title: "x".repeat(161) }, { assignee: "outsider" }, { notes: 4 }, { notes: "x".repeat(4001) }, { dueAt: "broken" }, { dueAt: 0 }, { dueAt: new Date(now - 1).toISOString() }])
    assert.throws(() => transition(s, s.members[0], { type: "createTask", task: { ...task, ...bad } } as Action, now));
  for (const type of ["completeTask", "reopenTask", "reassignTask"]) assert.throws(() => transition(s, s.members[0], { type, taskId: s.tasks[0].id, value: "owner" }), /Task not found/);
});
test("Task deadline notices deduplicate, and completed/no-deadline tasks stay quiet", () => {
  let s = demoState(); s.clients = []; s.tasks = []; s.notifications = [];
  s = transition(s, s.members[3], { type: "createTask", task }, now);
  const id = s.tasks[0].id;
  tick(s, now + 20 * 3600000); const count = s.notifications.length; tick(s, now + 20 * 3600000); assert.equal(s.notifications.length, count);
  assert(s.notifications.some(n => n.taskId === id && n.text.includes("within 6 hours")));
  s = transition(s, s.members[0], { type: "completeTask", taskId: id }, now + 21 * 3600000);
  const completed = s.notifications.length; tick(s, now + 30 * 3600000); assert.equal(s.notifications.length, completed);
  s = transition(s, s.members[0], { type: "createTask", task: { ...task, dueAt: null } }, now);
  const noDeadline = s.notifications.length; tick(s, now + 100 * 3600000); assert.equal(s.notifications.length, noDeadline);
});
