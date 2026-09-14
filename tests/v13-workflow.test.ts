import { test } from "node:test";
import assert from "node:assert/strict";
import { demoState } from "../lib/demo";
import { transition, tick, visibleState, pipelineVersion, taskVersion, type Action } from "../lib/workflow";
const now = Date.UTC(2026,8,14), day = 86400000;
test("Both owners can record a past unpaid trial or restart a closed client; dates and history survive", () => {
  for (const actor of ["owner","yaniv"]) for (const stage of ["Active","Closed","Trial"] as const) {
    const s = demoState(), c = s.clients[0]; c.stage=stage; c.nextUpdate=new Date(now).toISOString(); c.paymentConfirmed=true;
    const action: Action = {type:"setTrial",clientId:c.id,pipelineVersion:pipelineVersion(s,c),reason:"Client is trying again",trial:{start:new Date(now-12*day).toISOString(),end:new Date(now+2*day).toISOString(),paymentPending:true}};
    const next=transition(s,s.members.find(m=>m.id===actor)!,action,now), updated=next.clients[0];
    assert.equal(updated.stage,"Trial"); assert.equal(updated.trialPaymentPending,true); assert.equal(updated.trialStartedAt,action.trial!.start); assert.equal(updated.trialEnd,action.trial!.end);
    assert.equal(updated.paymentConfirmed,true, "External setup is separate from payment status");
    assert.equal(updated.nextUpdate,undefined); assert.deepEqual(updated.rawFiles,c.rawFiles); assert(next.events.at(-1)!.text.includes("Client is trying again"));
    assert(next.tasks.filter(t=>t.clientId===c.id && t.status!=="done" && t.kind!=="custom").every(t=>t.archivedAt));
    tick(next,now); const count=next.notifications.length; tick(next,now); assert.equal(next.notifications.length,count);
    for(const id of ["owner","yaniv"]) assert(next.notifications.some(n=>n.userId===id && n.id.includes(":trial:")));
    assert.equal(s.clients[0].stage,stage);
    assert.throws(()=>transition(next,next.members[0],action,now),/client changed/);
    const restarted=transition(next,next.members[0],{...action,pipelineVersion:pipelineVersion(next,updated)},now);
    tick(restarted,now); assert(restarted.notifications.filter(n=>n.id.includes(":trial:")).length > next.notifications.filter(n=>n.id.includes(":trial:")).length);
  }
});
test("Trial changes reject staff, invalid dates and stale client state", () => {
  const s=demoState(), c=s.clients[0];
  const action:Action={type:"setTrial",clientId:c.id,pipelineVersion:pipelineVersion(s,c),reason:"Correction",trial:{start:new Date(now).toISOString(),end:new Date(now+14*day).toISOString(),paymentPending:true}};
  assert.throws(()=>transition(s,s.members[2],action,now),/Owners/);
  for(const trial of [{...action.trial!,start:"invalid"},{...action.trial!,end:action.trial!.start},{...action.trial!,paymentPending:"yes"}]) assert.throws(()=>transition(s,s.members[0],{...action,trial} as Action,now));
  assert.throws(()=>transition(s,s.members[0],{...action,pipelineVersion:"old"},now),/changed/);
});
test("Bulk completion is atomic, checks snapshots and never bypasses workflow approvals", () => {
  let s=demoState();
  for(const title of ["One","Two"]) s=transition(s,s.members[3],{type:"createTask",task:{title,assignee:"john"}},now);
  const tasks=s.tasks.slice(-2), snapshots=tasks.map(t=>({id:t.id,version:taskVersion(t)}));
  const next=transition(s,s.members[2],{type:"bulkComplete",snapshots},now); assert(next.tasks.slice(-2).every(t=>t.status==="done")); assert(s.tasks.slice(-2).every(t=>t.status==="open"));
  assert.throws(()=>transition(next,next.members[2],{type:"bulkComplete",snapshots},now),/changed/);
  const other=transition(s,s.members[0],{type:"createTask",task:{title:"Private",assignee:"owner"}},now), t=other.tasks.at(-1)!;
  assert.throws(()=>transition(other,other.members[2],{type:"bulkComplete",snapshots:[...snapshots,{id:t.id,version:taskVersion(t)}]},now),/Only/); assert(other.tasks.slice(-3).every(t=>t.status==="open"));
  assert.throws(()=>transition(s,s.members[0],{type:"bulkComplete",snapshots:[{id:s.tasks[0].id,version:taskVersion(s.tasks[0])}]},now),/Task not found/);
});
test("Read/unread changes only selected visible notices and does not send fresh alerts", () => {
  const s=demoState(); s.notifications=[{id:"a",userId:"owner",clientId:"",text:"a",createdAt:new Date(now).toISOString(),read:false},{id:"b",userId:"owner",clientId:"",text:"b",createdAt:new Date(now).toISOString(),read:false},{id:"c",userId:"yaniv",clientId:"",text:"c",createdAt:new Date(now).toISOString(),read:false}];
  let next=transition(s,s.members[0],{type:"bulkNotices",ids:["a"],value:"read"},now); assert.deepEqual(next.notifications.map(n=>n.read),[true,false,false]);
  next=transition(next,next.members[0],{type:"bulkNotices",ids:["a"],value:"unread"},now); assert.equal(next.notifications.length,3); assert(next.notifications.every(n=>!n.read));
  assert.throws(()=>transition(s,s.members[0],{type:"bulkNotices",ids:["a","c"],value:"read"},now),/Only/); assert(s.notifications.every(n=>!n.read));
});
test("Client directory enables any-client tasks while private fields and unrelated messages stay hidden", () => {
  let s=demoState(); s.clients[6].email="private@example.test"; s.clients[6].phone="123";
  const staff=s.members[3], visible=visibleState(s,staff); assert.equal(visible.clientDirectory!.length,s.clients.length);
  assert(!JSON.stringify(visible.clientDirectory).includes("private@example.test")); assert(!visible.clients.some(c=>c.id===s.clients[6].id));
  s=transition(s,staff,{type:"createTask",clientId:s.clients[6].id,task:{title:"Client task",category:"Ads",assignee:staff.id}},now);
  assert.equal(s.tasks.at(-1)!.category,"Ads"); assert.equal(visibleState(s,staff).clients.find(c=>c.id===s.clients[6].id)!.email,"");
});
test("Client templates are shared, owner-managed, versioned and independent of created tasks", () => {
  let s=demoState(); const clientId=s.clients[0].id, template={id:"ad-update",title:"Review ad",category:"Ads",notes:"Check results"};
  const a:Action={type:"saveTemplate",clientId,templateRevision:0,template};
  assert.throws(()=>transition(s,s.members[3],a,now),/Owners/);
  s=transition(s,s.members[0],a,now); assert.deepEqual(visibleState(s,s.members[3]).clientDirectory![0].taskTemplates,[template]);
  assert.throws(()=>transition(s,s.members[0],a,now),/changed/);
  s=transition(s,s.members[3],{type:"createTask",clientId,task:{...template,assignee:"john"}},now); const before=structuredClone(s.tasks);
  s=transition(s,s.members[0],{type:"deleteTemplate",clientId,key:template.id,templateRevision:1},now); assert.deepEqual(s.tasks,before); assert.deepEqual(s.clients[0].taskTemplates,[]);
});

test("Campaign pipeline overview includes all stages without granting private client or task access", () => {
  const s=demoState(), karl=s.members.find(m=>m.role==='campaign')!;
  const unrelated=s.clients.find(c=>!s.tasks.some(t=>t.clientId===c.id&&(t.assignee===karl.id||t.createdBy===karl.id)))!;
  unrelated.email='private@example.test'; unrelated.phone='private phone'; unrelated.rawFiles=[{path:'private/file',name:'Private video'}];
  const view=visibleState(s,karl);
  assert.equal(view.pipeline!.clients.length,s.clients.length);
  assert.deepEqual(view.pipeline!.clients.map(c=>c.stage),s.clients.map(c=>c.stage));
  assert(!view.clients.some(c=>c.id===unrelated.id));
  assert(view.tasks.every(t=>t.assignee===karl.id||t.createdBy===karl.id));
  const card=view.pipeline!.clients.find(c=>c.id===unrelated.id)!;
  assert.deepEqual(Object.keys(card).sort(),['id','name','location','owner','stage','trialEnd','onboardingCompleted','nextTaskDueAt'].sort());
  assert(!JSON.stringify(view.pipeline).includes('private'));
  assert.deepEqual(visibleState(view,karl).pipeline,view.pipeline);
  assert.deepEqual(visibleState(view,karl).clientDirectory,view.clientDirectory);
  assert.equal(visibleState(view,s.members.find(m=>m.role==='editor')!).pipeline,undefined);
  assert.throws(()=>transition(s,karl,{type:'movePipeline',clientId:unrelated.id,value:'Trial',pipelineVersion:pipelineVersion(s,unrelated)},now),/Only the ad approver/);
  assert.throws(()=>transition(s,karl,{type:'owner',clientId:unrelated.id,value:karl.id},now));
});
