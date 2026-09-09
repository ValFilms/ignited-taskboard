"use client";
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { ArrowRight, CheckCircle2, Compass, Flame, X } from 'lucide-react';
import type { Member } from '../lib/workflow';
import type { PasswordChange } from '../lib/password';
import PasswordSettings from './password-settings';
import PushSettings from './push-settings';

const demoCompleted=new Set<string>();
type Props={member:Member;configured:boolean;showLauncher:boolean;api:(path:string,body:unknown)=>Promise<any>;save:(values:PasswordChange)=>Promise<string>;onFinish:()=>void;onBusyChange:(busy:boolean)=>void;renderPractice:(finish:()=>void,exit:()=>void)=>ReactNode};
export default function WelcomeOnboarding({member,configured,showLauncher,api,save,onFinish,onBusyChange,renderPractice}:Props){
  const [open,setOpen]=useState(false),[completed,setCompleted]=useState(false),[statusError,setStatusError]=useState(false);
  const [screen,setScreen]=useState<'intro'|'practice'|'finish'|'done'>('intro'),[message,setMessage]=useState('');
  const request=useRef(api);request.current=api;
  const origin=useRef<HTMLSpanElement>(null);
  useEffect(()=>{
    let active=true;
    if(!configured){const done=demoCompleted.has(member.id);setCompleted(done);setOpen(!done);return;}
    void request.current('/api/onboarding',{}).then(result=>{if(active){setCompleted(result.completed);setOpen(!result.completed);}}).catch(()=>{if(active)setStatusError(true);});
    return()=>{active=false;};
  },[configured,member.id]);
  useEffect(()=>{onBusyChange(open);return()=>onBusyChange(false);},[open,onBusyChange]);
  useEffect(()=>{
    if(!open||screen!=='practice')return;
    const shell=origin.current?.closest<HTMLElement>('.shell'), previous=document.activeElement as HTMLElement|null;
    const overflow=document.body.style.overflow;
    if(shell)shell.inert=true;document.body.style.overflow='hidden';
    return()=>{if(shell)shell.inert=false;document.body.style.overflow=overflow;previous?.focus();};
  },[open,screen]);
  const close=()=>{setOpen(false);setScreen('intro');};
  const start=()=>{setScreen('intro');setOpen(true);};
  const finish=()=>{setCompleted(true);if(!configured)demoCompleted.add(member.id);setScreen('done');};
  return <><span ref={origin}/>
    {showLauncher&&<section className="panel welcome-launcher"><div><h2><Compass size={18}/> Learn to use Ignited</h2><p className="muted">A guided walkthrough of the actual app, with safe practice tasks and messages.</p></div><button className="secondary" onClick={start}>{completed?'Replay guided walkthrough':'Start guided walkthrough'}</button></section>}
    {statusError&&<p role="status">Could not check your tutorial progress. <button className="text-button" onClick={start}>Open the walkthrough</button></p>}
    {open&&screen==='practice'&&createPortal(<div className="practice-overlay" role="region" aria-label="Guided practice workspace">{renderPractice(()=>setScreen('finish'),close)}</div>,document.body)}
    {open&&screen!=='practice'&&<TourModal onClose={close}>
      {screen==='intro'?<><div className="welcome-art" aria-hidden="true"><Flame className="welcome-flame" size={72}/><span className="welcome-orbit orbit-one"/><span className="welcome-orbit orbit-two"/></div><h1 id="welcome-title">Let’s use the app, {member.name.split(' ')[0]}.</h1><p>You’ll open tasks, post a comment, assign work, send a message and follow your role’s delivery steps using the real app controls.</p><p>We’ll guide you one action at a time in a practice workspace. Nothing you do there changes client records or sends a teammate a notification.</p><p className="muted">At the end, return to your account for notification setup and your own password. Allow about 10 minutes. You can exit and restart from Settings.</p><button className="primary" onClick={()=>setScreen('practice')}>Start guided walkthrough <ArrowRight size={18}/></button></>:
      screen==='finish'?<><h1 id="welcome-title">Practice complete. Your account is next.</h1><p>You’ve used the real controls. The practice tasks and messages have been discarded.</p><p>{configured?'These notification and password settings now apply to your real account.':'This preview is still a demo. Use sample passwords; no account changes are saved.'}</p><PushSettings member={member} configured={configured} api={api}/>{completed?<><p>You already chose your own password. You can change it again in Settings.</p><button className="primary" onClick={()=>{close();onFinish();}}>Back to my work <ArrowRight size={18}/></button></>:<PasswordSettings configured={configured} onboarding save={async values=>{const result=await save(values);setMessage(result);finish();return result;}} onDemoComplete={finish}/>}</>:
      <><div className="welcome-art welcome-success" aria-hidden="true"><CheckCircle2 size={72}/></div><h1 id="welcome-title">You’re ready, {member.name.split(' ')[0]}.</h1><p>{configured?message:'Demo walkthrough complete. No password was changed and no real messages were sent.'}</p><p>You can replay the guided walkthrough from Settings.</p><button className="primary" onClick={()=>{close();onFinish();}}>Open my work <ArrowRight size={18}/></button></>}
    </TourModal>}
  </>;
}

function TourModal({children,onClose}:{children:ReactNode;onClose:()=>void}){
  const dialog=useRef<HTMLDialogElement>(null);
  useEffect(()=>{const el=dialog.current!,previous=document.activeElement as HTMLElement|null,overflow=document.body.style.overflow;document.body.style.overflow='hidden';el.showModal();return()=>{el.close();document.body.style.overflow=overflow;previous?.focus();};},[]);
  return <dialog ref={dialog} className="welcome-dialog" aria-labelledby="welcome-title" onCancel={e=>{e.preventDefault();onClose();}}><header className="welcome-top"><span className="welcome-brand"><Flame size={20}/> IGNITED</span><button className="icon-button" aria-label="Finish tutorial later" onClick={onClose}><X size={20}/></button></header><div className="welcome-body">{children}</div></dialog>;
}
