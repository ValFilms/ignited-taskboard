"use client";
import { useState } from "react";
import type { Action, Member, State, Task } from "../lib/workflow";
import { isOwner } from "../lib/workflow";
import Dialog from "./dialog";

export default function TeamTask({ state, me, task, taskId, clientId = "", act, onClose, error }: {
  state: State; me: Member; task?: Task; taskId?: string; clientId?: string; act: (action: Action) => Promise<boolean>; onClose: () => void; error?: string;
}) {
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const run = async (action: Action, close = false) => {
    setBusy(true); setFailed(false);
    try { if (await act(action)) { if (close) onClose(); } else setFailed(true); }
    finally { setBusy(false); }
  };
  const name = (id?: string) => state.members.find(m => m.id === id)?.name || "Team member";
  return <Dialog title={taskId ? "Task details" : "New task"} onClose={onClose}>
    {failed && <p className="error" role="alert">{error || "Could not save. Check your connection and the task details, then try again."}</p>}
    {taskId && !task ? <p role="status">This task is no longer available to your account. It may have been reassigned.</p> : task ? <>
      <span className="badge">{task.status === "done" ? "Completed" : "Open"}</span>
      <h3 className="task-title">{task.title}</h3>
      <p className="muted">{task.campaignTaskId ? "Automatically created after campaign setup" : `Created by ${name(task.createdBy)}`} · {state.clients.find(c => c.id === task.clientId)?.name || "General team task"}</p>
      <p className="task-notes">{task.notes || "No additional notes."}</p>
      <p>Due: {task.dueAt ? new Date(task.dueAt).toLocaleString() : "No deadline"}</p>
      {task.completedAt && <p>Completed: {new Date(task.completedAt).toLocaleString()}</p>}
      <label>Assigned to<select aria-label="Task assignee" value={task.assignee} disabled={busy || task.status === "done"}
        onChange={e => void run({ type: "reassignTask", taskId: task.id, value: e.target.value }, true)}>
        {state.members.map(m => <option value={m.id} key={m.id}>{m.name}</option>)}
      </select></label>
      {(isOwner(me) || task.assignee === me.id || task.createdBy === me.id) && <button className="primary" disabled={busy}
        onClick={() => void run({ type: task.status === "done" ? "reopenTask" : "completeTask", taskId: task.id })}>
        {busy ? "Saving…" : task.status === "done" ? "Reopen task" : "Mark complete"}
      </button>}
    </> : <form onSubmit={e => {
      e.preventDefault(); const data = new FormData(e.currentTarget);
      const due = String(data.get("dueAt") || "");
      void run({ type: "createTask", clientId: String(data.get("clientId") || ""), task: {
        title: String(data.get("title") || ""), notes: String(data.get("notes") || ""), assignee: String(data.get("assignee")),
        dueAt: due ? new Date(due).toISOString() : null,
      } }, true);
    }}>
      <label>Task title<input name="title" required maxLength={160} autoFocus placeholder="Refilm the opening shot" /></label>
      <label>Assign to<select name="assignee" defaultValue={me.id} required>{state.members.map(m => <option value={m.id} key={m.id}>{m.name}</option>)}</select></label>
      <label>Client<select name="clientId" defaultValue={clientId}><option value="">General team task</option>{state.clients.filter(c => c.stage !== "Closed").map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
      <label>Instructions<textarea name="notes" maxLength={4000} rows={4} placeholder="What needs to happen? Include the details your teammate needs." /></label>
      <label>Due date (optional)<input type="datetime-local" name="dueAt" /></label>
      <p className="muted">Times use your device’s timezone. The assignee receives a notification.</p>
      <div className="dialog-actions"><button type="button" className="secondary" onClick={onClose}>Cancel</button><button className="primary" disabled={busy}>{busy ? "Assigning…" : "Assign task"}</button></div>
    </form>}
  </Dialog>;
}
