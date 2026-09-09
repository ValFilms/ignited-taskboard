"use client";
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ArrowRight, CheckCircle2, ChevronDown, Compass, X } from 'lucide-react';
import { stepComplete, type TourSnapshot, type TourStep } from '../lib/guided-tour';

export default function GuidedCoach({steps,index,snapshot,onStep,onFinish,onExit}:{steps:TourStep[];index:number;snapshot:TourSnapshot;onStep:(index:number)=>void;onFinish:()=>void;onExit:()=>void}) {
  const step=steps[index], ready=stepComplete(step.id,snapshot);
  const [earned,setEarned]=useState<string[]>([]);
  const [collapsed,setCollapsed]=useState(false);
  useEffect(()=>setCollapsed(false),[index]);
  useEffect(()=>{
    const root=document.querySelector('[data-practice-workspace]');
    const typing=(event:Event)=>{if(window.matchMedia('(max-width:760px)').matches&&(event.target as HTMLElement).matches('input,textarea,select'))setCollapsed(true);};
    root?.addEventListener('focusin',typing);return()=>root?.removeEventListener('focusin',typing);
  },[]);
  const completed=ready||earned.includes(step.id);
  useEffect(()=>{if(ready)setEarned(old=>old.includes(step.id)?old:[...old,step.id]);},[ready,step.id]);
  const [host,setHost]=useState<HTMLElement|null>(null), [found,setFound]=useState(true);
  const coach=useRef<HTMLElement>(null);
  useEffect(()=>{
    const root=document.querySelector<HTMLElement>('[data-practice-workspace]');
    if(!root)return;
    let marked:HTMLElement|null=null;
    const update=()=>{
      const destination=root.querySelector<HTMLElement>('dialog[open] [data-guide-host], .drawer [data-guide-host]')||root.querySelector<HTMLElement>('[data-guide-home]');
      setHost(old=>old===destination?old:destination);
      const target=Array.from(root.querySelectorAll<HTMLElement>(step.target)).find(el=>!!el.getClientRects().length)||null;
      if(target!==marked){marked?.classList.remove('tour-highlight');marked=target;marked?.classList.add('tour-highlight');}
      setFound(!!target);
    };
    update();
    const observer=new MutationObserver(update);
    observer.observe(root,{subtree:true,childList:true,attributes:true,attributeFilter:['open','aria-expanded']});
    window.addEventListener('resize',update);
    return ()=>{observer.disconnect();window.removeEventListener('resize',update);marked?.classList.remove('tour-highlight');};
  },[step]);
  useEffect(()=>{
    if(!host||!coach.current)return;
    const root=document.querySelector<HTMLElement>('[data-practice-workspace]')!;
    const size=()=>root.style.setProperty('--guide-height',`${coach.current!.getBoundingClientRect().height}px`);
    size();const observer=new ResizeObserver(size);observer.observe(coach.current);
    return()=>observer.disconnect();
  },[host,index,completed,found]);
  useEffect(()=>{
    if(!host)return;
    coach.current?.querySelector<HTMLElement>('h2')?.focus({preventScroll:true});
  },[host,index]);
  function locate(){
    const target=document.querySelector<HTMLElement>('[data-practice-workspace] .tour-highlight');
    if(target){target.scrollIntoView({block:'center',behavior:'instant'});if(target.matches('button,input,textarea,select'))target.focus({preventScroll:true});}
    else onStep(index);
  }
  if(!host)return null;
  return createPortal(<section className="guided-coach" aria-label="App walkthrough" ref={coach}>
    <div className="guide-heading"><span><Compass size={16}/> PRACTICE · {index+1}/{steps.length}</span><div className="guide-heading-actions"><button className="icon-button" aria-label={collapsed?'Show instructions':'Hide instructions'} aria-expanded={!collapsed} onClick={()=>setCollapsed(!collapsed)}><ChevronDown size={18}/></button><button className="icon-button" aria-label="Exit walkthrough" onClick={onExit}><X size={18}/></button></div></div>
    <h2 tabIndex={-1}>{step.title}</h2>{!collapsed&&<p>{step.text}</p>}
    <div className="guide-controls"><button className="text-button" disabled={index===0} onClick={()=>onStep(index-1)}>Back</button><button className="secondary" onClick={locate}>{found?'Show control':'Return to step'}</button><button className="primary" disabled={!completed} onClick={()=>index===steps.length-1?onFinish():onStep(index+1)}>{index===steps.length-1?'Finish practice':'Next'}<ArrowRight size={16}/></button></div>
    {!collapsed&&<small role="status">{completed?<><CheckCircle2 size={14}/> {step.id==='upload'||step.id==='push'?'Read the instructions, then continue.':'Done. Continue when you’re ready.'}</>:'Use the highlighted app control to complete this step.'}</small>}
  </section>,host);
}
