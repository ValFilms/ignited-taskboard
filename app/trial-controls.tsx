"use client";
import { useState } from "react";
import { Action, Client, State, pipelineVersion } from "../lib/workflow";
import Dialog from "./dialog";
const local = (value: string) => {const d = new Date(value); return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0,16);};
export default function TrialControls({state, client, act}: {state: State; client: Client; act: (a: Action) => Promise<boolean>}) {
  const [snapshot, setSnapshot] = useState<string | null>(null), [busy, setBusy] = useState(false);
  const [start, setStart] = useState(""), [end, setEnd] = useState("");
  const [failed, setFailed] = useState(false);
  return <div className="trial-controls">
    {client.stage === "Trial" && <p><strong>{client.trialPaymentPending ? "Trial · Payment pending" : "Trial"}</strong>{client.trialStartedAt && <> · Started {new Date(client.trialStartedAt).toLocaleDateString()}</>}</p>}
    <button className="secondary" onClick={() => {
      const from = client.stage === "Trial" ? client.trialStartedAt || client.launchedAt || new Date().toISOString() : new Date().toISOString();
      setStart(local(from)); setEnd(local(client.stage === "Trial" && client.trialEnd ? client.trialEnd : new Date(Date.parse(from) + 14 * 86400000).toISOString())); setSnapshot(pipelineVersion(state, client));
    }}>{client.stage === "Trial" ? "Edit trial dates / Restart trial" : "Start or record a trial"}</button>
    {snapshot && <Dialog title="Set client trial" onClose={() => !busy && setSnapshot(null)}><form onSubmit={async e => {
      e.preventDefault(); const form = new FormData(e.currentTarget); setBusy(true); setFailed(false);
      try {if (await act({type: "setTrial", clientId: client.id, pipelineVersion: snapshot, trial: {start: new Date(start).toISOString(), end: new Date(end).toISOString(), paymentPending: form.get("pending") === "on"}, reason: String(form.get("reason"))})) setSnapshot(null); else setFailed(true);} catch {setFailed(true);} finally {setBusy(false);}
    }}><fieldset disabled={busy} className="task-fields">
      <p>Move {client.name} to Trial. Unfinished automatic workflow tasks will be archived; completed work, custom tasks and files stay saved.</p>
      {failed && <p className="error" role="alert">Could not save. Check the trial dates, connection and latest client details, then try again.</p>}
      <label>Trial starts<input type="datetime-local" required value={start} onChange={e => setStart(e.target.value)} /></label>
      <label>Trial ends<input type="datetime-local" required min={start} value={end} onChange={e => setEnd(e.target.value)} /></label>
      <button type="button" className="text-button" onClick={() => {if (start) setEnd(local(new Date(new Date(start).getTime() + 14 * 86400000).toISOString()));}}>Set end to 14 days after start</button>
      <label className="check-label"><input type="checkbox" name="pending" defaultChecked={client.trialPaymentPending ?? true} />Client has not paid yet</label>
      <label>Reason / notes<textarea name="reason" required maxLength={2000} placeholder="Restarting a trial, or correcting an existing client's dates" /></label>
      <p className="muted">Times use your device’s timezone. Both owners receive the existing trial reminder three days before the end. Past deadlines can trigger a reminder immediately. This records the trial; it does not launch ads or collect payment.</p>
      {snapshot !== pipelineVersion(state, client) && <p role="alert">Client details changed. Close and reopen this form.</p>}
      <button className="primary" disabled={snapshot !== pipelineVersion(state, client)}>{busy ? "Saving…" : "Save trial and move to Trial"}</button>
    </fieldset></form></Dialog>}
  </div>;
}
