"use client";
import { useRef, useState } from "react";
import { Archive, Pencil, RotateCcw, Trash2 } from "lucide-react";
import type { Action, Member, State, Task } from "../lib/workflow";
import { canAssignTask, canChangeTaskClient, canManageTask, isOwner, taskVersion } from "../lib/workflow";
import Dialog from "./dialog";
import { Conversation } from "./team-chat";

function localDeadline(value: string | null) {
  if (!value) return "";
  const date = new Date(value);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export default function TeamTask({ state, me, task, taskId, clientId = "", act, onClose, onOpenClient, error }: {
  state: State; me: Member; task?: Task; taskId?: string; clientId?: string;
  act: (action: Action) => Promise<boolean>; onClose: () => void; onOpenClient?: (id: string) => void; error?: string;
}) {
  const [busy, setBusy] = useState(false), [failed, setFailed] = useState(false);
  const [editing, setEditing] = useState<Task | null>(null), [deleting, setDeleting] = useState<Task | null>(null);
  const [editingClientId, setEditingClientId] = useState("");
  const sending = useRef(false);
  const run = async (action: Action, close = false) => {
    if (sending.current) return false;
    sending.current = true; setBusy(true); setFailed(false);
    try {
      if (await act(action)) { if (close) onClose(); return true; }
      setFailed(true); return false;
    } catch { setFailed(true); return false; }
    finally { sending.current = false; setBusy(false); }
  };
  const name = (id?: string) => state.members.find(m => m.id === id)?.name || "Team member";
  const manageable = !!task && canManageTask(task, me);
  const changed = !!editing && !!task && taskVersion(editing) !== taskVersion(task);
  const editForm = (snapshot: Task) => <form key={taskVersion(snapshot)} onSubmit={e => {
    e.preventDefault(); const data = new FormData(e.currentTarget), due = String(data.get("dueAt") || "");
    void run({type: "editTask", taskId: snapshot.id, taskVersion: taskVersion(snapshot),
      clientId: canChangeTaskClient(snapshot) ? editingClientId : snapshot.clientId, task: {
      title: String(data.get("title") || ""), notes: String(data.get("notes") || ""),
      assignee: snapshot.status === "done" ? snapshot.assignee : String(data.get("assignee")),
      dueAt: snapshot.status !== "open" || due === localDeadline(snapshot.dueAt) ? snapshot.dueAt : due ? new Date(due).toISOString() : null,
    }}).then(saved => {if (saved) setEditing(null);});
  }}>
    {changed && <p className="error" role="alert">This task has changed. Your draft is still here. Cancel and reopen Edit task to review the latest details before saving.</p>}
    <fieldset disabled={busy} className="task-fields">
      <label>Task title<input name="title" required maxLength={160} defaultValue={snapshot.title} autoFocus /></label>
      <label>Assign to<select aria-label="Assign to" name="assignee" defaultValue={snapshot.assignee} disabled={snapshot.status === "done"} required>
        {state.members.filter(m => m.id === snapshot.assignee || canAssignTask(snapshot, m)).map(m => <option value={m.id} key={m.id}>{m.name}</option>)}
      </select></label>
      <label>Client<select name="clientId" value={editingClientId} onChange={e => setEditingClientId(e.target.value)} disabled={!canChangeTaskClient(snapshot)}>
        <option value="">General team task</option>
        {editingClientId && !state.clients.some(c => c.id === editingClientId) && <option value={editingClientId}>Unavailable client</option>}
        {state.clients.filter(c => c.id === snapshot.clientId || c.id === editingClientId || canChangeTaskClient(snapshot) && c.stage !== "Closed")
          .sort((a, b) => a.name.localeCompare(b.name)).map(c => <option key={c.id} value={c.id}>{c.name}{c.stage === "Closed" ? " (closed)" : ""}</option>)}
      </select></label>
      {!canChangeTaskClient(snapshot) && <p className="muted">This task is part of its client's workflow and stays linked to that client.</p>}
      <label>Instructions<textarea aria-label="Instructions" name="notes" maxLength={4000} rows={4} defaultValue={snapshot.notes || ""} /></label>
      <label>Due date (optional)<input type="datetime-local" name="dueAt" defaultValue={localDeadline(snapshot.dueAt)} disabled={snapshot.status !== "open"} /></label>
      <p className="muted">Times use your device’s timezone. {snapshot.status === "review" ? "The deadline stays paused during approval." : snapshot.status === "done" ? "Completed tasks keep their assignee and deadline." : "The original deadline stays unless you change it."}</p>
      <div className="dialog-actions"><button type="button" className="secondary" onClick={() => {setEditing(null); setFailed(false);}}>Cancel</button><button className="primary" disabled={changed}>{busy ? "Saving…" : "Save changes"}</button></div>
    </fieldset>
  </form>;
  return <Dialog title={editing ? "Edit task" : deleting ? "Delete task" : task?.archivedAt ? "Archived task" : taskId ? "Task details" : "New task"} onClose={onClose}>
    {failed && <p className="error" role="alert">{error || "Could not save. Check your connection and the latest task details, then try again."}</p>}
    {taskId && !task ? <p role="status">This task is no longer available to your account. It may have been reassigned.</p> : task ? <>
      {editing && manageable && !task.archivedAt ? editForm(editing) : deleting && manageable && !task.archivedAt ? <div className="archive-confirm">
        <Trash2 size={28} /><h3 className="task-title">Move “{task.title}” to Archive?</h3>
        <p>It will leave active task lists and its reminders will stop. Its details and comments stay saved, and you can restore it from Archive.</p>
        {task.kind !== "custom" && task.status !== "done" && <p className="muted">{task.kind === "update" ? "This skips the current progress update. Future scheduled updates can still appear." : "This client step will stay paused until the task is restored."}</p>}
        <div className="dialog-actions"><button className="secondary" disabled={busy} onClick={() => {setDeleting(null); setFailed(false);}}>Keep task</button><button className="danger-button" disabled={busy} onClick={() => void run({type: "archiveTask", taskId: task.id, taskVersion: taskVersion(deleting)}).then(saved => {if (saved) setDeleting(null);})}>{busy ? "Deleting…" : "Delete and archive"}</button></div>
      </div> : <>
        <span className="badge">{task.archivedAt ? "Archived" : task.status === "done" ? "Completed" : task.status === "review" ? "Awaiting approval" : "Open"}</span>
        <h3 className="task-title">{task.title}</h3>
        <p className="muted">{task.createdBy ? `Assigned by ${name(task.createdBy)}` : "Created by the client workflow"} · {state.clients.find(c => c.id === task.clientId)?.name || "General team task"}</p>
        <p className="task-notes">{task.notes || "No additional instructions."}</p>
        <p>Assigned to: <strong>{name(task.assignee)}</strong></p>
        <p>Due: {task.dueAt ? new Date(task.dueAt).toLocaleString() : "No deadline"}</p>
        {task.completedAt && <p>Completed: {new Date(task.completedAt).toLocaleString()}</p>}
        {task.updatedAt && <p className="muted">Last changed by {name(task.updatedBy)} · {new Date(task.updatedAt).toLocaleString()}</p>}
        {task.archivedAt ? <div className="archive-note"><Archive size={20}/><div><strong>Saved in Archive</strong><p>Deleted by {name(task.archivedBy)} on {new Date(task.archivedAt).toLocaleString()}. Restoring keeps the original status and deadline.</p>
          {manageable && <button className="primary" disabled={busy} onClick={() => void run({type: "restoreTask", taskId: task.id, taskVersion: taskVersion(task)}, true)}><RotateCcw size={17}/>{busy ? "Restoring…" : "Restore task"}</button>}
          {!manageable && <p className="muted">The task assigner or a workspace owner can restore it.</p>}
        </div></div> : <>
          {manageable && <div className="task-management"><button className="secondary" disabled={busy} onClick={() => {setEditing(structuredClone(task)); setEditingClientId(task.clientId); setFailed(false);}}><Pencil size={17}/>Edit task</button><button className="danger-button" disabled={busy} onClick={() => {setDeleting(structuredClone(task)); setFailed(false);}}><Trash2 size={17}/>Delete task</button></div>}
          {task.kind === "custom" && (isOwner(me) || task.assignee === me.id || task.createdBy === me.id) && <button data-tour="complete-task" className="primary" disabled={busy}
            onClick={() => void run({ type: task.status === "done" ? "reopenTask" : "completeTask", taskId: task.id })}>
            {busy ? "Saving…" : task.status === "done" ? "Reopen task" : "Mark complete"}
          </button>}
          {task.kind !== "custom" && onOpenClient && <button className="primary" disabled={busy} onClick={() => onOpenClient(task.clientId)}>Open client workflow</button>}
          {task.kind !== "custom" && me.role === "approver" && <p className="muted">To move this video work forward or back, open the client workflow and use Move pipeline. Your completed task and comments stay in history.</p>}
        </>}
        <h3>Task comments</h3>
        <p className="muted">Visible to owners, the assignee, and the task creator.</p>
        <Conversation key={`${me.id}:${task.id}`} state={state} me={me} target={{kind: "task", taskId: task.id}} act={act} error={error} />
      </>}
    </> : <form data-tour="task-form" onSubmit={e => {
      e.preventDefault(); const data = new FormData(e.currentTarget), due = String(data.get("dueAt") || "");
      void run({type: "createTask", clientId: String(data.get("clientId") || ""), task: {
        title: String(data.get("title") || ""), notes: String(data.get("notes") || ""), assignee: String(data.get("assignee")),
        dueAt: due ? new Date(due).toISOString() : null,
      }}, true);
    }}>
      <fieldset disabled={busy} className="task-fields">
        <label>Task title<input name="title" required maxLength={160} autoFocus placeholder="Refilm the opening shot" /></label>
        <label>Assign to<select aria-label="Assign to" name="assignee" defaultValue={me.id} required>{state.members.map(m => <option value={m.id} key={m.id}>{m.name}</option>)}</select></label>
        <label>Client<select name="clientId" defaultValue={clientId}><option value="">General team task</option>{state.clients.filter(c => c.stage !== "Closed").map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
        <label>Instructions<textarea aria-label="Instructions" name="notes" maxLength={4000} rows={4} placeholder="What needs to happen? Include the details your teammate needs." /></label>
        <label>Due date (optional)<input type="datetime-local" name="dueAt" /></label>
        <p className="muted">Times use your device’s timezone. The assignee receives a notification.</p>
        <div className="dialog-actions"><button type="button" className="secondary" onClick={onClose}>Cancel</button><button className="primary">{busy ? "Assigning…" : "Assign task"}</button></div>
      </fieldset>
    </form>}
  </Dialog>;
}
