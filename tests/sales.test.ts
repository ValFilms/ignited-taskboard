import { test } from 'node:test';
import assert from 'node:assert/strict';
import { bookingLabel, contactMatches, contactUrl, disconnectedSales, salesRange, salesSummary } from '../lib/sales';
import { loadSales, normalizeContact, normalizeEvent, normalizeOpportunity } from '../lib/sales-server';
import { demoState } from '../lib/demo';
import { POST } from '../app/api/sales/route';
import { POST as workspacePost } from '../app/api/workspace/route';
import { salesReadOnlyPreview, salesPreviewAllows } from '../lib/sales-preview';

const start='2026-09-01',end='2026-09-30',config={locationId:'test-location',token:'test-private-token'};
const event=(status:string, contactId='a')=>normalizeEvent({id:status,contactId,calendarId:'cal',appointmentStatus:status,startTime:'2026-09-10T09:00:00Z'});
test('read-only guard is restricted to connected Vercel previews and blocks write surfaces',()=>{
  assert(salesReadOnlyPreview({VERCEL_ENV:'preview',GHL_PRIVATE_INTEGRATION_TOKEN:'test'}));
  assert(!salesReadOnlyPreview({VERCEL_ENV:'production',GHL_PRIVATE_INTEGRATION_TOKEN:'test'}));
  assert(!salesReadOnlyPreview({VERCEL_ENV:'preview'}));
  for(const path of ['/api/cron','/api/push','/api/files','/api/chat-files','/api/password','/api/onboarding','/api/form'])for(const method of ['GET','POST'])assert(!salesPreviewAllows(path,method));
  assert(salesPreviewAllows('/api/sales','POST'));assert(salesPreviewAllows('/api/login','POST'));assert(!salesPreviewAllows('/api/sales','DELETE'));
});
test('sales dates reject invalid, reversed and excessive ranges',()=>{
  for(const range of [[null,end],['2026-02-30',end],[end,start],[start,'2026-10-02'],['2026-9-1',end]])assert.throws(()=>salesRange(...range as [unknown,unknown]));
  assert.equal(salesRange(start,start).until-salesRange(start,start).from,86400000);
  assert.equal(salesRange('2024-02-29','2024-03-30').until-salesRange('2024-02-29','2024-03-30').from,31*86400000);
});
test('disconnected view contains no invented records or figures',async()=>{
  const d=disconnectedSales(start,end);assert.equal(d.mode,'disconnected');assert.equal(d.contacts.length+d.events.length+d.opportunities.length,0);
  const r=await loadSales(start,end,{},async()=>{throw new Error('Must not call provider');});assert.equal(r.mode,'disconnected');assert.equal(r.complete.contacts,false);
});
test('booking states handle canceled, no-show, unknown and missing data honestly',()=>{
  assert.equal(bookingLabel('a',[event('cancelled')],true),'Not booked');
  assert.equal(bookingLabel('a',[event('no-show')],true),'Booked');
  assert.equal(bookingLabel('a',[event('confirmed')],false),'Booked');
  assert.equal(bookingLabel('a',[],false),'Unknown');
  assert.equal(bookingLabel('a',[event('pending')],true),'Unknown');
  assert.equal(bookingLabel('a',[event('invalid')],true),'Not booked');
  assert.equal(bookingLabel('a',[event('confirmed','b')],true),'Not booked');
});
test('metrics count unique booked contacts separately from appointments and respect calendar/date filters',()=>{
  const d=disconnectedSales(start,end);d.complete={contacts:true,events:true,opportunities:true};
  d.contacts=[normalizeContact({id:'a',type:'lead',dateAdded:'2026-09-01T00:00:00Z'}),normalizeContact({id:'b',type:'customer',dateAdded:'2026-09-01T00:00:00Z'}),normalizeContact({id:'c',type:'lead',dateAdded:'2026-10-01T00:00:00Z'})];
  d.events=[event('new'),event('confirmed'),event('cancelled','b'),{...event('showed','c'),calendarId:'other'},{...event('confirmed','b'),start:'2026-10-01T00:00:00Z'}];
  const s=salesSummary(d,'cal');assert.equal(s.bookings,2);assert.equal(s.booked,1);assert.equal(s.unbooked,2);assert.equal(s.newLeads,1);assert.equal(s.cancelled,1);
});
test('normalizers keep only projected fields and escape contact URLs',()=>{
  const c=normalizeContact({id:'id',firstName:'Test',lastName:'Person',companyName:'Business',tags:['VIP',null],customFields:[{id:'f',value:['A','B']}],token:'must-not-leak',dnd:true});
  assert.equal(c.name,'Test Person');assert.equal(c.dnd,true);assert.deepEqual(c.tags,['VIP']);assert.equal(c.fields[0].value,'A, B');assert(!('token' in c));
  assert(contactMatches(c,'business'));assert(contactMatches(c,'vip'));assert(!contactMatches(c,'missing'));
  assert.equal(normalizeOpportunity({id:'1',monetaryValue:null}).value,null);assert.equal(normalizeOpportunity({id:'2',monetaryValue:0}).value,0);
  assert(contactUrl('a/b','?x').includes('a%2Fb/contacts/detail/%3Fx'));
});

function fakeTransport(overrides:Record<string,(url:URL,init?:RequestInit)=>unknown>={},calls:URL[]=[]):typeof fetch {
  return async(input,init)=>{
    const url=new URL(String(input));calls.push(url);assert.equal(url.origin,'https://services.leadconnectorhq.com');
    assert.equal(new Headers(init?.headers).get('authorization'),'Bearer test-private-token');assert.equal(init?.redirect,'error');assert.equal(init?.cache,'no-store');
    assert.equal(init?.method,url.pathname==='/contacts/search'?'POST':'GET','Provider writes are forbidden');
    const defaultData:Record<string,unknown>={'/contacts/search':{contacts:[{id:'a',locationId:'test-location',name:'Test'}],total:1},'/opportunities/search':{opportunities:[],meta:{total:0}},'/opportunities/pipelines':{pipelines:[]},'/users/':{users:[]},'/calendars/':{calendars:[{id:'cal',name:'Sales'}]},'/calendars/events':{events:[{id:'event',contactId:'a',calendarId:'cal',locationId:'test-location',startTime:'2026-09-10T09:00:00Z',appointmentStatus:'confirmed'}]}};
    const data=overrides[url.pathname]?overrides[url.pathname](url,init):defaultData[url.pathname];
    if(data instanceof Response)return data;assert(data,'Unexpected path');return Response.json(data);
  };
}
test('GHL adapter pins account, methods, version headers and event dates',async()=>{
  const calls:URL[]=[];const r=await loadSales(start,end,config,fakeTransport({'/calendars/events':(url,init)=>{assert.equal(new Headers(init?.headers).get('version'),'2021-04-15');assert.equal(url.searchParams.get('locationId'),config.locationId);assert.equal(url.searchParams.get('endTime'),String(Date.parse('2026-10-01')-1));return {events:[]};}},calls));
  assert.deepEqual(r.complete,{contacts:true,events:true,opportunities:true});assert.equal(r.contacts.length,1);assert.equal(r.warnings.length,0);assert.equal(calls.length,6);
});
test('contact search and opportunities load multiple pages without following upstream URLs',async()=>{
  const contacts=Array.from({length:101},(_,i)=>({id:`c${i}`}));const opportunities=Array.from({length:102},(_,i)=>({id:`o${i}`}));
  const r=await loadSales(start,end,config,fakeTransport({'/contacts/search':(_,init)=>{const b=JSON.parse(String(init?.body));assert.equal(b.locationId,config.locationId);return {contacts:contacts.slice((b.page-1)*100,b.page*100),total:101};},'/opportunities/search':url=>{const page=Number(url.searchParams.get('page'));return {opportunities:opportunities.slice((page-1)*100,page*100),meta:{total:102,nextPageUrl:'https://attacker.invalid/steal'}};}}));
  assert.equal(r.contacts.length,101);assert.equal(r.opportunities.length,102);assert(r.complete.contacts&&r.complete.opportunities);
});
test('repeated pages stop with partial status instead of looping or inflating totals',async()=>{
  const batch=Array.from({length:100},(_,i)=>({id:`c${i}`}));let count=0;
  const r=await loadSales(start,end,config,fakeTransport({'/contacts/search':()=>{count++;return {contacts:batch,total:101};}}));
  assert.equal(count,2);assert.equal(r.contacts.length,100);assert.equal(r.complete.contacts,false);
});
test('missing event permission never marks all contacts unbooked',async()=>{
  const r=await loadSales(start,end,config,fakeTransport({'/calendars/events':()=>new Response('private upstream detail',{status:403})}));
  assert.equal(r.complete.events,false);assert.equal(bookingLabel('a',r.events,r.complete.events),'Unknown');assert(!JSON.stringify(r).includes('private upstream detail'));assert.equal(r.contacts.length,1);
});
test('bad token and rate limiting return safe warnings without fabricated zero-success',async()=>{
  for(const status of [401,429,500]){
    const r=await loadSales(start,end,config,async()=>new Response('token and private body',{status}));
    assert.deepEqual(r.complete,{contacts:false,events:false,opportunities:false});assert(r.warnings.length>=4);assert(!JSON.stringify(r).includes(config.token));assert(!JSON.stringify(r).includes('private body'));
  }
});
test('unexpected schemas, network failures and wrong-account records fail safely',async()=>{
  for(const data of [{contacts:'wrong'}, {contacts:[{id:'wrong',locationId:'someone-else'}],total:1}]){
    const r=await loadSales(start,end,config,fakeTransport({'/contacts/search':()=>data}));assert.equal(r.complete.contacts,false);assert.equal(r.contacts.length,0);
  }
  const r=await loadSales(start,end,config,async()=>{throw new Error('secret details');});assert(r.warnings.every(w=>!w.includes('secret details')));
});
test('events deduplicate IDs and exclude out-of-window results',async()=>{
  const one={id:'e',contactId:'a',calendarId:'cal',startTime:'2026-09-10',appointmentStatus:'confirmed'};
  const r=await loadSales(start,end,config,fakeTransport({'/calendars/events':()=>({events:[one,one,{...one,id:'outside',startTime:'2026-10-01'}]})}));assert.equal(r.events.length,1);
});
test('empty GHL account is complete with no invented contacts',async()=>{
  const r=await loadSales(start,end,config,fakeTransport({'/contacts/search':()=>({contacts:[],total:0}),'/calendars/':()=>({calendars:[]})}));assert.equal(r.contacts.length,0);assert(r.complete.contacts&&r.complete.events);
});

test('actual sales route checks current membership, keeps credentials private, and never writes workspace',async t=>{
  const beforeEnv={...process.env},original=globalThis.fetch;let calls=0;const state=demoState();const snapshot=JSON.stringify(state);
  Object.assign(process.env,{NEXT_PUBLIC_SUPABASE_URL:'http://127.0.0.1:9999',SUPABASE_SERVICE_ROLE_KEY:'test-service',GHL_PRIVATE_INTEGRATION_TOKEN:config.token,GHL_LOCATION_ID:config.locationId});
  globalThis.fetch=async(input,init)=>{
    const url=new URL(typeof input==='string'?input:input instanceof URL?input.href:input.url);
    if(url.origin==='https://services.leadconnectorhq.com'){calls++;return fakeTransport()(input,init);}
    assert.equal(url.origin,'http://127.0.0.1:9999');assert(!init?.method||init.method==='GET','No Supabase writes');
    if(url.pathname==='/auth/v1/user'){const id=new Headers(init?.headers).get('authorization')?.replace('Bearer ','');return id&&id!=='bad'?Response.json({id,email:`${id}@example.com`,aud:'authenticated',created_at:'2026-01-01'}):Response.json({message:'bad'},{status:401});}
    assert.equal(url.pathname,'/rest/v1/workspace');return Response.json({data:state,version:1});
  };
  const req=(token:string,body:unknown={start,end})=>new Request('http://localhost/api/sales',{method:'POST',headers:token?{Authorization:`Bearer ${token}`}:{},body:JSON.stringify(body)});
  try {
    for(const token of ['','bad','outsider','john','carl'])await t.test(`reject ${token||'anonymous'}`,async()=>{calls=0;assert.equal((await POST(req(token))).status,['','bad'].includes(token)?401:403);assert.equal(calls,0);});
    for(const token of ['owner','yaniv'])await t.test(`allow owner role ${token}`,async()=>{const r=await POST(req(token));assert.equal(r.status,200);assert.match(r.headers.get('cache-control')!,/no-store/);const body=await r.text();assert(!body.includes(config.token));assert(body.includes('test-location'));});
    for(const body of [null,{}, {start,end:'2099-12-31'}])await t.test(`reject invalid range ${JSON.stringify(body)}`,async()=>{calls=0;assert.equal((await POST(req('owner',body))).status,400);assert.equal(calls,0);});
    await t.test('real-data preview refresh is read-only and rejects changes',async()=>{
      process.env.VERCEL_ENV='preview';
      assert.equal((await workspacePost(req('owner',{type:'refresh'}))).status,200);
      assert.equal((await workspacePost(req('owner',{type:'taskCreate',title:'Must not save'}))).status,403);
    });
    assert.equal(JSON.stringify(state),snapshot);
  } finally {globalThis.fetch=original;for(const key of Object.keys(process.env))if(!(key in beforeEnv))delete process.env[key];Object.assign(process.env,beforeEnv);}
});
