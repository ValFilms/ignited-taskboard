"use client";
import { useState } from "react";
import { Action, Member, State, TaskTemplate, isOwner } from "../lib/workflow";
export default function ClientTaskForm({state, me, clientId = "", run, busy}: {state: State; me: Member; clientId?: string; run: (a: Action, close?: boolean) => Promise<boolean>; busy: boolean}) {
  const [client, setClient] = useState(clientId), [title, setTitle] = useState(""), [notes, setNotes] = useState(""), [category, setCategory] = useState("");
  const [templateId, setTemplateId] = useState("");
  const [templateRevision, setTemplateRevision] = useState((state.clientDirectory || state.clients).find(c => c.id === clientId)?.templateRevision || 0);
  const directory = state.clientDirectory || state.clients;
  const current = directory.find(c => c.id === client), templates = current?.taskTemplates || [];
  const apply = (t?: TaskTemplate) => {setTemplateRevision(current?.templateRevision || 0); setTemplateId(t?.id || ""); if (t) {setTitle(t.title); setCategory(t.category); setNotes(t.notes);}};
  return <form data-tour="task-form" onSubmit={e => {
    e.preventDefault(); const data = new FormData(e.currentTarget), due = String(data.get("dueAt") || "");
    void run({type: "createTask", clientId: client, task: {title, notes, category, assignee: String(data.get("assignee")), dueAt: due ? new Date(due).toISOString() : null}}, true);
  }}><fieldset disabled={busy} className="task-fields">
    <label>Client<select aria-label="Client" name="clientId" value={client} onChange={e => {setClient(e.target.value); setTemplateId(""); setCategory(""); setTemplateRevision(directory.find(c => c.id === e.target.value)?.templateRevision || 0);}}><option value="">General team task</option>{directory.filter(c => c.stage !== "Closed").slice().sort((a,b) => a.name.localeCompare(b.name)).map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
    {current && <label>Client template<select aria-label="Client template" value={templateId} onChange={e => apply(templates.find(t => t.id === e.target.value))}><option value="">Custom task</option>{templates.map(t => <option key={t.id} value={t.id}>{t.category ? `${t.category} · ` : ""}{t.title}</option>)}</select></label>}
    <label>Task title<input name="title" required maxLength={160} value={title} onChange={e => setTitle(e.target.value)} placeholder="What needs to happen?" /></label>
    <label>Category<input aria-label="Category" name="category" maxLength={80} list="client-task-categories" value={category} onChange={e => setCategory(e.target.value)} placeholder="For example: Content, Ads, Client follow-up"/><datalist id="client-task-categories">{[...new Set(templates.map(t => t.category))].filter(Boolean).map(c => <option key={c} value={c}/>)}</datalist></label>
    <label>Instructions<textarea name="notes" maxLength={4000} rows={4} value={notes} onChange={e => setNotes(e.target.value)} /></label>
    {current && isOwner(me) && <div className="template-tools"><button type="button" className="secondary" disabled={!title.trim()} onClick={async () => {
      const id = templateId || crypto.randomUUID();
      if (await run({type: "saveTemplate", clientId: client, templateRevision, template: {id, title, notes, category}})) {setTemplateId(id); setTemplateRevision(templateRevision + 1);}
    }}>{templateId ? "Update client template" : "Save as client template"}</button>{templateId && <button type="button" className="text-button" onClick={async () => {if (await run({type: "deleteTemplate", clientId: client, templateRevision, key: templateId})) {setTemplateId(""); setTemplateRevision(templateRevision + 1);}}}>Remove template</button>}<small>Templates are shared with teammates. Updating or removing one leaves existing tasks unchanged.</small></div>}
    <label>Assign to<select aria-label="Assign to" name="assignee" defaultValue={me.id} required>{state.members.map(m => <option value={m.id} key={m.id}>{m.name}</option>)}</select></label>
    <label>Due date (optional)<input type="datetime-local" name="dueAt" /></label>
    <p className="muted">Times use your device’s timezone. The assignee receives a notification.</p>
    <button className="primary">{busy ? "Saving…" : "Assign task"}</button>
  </fieldset></form>;
}
