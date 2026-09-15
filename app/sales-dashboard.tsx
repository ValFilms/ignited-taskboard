"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowUpRight, CalendarDays, RefreshCw, Search, Users } from "lucide-react";
import { bookingLabel, contactMatches, contactUrl, defaultSalesRange, disconnectedSales, salesRange, salesSummary, type SalesData } from "../lib/sales";
import Dialog from "./dialog";
import "./sales.css";

const stamp=(value:string)=>value?new Date(value).toLocaleString([], {dateStyle:"medium",timeStyle:"short"}):"Not provided";
const human=(status:string)=>({noshow:"No-show",new:"Awaiting confirmation",showed:"Attended",confirmed:"Confirmed",cancelled:"Cancelled",canceled:"Cancelled",invalid:"Invalid"}[status]||status||"Unknown");
const number=(value:number)=>value.toLocaleString(undefined,{maximumFractionDigits:2});

export default function SalesDashboard({configured,api}:{configured:boolean;api:(path:string,body:unknown)=>Promise<SalesData>}) {
  const [dates,setDates]=useState(defaultSalesRange);
  const [data,setData]=useState<SalesData|null>(null);
  const [loading,setLoading]=useState(false),[error,setError]=useState("");
  const [query,setQuery]=useState(""),[booking,setBooking]=useState("all"),[calendar,setCalendar]=useState(""),[pipeline,setPipeline]=useState(""),[source,setSource]=useState(""),[owner,setOwner]=useState("");
  const [tab,setTab]=useState<"contacts"|"appointments"|"pipeline">("contacts"),[selected,setSelected]=useState<string|null>(null),[limit,setLimit]=useState(50);
  const apiRef=useRef(api);apiRef.current=api;
  const request=useRef(0),inFlight=useRef(false),datesRef=useRef(dates);datesRef.current=dates;
  const refresh=useCallback(async()=>{
    if(inFlight.current)return;
    const sequence=++request.current;
    try {
      const range=salesRange(datesRef.current.start,datesRef.current.end);
      inFlight.current=true;setLoading(true);setError("");
      const next=configured?await apiRef.current("/api/sales",range):disconnectedSales(range.start,range.end);
      if(sequence===request.current)setData(next);
    }catch(e){if(sequence===request.current)setError(e instanceof Error?e.message:"Sales could not load.");}
    finally{if(sequence===request.current){setLoading(false);inFlight.current=false;}}
  },[configured]);
  useEffect(()=>{void refresh();const timer=setInterval(()=>{if(document.visibilityState==="visible")void refresh();},300000);return()=>{clearInterval(timer);request.current++;inFlight.current=false;};},[refresh]);
  useEffect(()=>setLimit(50),[query,booking,calendar,pipeline,source,owner,tab]);
  const summary=data?salesSummary(data,calendar):null;
  const user=(id:string)=>!id?"Unassigned":data?.users.find(u=>u.id===id)?.name||`GHL user ${id}`;
  const calendarName=(id:string)=>data?.calendars.find(c=>c.id===id)?.name||id||"Unknown calendar";
  const pipelineName=(id:string)=>data?.pipelines.find(p=>p.id===id)?.name||id||"Unknown pipeline";
  const stageName=(pid:string,id:string)=>data?.pipelines.find(p=>p.id===pid)?.stages.find(s=>s.id===id)?.name||id||"Unknown stage";
  const contactName=(id:string)=>data?.contacts.find(c=>c.id===id)?.name||"Contact not in loaded list";
  const contact=data?.contacts.find(c=>c.id===selected);
  const events=summary?.events||[];
  const contacts=(data?.contacts||[]).filter(c=>contactMatches(c,query)&&(!source||c.source===source)&&(!owner||c.assignedTo===owner)&&(booking==="all"||bookingLabel(c.id,events,!!data?.complete.events)===booking));
  const appointments=events.filter(e=>[e.title,contactName(e.contactId),calendarName(e.calendarId)].join(" ").toLowerCase().includes(query.toLowerCase())).sort((a,b)=>a.start.localeCompare(b.start));
  const opportunities=(data?.opportunities||[]).filter(o=>(!pipeline||o.pipelineId===pipeline)&&[o.name,contactName(o.contactId),o.source].join(" ").toLowerCase().includes(query.toLowerCase()));
  const openDeals=opportunities.filter(o=>o.status==="open");
  const sources=[...new Set(data?.contacts.map(c=>c.source).filter(Boolean))].sort();
  const stale=!!data&&(data.start!==dates.start||data.end!==dates.end);
  return <section className="sales-dashboard" aria-label="Sales dashboard">
    <div className="sales-intro"><div><span className="eyebrow">GHL · SALES ACCOUNT</span><h2>Your sales, in focus.</h2><p className="muted">Leads, conversations to book, and the calls that move business forward.</p></div><button className="secondary" onClick={()=>void refresh()} disabled={loading}><RefreshCw size={16}/>{loading?"Refreshing…":"Refresh sales"}</button></div>
    <form className="sales-toolbar" onSubmit={e=>{e.preventDefault();void refresh();}}>
      <label>From<input type="date" value={dates.start} onChange={e=>setDates({...dates,start:e.target.value})} required/></label>
      <label>Through<input type="date" value={dates.end} onChange={e=>setDates({...dates,end:e.target.value})} required/></label>
      <button className="secondary" type="submit" disabled={loading}>Apply dates</button>
      <button className="ghost" type="button" disabled={loading} onClick={()=>{const now=new Date();const next={start:now.toISOString().slice(0,10),end:new Date(now.getTime()+29*86400000).toISOString().slice(0,10)};setDates(next);datesRef.current=next;void refresh();}}>Next 30 days</button>
      <label>Calendar<select value={calendar} onChange={e=>setCalendar(e.target.value)}><option value="">All calendars</option>{data?.calendars.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
    </form>
    <p className="sales-caption">Dates use UTC, up to 31 days. Appointment times display in your timezone. Contact and pipeline lists include all loaded records; dates apply to new leads and appointments.</p>
    {error&&<div className="sales-warning" role="alert">{error} {data?"Previously loaded data is still shown below.":""}</div>}
    {stale&&<p className="sales-warning" role="status">Displayed data covers {data.start} through {data.end}. Apply dates to update it.</p>}
    {loading&&!data&&<div className="panel connection" role="status"><RefreshCw/><h3>Loading your sales account…</h3><p>Fetching contacts, appointments and opportunities.</p></div>}
    {data?.mode==="disconnected"&&<div className="panel connection"><Users size={30}/><h3>Connect your GHL sales account</h3><p>{data.warnings[0]}</p><p className="muted">Delivery, tasks and chat are available independently.</p></div>}
    {data&&data.mode!=="disconnected"&&summary&&<>
      <div className="sales-sync" role="status"><span className="badge">{data.warnings.length?"GHL · partial data":"GHL · read-only"}</span><span>Updated {stamp(data.fetchedAt)} · refreshes every 5 minutes while open</span></div>
      {!!data.warnings.length&&<details className="sales-warning" open><summary>Some sales data could not be fully loaded</summary><ul>{data.warnings.map((w,i)=><li key={i}>{w}</li>)}</ul></details>}
      <div className="sales-metrics">
        {[
          ["Contacts",data.complete.contacts||data.contacts.length?data.contacts.length:null,data.complete.contacts?"All contacts in the sales account":"Loaded contacts · partial"],
          ["New leads",data.complete.contacts?summary.newLeads:null,"Type Lead · created in date range"],
          ["Bookings",data.complete.events?summary.bookings:null,"Non-cancelled appointments in range"],
          ["Booked contacts",data.complete.contacts&&data.complete.events?summary.booked:null,"Unique loaded contacts · in range"],
          ["Not booked",data.complete.contacts&&data.complete.events?summary.unbooked:null,"No booking in the selected calendar/range"],
        ].map(([label,value,note])=><div className="panel sales-metric" key={label}><span>{label}</span><strong>{value===null?"—":number(value as number)}{value!==null&&(!data.complete.contacts||!data.complete.events)&&label!=="Not booked"?<small> loaded</small>:null}</strong><p>{note}</p></div>)}
      </div>
      <div className="sales-outcomes"><span><CalendarDays size={16}/>Appointment outcomes</span><b>{summary.showed} attended</b><b>{summary.noShow} no-show</b><b>{summary.cancelled} cancelled</b><span>In the selected date range</span></div>
      <div className="panel sales-records">
        <div className="sales-tabs" role="tablist" aria-label="Sales records">{([['contacts','Contacts'],['appointments','Appointments'],['pipeline','Pipeline']] as const).map(([key,label])=><button role="tab" id={`sales-tab-${key}`} aria-controls="sales-results" aria-selected={tab===key} className={tab===key?"selected":""} key={key} onClick={()=>setTab(key)}>{label}</button>)}</div>
        <div className="sales-filters"><label className="sales-search"><Search size={17}/><input aria-label="Search sales" placeholder={tab==="contacts"?"Name, business, email, phone or tag…":"Search sales records…"} value={query} onChange={e=>setQuery(e.target.value)}/></label>
          {tab==="contacts"&&<><label>Booking<select value={booking} onChange={e=>setBooking(e.target.value)}>{["all","Booked","Not booked","Unknown"].map(v=><option key={v} value={v}>{v==="all"?"All booking statuses":v}</option>)}</select></label><label>Source<select value={source} onChange={e=>setSource(e.target.value)}><option value="">All sources</option>{sources.map(v=><option key={v}>{v}</option>)}</select></label><label>Assigned to<select value={owner} onChange={e=>setOwner(e.target.value)}><option value="">Everyone</option>{[...new Set(data.contacts.map(c=>c.assignedTo).filter(Boolean))].map(v=><option key={v} value={v}>{user(v)}</option>)}</select></label></>}
          {tab==="pipeline"&&<label>Pipeline<select value={pipeline} onChange={e=>setPipeline(e.target.value)}><option value="">All pipelines</option>{data.pipelines.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</select></label>}
          <button className="ghost" onClick={()=>{setQuery("");setBooking("all");setSource("");setOwner("");setPipeline("");setCalendar("");}}>Clear filters</button>
        </div>
        <div id="sales-results" role="tabpanel" aria-labelledby={`sales-tab-${tab}`}>
          {tab==="contacts"&&<><p className="sales-caption">{contacts.length} matching contacts · booking status is for {data.start} through {data.end}, not lifetime history.</p><div className="sales-contact-list">{contacts.slice(0,limit).map(c=>{const label=bookingLabel(c.id,events,data.complete.events);return <button className="sales-contact" key={c.id} onClick={()=>setSelected(c.id)}><span className="sales-avatar">{c.name.slice(0,1)}</span><span className="sales-person"><b>{c.name}</b><small>{c.company||c.email||c.phone||"No contact details"}</small><small>{c.source||"Source not provided"} · {user(c.assignedTo)}</small></span><span className={`sales-status ${label==="Booked"?"booked":""}`}>{label}</span><ArrowUpRight size={17}/></button>;})}</div></>}
          {tab==="appointments"&&<><p className="sales-caption">{appointments.length} appointments · sorted by start time · cancelled appointments stay visible.</p><div className="sales-appointment-list">{appointments.slice(0,limit).map(e=><article className="sales-appointment" key={e.id}><div><b>{e.title}</b><p>{stamp(e.start)}</p><small>{calendarName(e.calendarId)} · {user(e.assignedTo)}</small></div><div><span className="badge">{human(e.status)}</span>{data.contacts.some(c=>c.id===e.contactId)?<button className="ghost" onClick={()=>setSelected(e.contactId)}>{contactName(e.contactId)} <ArrowUpRight size={15}/></button>:<p>Contact not in loaded list</p>}</div></article>)}</div></>}
          {tab==="pipeline"&&<><div className="sales-pipeline-summary"><b>{openDeals.length} open opportunities</b><span>{number(openDeals.reduce((sum,o)=>sum+(o.value||0),0))} known open value</span><span>{opportunities.filter(o=>o.status==="won").length} won · {opportunities.filter(o=>o.status==="lost").length} lost</span><small>Values are in your GHL account currency; they are opportunity estimates, not payments. {openDeals.filter(o=>o.value===null).length} open values unavailable. {data.complete.opportunities?"":"Partial list."}</small></div><div className="sales-appointment-list">{opportunities.slice(0,limit).map(o=><article className="sales-appointment" key={o.id}><div><b>{o.name}</b><p>{pipelineName(o.pipelineId)} → {stageName(o.pipelineId,o.stageId)}</p><small>{user(o.assignedTo)} · {o.source||"Source not provided"}</small></div><div><span className="badge">{o.status} · {o.value===null?"Value unavailable":number(o.value)}</span>{data.contacts.some(c=>c.id===o.contactId)&&<button className="ghost" onClick={()=>setSelected(o.contactId)}>{contactName(o.contactId)} <ArrowUpRight size={15}/></button>}</div></article>)}</div></>}
          {(tab==="contacts"?contacts:tab==="appointments"?appointments:opportunities).length===0&&<div className="sales-empty"><Search size={26}/><h3>No matching records</h3><p>Try another search, filter or date range. Check any connection warnings above.</p></div>}
          {(tab==="contacts"?contacts:tab==="appointments"?appointments:opportunities).length>limit&&<button className="secondary sales-more" onClick={()=>setLimit(v=>v+50)}>Show 50 more</button>}
        </div>
      </div>
      <p className="sales-caption">Sales records are read-only. Lead follow-up and bookings stay in GHL. Google Form intake continues to create delivery clients.</p>
    </>}
    {contact&&data&&<Dialog title={contact.name} onClose={()=>setSelected(null)}><div className="sales-detail">
      <p>{contact.company||"No business name provided"}</p><span className="badge">{bookingLabel(contact.id,events,data.complete.events)} in selected range</span>
      <dl>{[["Email",contact.email],["Phone",contact.phone],["Source",contact.source],["Contact type",contact.type],["Assigned to",user(contact.assignedTo)],["Created",stamp(contact.added)],["Address",contact.address],["Do not disturb",contact.dnd===null?"Not provided":contact.dnd?"Enabled":"Not enabled"],["Tags",contact.tags.join(", ")]].map(([label,value])=><div key={label}><dt>{label}</dt><dd>{value||"Not provided"}</dd></div>)}</dl>
      {!!contact.fields.length&&<><h3>Custom fields</h3><dl>{contact.fields.map((f,i)=><div key={i}><dt>{f.name}</dt><dd>{f.value}</dd></div>)}</dl></>}
      <h3>Appointments in selected range</h3>{events.filter(e=>e.contactId===contact.id).map(e=><div className="sales-detail-item" key={e.id}><b>{e.title}</b><p>{stamp(e.start)} · {human(e.status)}</p><p>{calendarName(e.calendarId)} · {e.address}</p>{e.notes&&<p className="sales-notes">{e.notes}</p>}</div>)}{!events.some(e=>e.contactId===contact.id)&&<p>{data.complete.events?"No appointments in this range.":"Appointment data is incomplete."}</p>}
      <h3>Opportunities</h3>{data.opportunities.filter(o=>o.contactId===contact.id).map(o=><div className="sales-detail-item" key={o.id}><b>{o.name}</b><p>{pipelineName(o.pipelineId)} → {stageName(o.pipelineId,o.stageId)}</p><p>{o.status} · {o.value===null?"Value unavailable":number(o.value)} · Updated {stamp(o.updated)}</p></div>)}{!data.opportunities.some(o=>o.contactId===contact.id)&&<p>{data.complete.opportunities?"No opportunities found.":"Opportunity data is incomplete."}</p>}
      {data.mode==="live"&&<a className="secondary" href={contactUrl(data.locationId,contact.id)} target="_blank" rel="noreferrer">Open full contact in GHL <ArrowUpRight size={16}/></a>}
    </div></Dialog>}
  </section>;
}
