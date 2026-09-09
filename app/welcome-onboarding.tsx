"use client";
import { useEffect, useRef, useState } from "react";
import { ArrowRight, Bell, Check, CheckCircle2, Clapperboard, Flame, ListTodo, MessageCircle, Send, Sparkles, Users, X } from "lucide-react";
import type { Member } from "../lib/workflow";
import type { PasswordChange } from "../lib/password";
import PasswordSettings from "./password-settings";
import PushSettings from "./push-settings";

const demoCompleted = new Set<string>();
const titles = ["Welcome to Ignited", "Your daily work", "Work goes both ways", "Keep the team talking", "Stay in the loop", "Make it yours"];
type Props = { member: Member; configured: boolean; showLauncher: boolean; api: (path: string, body: unknown) => Promise<any>; save: (values: PasswordChange) => Promise<string>; onFinish: () => void };

export default function WelcomeOnboarding({ member, configured, showLauncher, api, save, onFinish }: Props) {
  const [open, setOpen] = useState(false), [completed, setCompleted] = useState(false), [statusError, setStatusError] = useState(false);
  const [run, setRun] = useState(0);
  const request = useRef(api); request.current = api;
  useEffect(() => {
    let active = true;
    if (!configured) { const done = demoCompleted.has(member.id); setCompleted(done); setOpen(!done); return; }
    void request.current("/api/onboarding", {}).then(result => {
      if (active) { setCompleted(result.completed); setOpen(!result.completed); }
    }).catch(() => { if (active) setStatusError(true); });
    return () => { active = false; };
  }, [configured, member.id]);
  const finish = () => {setCompleted(true); if (!configured) demoCompleted.add(member.id);};
  return <>
    {showLauncher && <section className="panel welcome-launcher"><div><h2><Sparkles size={18}/> Your Ignited walkthrough</h2><p className="muted">{completed ? "Refresh your memory on tasks, chat and notifications." : "Learn the essentials and finish setting up your own password."}</p></div><button className="secondary" onClick={() => {setRun(n=>n+1);setOpen(true);}}>{completed ? "Replay tutorial" : "Start tutorial"}</button></section>}
    {statusError && <p className="welcome-status" role="status">Could not check your tutorial progress. <button className="text-button" onClick={() => {setRun(n=>n+1);setOpen(true);}}>Open the walkthrough</button></p>}
    {open && <Walkthrough key={run} member={member} configured={configured} completed={completed} api={api} save={async values => { const message = await save(values); finish(); return message; }} onDemoComplete={finish} onClose={() => setOpen(false)} onFinish={() => {setOpen(false); onFinish();}} />}
  </>;
}

function Walkthrough({member, configured, completed, api, save, onDemoComplete, onClose, onFinish}: Omit<Props,"showLauncher"> & {completed: boolean; onDemoComplete: () => void; onClose: () => void}) {
  const [step, setStep] = useState(0), [done, setDone] = useState(false), [success, setSuccess] = useState("");
  const [sampleAssigned, setSampleAssigned] = useState(false), [sampleSent, setSampleSent] = useState(false);
  const dialog = useRef<HTMLDialogElement>(null), heading = useRef<HTMLHeadingElement>(null);
  const editor = member.role === "editor", campaign = member.role === "campaign", approver = member.role === "approver";
  const first = member.name.trim().split(/\s+/)[0];
  useEffect(() => {
    const el = dialog.current!, previous = document.activeElement as HTMLElement | null;
    const overflow = document.body.style.overflow; document.body.style.overflow = "hidden"; el.showModal();
    return () => {el.close(); document.body.style.overflow = overflow; previous?.focus();};
  }, []);
  useEffect(() => {dialog.current?.scrollTo({top:0}); heading.current?.focus();}, [step, done]);
  const workTitle = editor ? "Turn raw footage into finished edits." : campaign ? "Take approved ads into campaign setup." : approver ? "Keep clients moving. Approve the final cut." : "Keep delivery and integrations on track.";
  const workText = editor ? "My work holds your editing assignments. Open a task for its footage and deadline. Submit the Google Drive folder containing your edits, shared with the reviewer. Review pauses your clock; requested revisions give you six hours." : campaign ? "An approved edit creates your campaign task with a 24-hour deadline. Open its Drive folder, finish setup in the ad tools, then mark campaign setup complete. Ignited automatically assigns Yaniv the Closebot/GHL/Facebook follow-up." : approver ? "Client progress shows the delivery stages. Finish onboarding, upload raw footage, and review John's submitted Drive folder. Approve it to assign campaign setup, or request revisions with clear instructions." : "Use Client progress for the full picture and My work for your assignments. After campaign setup, your Closebot task covers GHL and Facebook. Mark it complete after you finish the integration.";
  return <dialog className="welcome-dialog" ref={dialog} aria-labelledby="welcome-title" onCancel={e=>{e.preventDefault();onClose();}}>
    <header className="welcome-top"><span className="welcome-brand"><Flame size={20}/> IGNITED</span><button className="icon-button" aria-label="Finish tutorial later" onClick={onClose}><X size={20}/></button></header>
    {!done && <div className="welcome-progress" aria-label={`Step ${step+1} of ${titles.length}`}><div><span>YOUR QUICK START</span><span>{step+1} / {titles.length}</span></div><progress value={step+1} max={titles.length}/></div>}
    <div className="welcome-body" key={done ? "done" : step}>
      <h1 id="welcome-title" ref={heading} tabIndex={-1}>{done ? `You're ready, ${first}.` : titles[step]}</h1>
      {done ? <><div className="welcome-art welcome-success" aria-hidden="true"><CheckCircle2 size={72}/><span className="welcome-orbit orbit-one"/><span className="welcome-orbit orbit-two"/></div><p>{configured ? success || "Your password is saved and your walkthrough is complete." : "Demo walkthrough complete. No password was changed and no real messages were sent."}</p><p className="muted">You can replay the guide from Settings whenever you need it.</p><button className="primary" onClick={onFinish}>Open my work <ArrowRight size={18}/></button></> : <>
        {step===0 && <><div className="welcome-art" aria-hidden="true"><span className="welcome-orbit orbit-one"/><span className="welcome-orbit orbit-two"/><Flame className="welcome-flame" size={74}/><span className="welcome-float float-one"><ListTodo size={24}/></span><span className="welcome-float float-two"><MessageCircle size={24}/></span><span className="welcome-float float-three"><Check size={24}/></span></div><h2>Hey {first}. This is where your team gets things done.</h2><p>A quick tour of your work, your teammates, and the updates that matter. Finish by choosing a password only you know.</p><div className="welcome-chips"><span><ListTodo size={16}/> Tasks</span><span><MessageCircle size={16}/> Chat</span><span><Bell size={16}/> Alerts</span></div></>}
        {step===1 && <><div className="welcome-sample"><span className="welcome-sample-label">EXAMPLE · YOUR WORK</span><div className="welcome-task"><span className="welcome-task-icon">{editor ? <Clapperboard/> : <ListTodo/>}</span><div><strong>{editor ? "Edit location shout-outs" : campaign ? "Set up ad campaign" : approver ? "Review edited videos" : "Integrate Closebot with GHL and Facebook"}</strong><small>{editor || campaign ? "Assigned to you · Due in 24h" : "Your next step, with the context you need"}</small></div><ArrowRight size={18}/></div></div><h2>{workTitle}</h2><p>{workText}</p></>}
        {step===2 && <><div className="welcome-sample"><span className="welcome-sample-label">TRY A PRACTICE ASSIGNMENT</span><div className="welcome-task"><Users/><div><strong>Refilm the opening shot</strong><small>{sampleAssigned ? "Practice task assigned to Val" : "Assign to Val · Add clear instructions"}</small></div>{sampleAssigned && <CheckCircle2 className="welcome-check"/>}</div><button className="secondary" disabled={sampleAssigned} onClick={()=>setSampleAssigned(true)}>{sampleAssigned ? "Practice complete" : "Try assigning this task"}</button><small className="muted">This example sends nothing to the team.</small></div><h2>Anyone can ask anyone for help.</h2><p>Use the + button to create a task. Pick a teammate, explain what you need, and add a deadline if there is one. Check Assigned by me to follow the work you requested. Open a task to comment, reassign, or mark it complete.</p></>}
        {step===3 && <><div className="welcome-sample"><span className="welcome-sample-label">TRY A PRACTICE MESSAGE</span><div className="welcome-bubble"><strong>Team chat</strong><p>The folder is ready to review.</p></div>{sampleSent && <div className="welcome-bubble outgoing" role="status"><p>@Karl Thanks, I’ll take a look.</p><small>Practice message · not sent</small></div>}<button className="secondary" disabled={sampleSent} onClick={()=>setSampleSent(true)}><Send size={16}/>{sampleSent ? "Practice complete" : "Try a reply"}</button></div><h2>Choose the right conversation.</h2><p>Team chat is for everyone. Select a teammate for a private conversation. Keep feedback about a specific task in its comments, and use @name to call someone’s attention. A mention only works for teammates who can access that task.</p></>}
        {step===4 && <><h2>Your phone can keep you up to date.</h2><p>Enable notifications on this device when you’re ready. You can continue the tutorial without enabling them and return to Settings later.</p><PushSettings member={member} configured={configured} api={api}/></>}
        {step===5 && (completed ? <><div className="welcome-art welcome-success" aria-hidden="true"><CheckCircle2 size={68}/></div><h2>You’ve already completed setup.</h2><p>Your walkthrough is saved. You can change your password again in Settings whenever you need to.</p><button className="primary" onClick={onFinish}>Back to my work <ArrowRight size={18}/></button></> : <><p>One last step: replace your current password with one only you know. This also saves your completed walkthrough across devices.</p><PasswordSettings configured={configured} onboarding save={async values=>{const message=await save(values);setSuccess(message);setDone(true);return message;}} onDemoComplete={()=>{onDemoComplete();setDone(true);}}/></>)}
      </>}
    </div>
    {!done && <footer className="welcome-footer"><button className="secondary" disabled={step===0} onClick={()=>setStep(n=>n-1)}>Back</button>{step<titles.length-1 ? <button className="primary" onClick={()=>setStep(n=>n+1)}>{step===0 ? "Let’s get started" : "Next"}<ArrowRight size={18}/></button> : <button className="text-button" onClick={onClose}>Finish later</button>}</footer>}
    {!done && <p className="welcome-later">{configured ? "Finish later leaves setup incomplete; we’ll offer it again next time you sign in." : "Demo preview · use sample information only."}</p>}
  </dialog>;
}
