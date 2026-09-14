"use client";
import { useState, type ReactNode } from "react";
import { Action, Task, State, Member, isOwner, taskVersion } from "../lib/workflow";
export function BulkTasks({tasks, me, act, render}: {tasks: Task[]; me: Member; act: (a: Action) => Promise<boolean>; render: (t: Task) => ReactNode}) {
  const [selected, setSelected] = useState<Record<string,string>>({}), [busy, setBusy] = useState(false), [confirm, setConfirm] = useState(false);
  const eligible = tasks.filter(t => t.kind === "custom" && t.status === "open" && !t.archivedAt && (isOwner(me) || t.assignee === me.id || t.createdBy === me.id));
  const ids = Object.keys(selected).filter(id => eligible.some(t => t.id === id));
  const toggle = (t: Task) => {setConfirm(false); setSelected(old => {const next = {...old}; if (next[t.id]) delete next[t.id]; else next[t.id] = taskVersion(t); return next;});};
  return <><div className="bulk-toolbar">
    {!!eligible.length && <><button className="secondary" disabled={busy} onClick={() => {setSelected(ids.length === Math.min(eligible.length,100) ? {} : Object.fromEntries(eligible.slice(0,100).map(t => [t.id, taskVersion(t)]))); setConfirm(false);}}>{ids.length === Math.min(eligible.length,100) ? "Clear selection" : `Select all${eligible.length > 100 ? " (first 100)" : ""}`}</button>
    <span aria-live="polite">{ids.length} selected</span><button className="primary" disabled={busy || !ids.length} onClick={() => setConfirm(true)}>Mark selected complete</button></>}
  </div>{confirm && <div className="bulk-confirm" role="group" aria-label="Confirm bulk completion"><p>Complete {ids.length} selected tasks? Their participants will receive the usual completion notifications.</p><button disabled={busy} className="secondary" onClick={() => setConfirm(false)}>Cancel</button><button className="primary" disabled={busy || !ids.length} onClick={async () => {setBusy(true); try {if (await act({type: "bulkComplete", snapshots: ids.map(id => ({id, version: selected[id]}))})) {setSelected({}); setConfirm(false);}} finally {setBusy(false);}}}>{busy ? "Saving…" : "Confirm completion"}</button></div>}
    {tasks.map(t => <div className="selectable-row" key={t.id}>{eligible.some(e => e.id === t.id) && <input type="checkbox" aria-label={`Select task: ${t.title}`} checked={!!selected[t.id]} disabled={busy} onChange={() => toggle(t)} />}{render(t)}</div>)}
    {!!tasks.length && <p className="muted">Bulk completion applies to custom tasks. Workflow tasks keep their review and approval steps.</p>}
  </>;
}
export function BulkInbox({notices, act, open}: {notices: State["notifications"]; act: (a: Action) => Promise<boolean>; open: (n: State["notifications"][number]) => void}) {
  const [selected, setSelected] = useState<string[]>([]), [busy, setBusy] = useState(false);
  const ids = selected.filter(id => notices.some(n => n.id === id));
  const run = async (value: string, all = false) => {setBusy(true); try {if (await act({type: "bulkNotices", ids: all ? notices.slice(0,1000).map(n => n.id) : ids, value})) setSelected([]);} finally {setBusy(false);}};
  return <><div className="bulk-toolbar">
    <button className="secondary" disabled={busy || !notices.length} onClick={() => setSelected(ids.length === Math.min(notices.length,1000) ? [] : notices.slice(0,1000).map(n => n.id))}>{ids.length && ids.length === Math.min(notices.length,1000) ? "Clear selection" : "Select all"}</button>
    <span aria-live="polite">{ids.length} selected</span>
    <button className="secondary" disabled={busy || !ids.length} onClick={() => void run("read")}>Mark read</button>
    <button className="secondary" disabled={busy || !ids.length} onClick={() => void run("unread")}>Mark unread</button>
    <button data-tour="read" className="text-button" disabled={busy || !notices.length} onClick={() => void run("read", true)}>Mark all read</button>
  </div>{notices.length > 1000 && <p className="muted">Select up to 1,000 notifications at a time.</p>}
  {notices.slice().reverse().map(n => <div className="selectable-row" key={n.id}><input type="checkbox" aria-label={`Select notification: ${n.text}`} checked={ids.includes(n.id)} disabled={busy} onChange={() => setSelected(old => old.includes(n.id) ? old.filter(id => id !== n.id) : [...old, n.id])} /><button className="notice" onClick={() => open(n)}><span className={n.read ? "read-dot" : "unread-dot"}/><span>{n.text}<small>{new Date(n.createdAt).toLocaleString()}</small></span></button></div>)}
  {!notices.length && <p className="empty">Your inbox is clear.</p>}</>;
}
