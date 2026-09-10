"use client";
import { useRef, useState } from "react";
import { ArrowLeft, ArrowRight, ArrowRightLeft } from "lucide-react";
import { pipelineVersion, stages, type Action, type Client, type Stage, type State } from "../lib/workflow";

export default function PipelineControls({state, client, act}: {
  state: State; client: Client; act: (a: Action) => Promise<boolean>;
}) {
  const [draft, setDraft] = useState<{version: string; from: Stage; target: Stage} | null>(null);
  const [busy, setBusy] = useState(false);
  const sending = useRef(false);
  const index = stages.indexOf(client.stage);
  const open = (target: Stage) => setDraft({version: pipelineVersion(state, client), from: client.stage, target});
  const changed = !!draft && draft.version !== pipelineVersion(state, client);
  return <section className="detail-section pipeline-controls">
    <h3>Move pipeline</h3>
    <p className="muted">Move this client’s video work forward or send it back for another pass. Only you, the ad approver, can override the stage.</p>
    {!draft ? <div className="pipeline-buttons">
      {index > 0 && <button className="secondary" onClick={() => open(stages[index - 1])}><ArrowLeft size={16}/>Move back</button>}
      {index < stages.length - 1 && <button className="secondary" onClick={() => open(stages[index + 1])}>Move forward<ArrowRight size={16}/></button>}
      <button className="secondary" onClick={() => open(stages[index === 0 ? 1 : index - 1])}><ArrowRightLeft size={16}/>Choose stage</button>
    </div> : <form onSubmit={async e => {
      e.preventDefault(); if (sending.current || changed) return;
      const data = new FormData(e.currentTarget); sending.current = true; setBusy(true);
      try {if (await act({type: "movePipeline", clientId: client.id, pipelineVersion: draft.version, value: draft.target,
        reason: String(data.get("reason") || ""), driveUrl: String(data.get("driveUrl") || "")})) setDraft(null);}
      finally {sending.current = false; setBusy(false);}
    }}>
      {changed && <p role="alert" className="error">The pipeline changed while this form was open. Cancel and reopen it to review the latest work.</p>}
      <fieldset disabled={busy} className="task-fields">
        <p>Current stage: <strong>{draft.from}</strong></p>
        <label>Move to<select aria-label="Move to stage" value={draft.target} onChange={e => setDraft({...draft, target: e.target.value as Stage})}>
          {stages.filter(stage => stage !== draft.from).map(stage => <option key={stage}>{stage}</option>)}
        </select></label>
        <div className="pipeline-impact" role="status">
          <strong>What will change</strong>
          <p>{draft.target === "Closed" ? "All unfinished client tasks will move to Archive and their reminders will stop." : "Unfinished workflow tasks will move to Archive and their old reminders will stop. Completed work and manually assigned tasks stay saved."}</p>
          <p>Videos, Drive links, comments and activity history stay saved. Moving the pipeline does not change campaigns or files in external services.</p>
          {["Onboarding", "Filming", "Editing", "In review", "Campaign setup"].includes(draft.target) && <p>Launch confirmations will reset. Unfinished automatic Closebot work will move to Archive.</p>}
          {draft.target === "Filming" && <p>Onboarding must be complete. You can upload a new shoot from this stage.</p>}
          {draft.target === "Editing" && <p>A new editing task starts with a 24-hour deadline. The reason below becomes its instructions. Existing footage stays available.</p>}
          {draft.target === "In review" && <p>A new editing task awaits your review, with no running deadline.</p>}
          {draft.target === "Campaign setup" && <p>You are confirming approval of the linked edits. A new campaign task starts with a 24-hour deadline.</p>}
          {draft.target === "Ready to launch" && <p>You are confirming campaign setup is ready. Yaniv receives the Closebot integration task if one is not already saved outside Archive.</p>}
          {draft.target === "Trial" && <p>This records ads as launched now and starts a fresh 14-day trial. First confirm the launch call and external payment setup in Ready to launch.</p>}
          {draft.target === "Active" && <p>This records the client as continuing. The next progress-update task will be created in 60 hours, then repeat on the normal schedule.</p>}
        </div>
        {["In review", "Campaign setup"].includes(draft.target) && <label>Edited videos in Google Drive<input name="driveUrl" type="url" required defaultValue={client.driveUrl || ""} placeholder="Google Drive folder or file link" /></label>}
        <label>Reason / next instructions<textarea name="reason" required maxLength={2000} rows={3} placeholder="Refilm the opening shot, then send it to John." /></label>
        <label className="pipeline-confirm"><input type="checkbox" required key={draft.target}/>I confirm this stage and the changes listed above.</label>
        <div className="pipeline-buttons"><button type="button" className="secondary" onClick={() => setDraft(null)}>Cancel</button><button className="primary" disabled={changed}>{busy ? "Moving…" : `Move to ${draft.target}`}</button></div>
      </fieldset>
    </form>}
  </section>;
}
