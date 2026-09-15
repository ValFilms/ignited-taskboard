import type { SalesContact, SalesData, SalesEvent, SalesOpportunity, SalesPipeline } from "./sales";
import { salesRange } from "./sales";

type Row = Record<string, unknown>;
const row = (v: unknown): Row => v && typeof v === "object" && !Array.isArray(v) ? v as Row : {};
const str = (v: unknown, max = 1000) => typeof v === "string" ? v.slice(0,max) : "";
const arr = (v: unknown) => Array.isArray(v) ? v : [];
const date = (v: unknown) => (typeof v === "string" || typeof v === "number") && Number.isFinite(new Date(v).getTime()) ? new Date(v).toISOString() : "";
const name = (r: Row) => str(r.name || r.contactName || [r.firstName,r.lastName].filter(Boolean).join(" "));
const id = (r: Row) => str(r.id || r._id,100);
const unique = <T extends { id: string }>(rows: T[]) => [...new Map(rows.filter(r => r.id).map(r => [r.id,r])).values()];
export function normalizeContact(value: unknown): SalesContact {
  const r = row(value);
  return { id:id(r),name:name(r) || str(r.email) || "Unnamed contact", company:str(r.companyName),email:str(r.email),phone:str(r.phone),source:str(r.source),type:str(r.type).toLowerCase(),added:date(r.dateAdded),assignedTo:str(r.assignedTo),tags:arr(r.tags).map(v => str(v,150)).filter(Boolean).slice(0,100),address:[r.address1,r.city,r.state,r.postalCode,r.country].map(v=>str(v)).filter(Boolean).join(", "),dnd:typeof r.dnd==="boolean"?r.dnd:null,fields:arr(r.customFields).slice(0,100).map(v=>{const f=row(v);const value=f.value??f.fieldValue;return {name:str(f.name || f.id),value:typeof value==="string"?str(value,2000):typeof value==="number"||typeof value==="boolean"?String(value):Array.isArray(value)?value.filter(v=>typeof v==="string"||typeof v==="number").join(", ").slice(0,2000):""};}).filter(f=>f.name&&f.value) };
}
export function normalizeEvent(value: unknown): SalesEvent {
  const r=row(value);
  return {id:id(r),contactId:str(r.contactId),calendarId:str(r.calendarId),title:str(r.title)||"Appointment",start:date(r.startTime),end:date(r.endTime),status:str(r.appointmentStatus).toLowerCase().replace(/[\s_-]/g,""),assignedTo:str(r.assignedUserId),address:str(r.address),notes:str(r.notes || r.description,4000)};
}
export function normalizeOpportunity(value: unknown): SalesOpportunity {
  const r=row(value);
  return {id:id(r),contactId:str(r.contactId||row(r.contact).id),name:str(r.name)||"Opportunity",pipelineId:str(r.pipelineId),stageId:str(r.pipelineStageId),status:str(r.status).toLowerCase()||"unknown",value:typeof r.monetaryValue==="number"&&Number.isFinite(r.monetaryValue)?r.monetaryValue:null,assignedTo:str(r.assignedTo),source:str(r.source),updated:date(r.updatedAt)};
}
export class SalesUpstreamError extends Error {}
type Config = { token?: string; locationId?: string };
type Transport = typeof fetch;
/** All upstream paths are fixed here. Never follow response pagination URLs with credentials. */
export async function loadSales(start: string, end: string, config: Config, transport: Transport = fetch): Promise<SalesData> {
  const range = salesRange(start,end);
  const result:SalesData={mode:"disconnected",fetchedAt:new Date().toISOString(),start,end,locationId:config.locationId||"",contacts:[],events:[],opportunities:[],calendars:[],pipelines:[],users:[],complete:{contacts:false,events:false,opportunities:false},warnings:[]};
  if (!config.token || !config.locationId) { result.warnings.push("GHL is not connected in this environment. An owner needs to configure the private integration and sales account ID."); return result; }
  if (!/^[a-zA-Z0-9_-]{1,100}$/.test(config.locationId)) throw new SalesUpstreamError("The GHL sales account ID is invalid.");
  result.mode="live";
  const deadline = AbortSignal.timeout(45000);
  async function request(path:string, params: Record<string,string>={}, body?: unknown) {
    try {
      const url=new URL(`https://services.leadconnectorhq.com${path}`);
      Object.entries(params).forEach(([k,v])=>url.searchParams.set(k,v));
      const response=await transport(url,{method:body?"POST":"GET",headers:{Authorization:`Bearer ${config.token}`,Version:path.startsWith("/calendars")?"2021-04-15":"2021-07-28",Accept:"application/json",...(body?{"Content-Type":"application/json"}:{})},body:body?JSON.stringify(body):undefined,cache:"no-store",redirect:"error",signal:AbortSignal.any([deadline,AbortSignal.timeout(12000)])});
      if (!response.ok) throw new SalesUpstreamError(response.status===401?"GHL rejected the private integration token.":response.status===403?"The GHL integration needs read permission for this data.":response.status===429?"GHL rate limit reached. Please refresh in a minute.":"GHL could not return this data. Please try again.");
      return row(await response.json());
    } catch(e) { if(e instanceof SalesUpstreamError) throw e; throw new SalesUpstreamError("GHL could not be reached or returned an invalid response. Please try again."); }
  }
  const locationId=config.locationId;
  const warn=(label:string,e:unknown)=>result.warnings.push(`${label}: ${e instanceof SalesUpstreamError?e.message:"Data unavailable."}`);
  async function paged(kind:"contacts"|"opportunities") {
    const values:unknown[]=[]; const ids=new Set<string>(); let finished=false;
    try {
      for(let page=1;page<=50;page++) {
        const data=kind==="contacts"?await request("/contacts/search",{},{locationId,page,pageLimit:100}):await request("/opportunities/search",{location_id:locationId,status:"all",limit:"100",page:String(page),order:"added_asc"});
        if (!Array.isArray(data[kind])) throw new SalesUpstreamError("Unexpected data format.");
        const batch=arr(data[kind]); const total=kind==="contacts"?data.total:row(data.meta).total;
        let added=0;
        for(const item of batch) {const r=row(item);if(r.locationId && r.locationId!==locationId) throw new SalesUpstreamError("GHL returned data for a different account.");const key=id(r);if(!key) throw new SalesUpstreamError("A returned record has no ID.");if(!ids.has(key)){ids.add(key);values.push(item);added++;}}
        if(typeof total==="number"&&ids.size>=total || batch.length<100 && !(typeof total==="number"&&ids.size<total)) {finished=true;break;}
        if(!added) break;
      }
      if(!finished) result.warnings.push(`${kind}: Showing a partial list (up to 5,000 records). Totals are loaded records only.`);
    } catch(e) {warn(kind,e);}
    result.complete[kind]=finished;
    if(kind==="contacts") result.contacts=values.map(normalizeContact); else result.opportunities=values.map(normalizeOpportunity);
  }
  // Independent datasets fail separately so a missing optional scope cannot blank the dashboard.
  await Promise.all([
    paged("contacts"),paged("opportunities"),
    (async()=>{try{const data=await request("/opportunities/pipelines",{locationId});if(!Array.isArray(data.pipelines))throw new SalesUpstreamError("Unexpected data format.");result.pipelines=arr(data.pipelines).map(v=>{const r=row(v);return {id:id(r),name:str(r.name),stages:arr(r.stages).map(v=>{const s=row(v);return {id:id(s),name:str(s.name)};})} as SalesPipeline;});}catch(e){warn("Pipeline names",e);}})(),
    (async()=>{try{const data=await request("/users/",{locationId});if(!Array.isArray(data.users))throw new SalesUpstreamError("Unexpected data format.");result.users=arr(data.users).map(v=>{const r=row(v);return {id:id(r),name:name(r)}});}catch(e){warn("Team names",e);}})(),
    (async()=>{try{
      const data=await request("/calendars/",{locationId});if(!Array.isArray(data.calendars))throw new SalesUpstreamError("Unexpected data format.");
      result.calendars=arr(data.calendars).map(v=>{const r=row(v);return {id:id(r),name:str(r.name)}}).filter(c=>c.id);
      let complete=result.calendars.length<=30;
      if(!complete)result.warnings.push("Appointments: only the first 30 calendars were loaded.");
      // At most three event requests in flight, below the provider's burst allowance.
      const calendars=result.calendars.slice(0,30);
      for(let i=0;i<calendars.length;i+=3) await Promise.all(calendars.slice(i,i+3).map(async calendar=>{try{
        const events=await request("/calendars/events",{locationId,calendarId:calendar.id,startTime:String(range.from),endTime:String(range.until-1)});
        if(!Array.isArray(events.events))throw new SalesUpstreamError("Unexpected data format.");
        for(const value of arr(events.events)) {const r=row(value);if(r.locationId&&r.locationId!==locationId)throw new SalesUpstreamError("GHL returned data for a different account.");const event=normalizeEvent(value);if(!event.id||!event.start){complete=false;continue;}if(Date.parse(event.start)>=range.from&&Date.parse(event.start)<range.until)result.events.push(event);}
      }catch(e){complete=false;warn(`Appointments (${calendar.name})`,e);}}));
      result.events=unique(result.events);result.complete.events=complete;
      if(!complete)result.warnings.push("Booking coverage is incomplete. Contacts without a known booking are marked Unknown.");
    }catch(e){warn("Appointments",e);}})(),
  ]);
  result.fetchedAt=new Date().toISOString();
  return result;
}
