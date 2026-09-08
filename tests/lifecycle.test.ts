import { test } from 'node:test';
import assert from 'node:assert/strict';
import {demoState} from '../lib/demo';
import {transition,tick,visibleState,checklist,importClient,Action} from '../lib/workflow';
const now=Date.UTC(2026,8,5,16), hour=3600000;
test('complete lifecycle: intake, onboarding, footage, revision, approval, campaign, launch, trial, recurring care, closure',()=>{
  let s=demoState();s.clients=[];s.tasks=[];s.notifications=[];
  importClient(s,{sourceId:'full-cycle',name:'Regression business',person:'',email:'',location:'Miami'},now);
  const id=s.clients[0].id;
  const act=(member:number,a:Action,time=now)=>{s=transition(s,s.members[member],{clientId:id,...a},time);};
  const client=()=>s.clients[0];
  assert.equal(s.notifications.length,2);
  assert.throws(()=>act(0,{type:'onboard'}),/Complete all/);
  for(const key of checklist)act(1,{type:'check',key});
  act(0,{type:'onboard'});assert.equal(client().stage,'Filming');
  assert.throws(()=>act(0,{type:'onboard'}));
  act(0,{type:'raw',files:[{path:id+'/raw.mp4',name:'raw.mp4'}]});
  const editId=s.tasks[0].id;assert.equal(client().stage,'Editing');assert.equal(s.tasks[0].assignee,'john');assert.equal(Date.parse(s.tasks[0].dueAt!),now+24*hour);
  act(2,{type:'submit',taskId:editId,value:'https://drive.google.com/file/d/test-file/view'},now+hour);
  assert.equal(client().stage,'In review');assert.equal(s.tasks[0].dueAt,null);
  act(0,{type:'revise',taskId:editId,value:'Shorten opening'},now+2*hour);
  assert.equal(s.tasks[0].cycle,1);assert.equal(Date.parse(s.tasks[0].dueAt!),now+8*hour);
  act(2,{type:'submit',taskId:editId,value:'https://drive.google.com/file/d/revised/view'},now+3*hour);
  act(0,{type:'approve',taskId:editId},now+4*hour);
  assert.equal(s.tasks[0].status,'done');assert.equal(client().stage,'Campaign setup');
  const campaign=s.tasks.find(t=>t.kind==='campaign')!;assert.equal(campaign.assignee,'carl');assert.equal(Date.parse(campaign.dueAt!),now+28*hour);
  assert.throws(()=>act(0,{type:'approve',taskId:editId}));
  act(3,{type:'campaign',taskId:campaign.id},now+5*hour);assert.equal(client().stage,'Ready to launch');
  const closebot=s.tasks.find(t=>t.campaignTaskId===campaign.id)!;assert.equal(closebot.assignee,'yaniv');
  act(1,{type:'completeTask',taskId:closebot.id},now+5*hour);assert.equal(s.tasks.find(t=>t.id===closebot.id)!.status,'done');
  for(const key of ['launchCall','paymentConfirmed'])act(1,{type:'launchCheck',key});
  act(0,{type:'launch'},now+6*hour);assert.equal(client().stage,'Trial');assert.equal(Date.parse(client().trialEnd!),now+342*hour);
  tick(s,now+270*hour-1);assert.equal(s.notifications.filter(n=>n.id.includes(':trial:')).length,0);
  tick(s,now+270*hour);assert.equal(s.notifications.filter(n=>n.id.includes(':trial:')).length,2);
  act(1,{type:'continue'},now+342*hour);assert.equal(client().stage,'Active');assert.equal(Date.parse(client().nextUpdate!),now+402*hour);
  tick(s,now+402*hour);let updates=s.tasks.filter(t=>t.kind==='update');assert.equal(updates.length,1);assert.equal(updates[0].assignee,'owner');
  act(0,{type:'update',taskId:updates[0].id,value:'Results shared with client'},now+403*hour);assert.equal(s.tasks.at(-1)!.status,'done');
  tick(s,now+486*hour);updates=s.tasks.filter(t=>t.kind==='update');assert.equal(updates.length,2);
  act(1,{type:'close'},now+487*hour);assert.equal(client().stage,'Closed');assert(s.tasks.every(t=>t.status==='done'&&!t.dueAt));
  const count=s.notifications.length;tick(s,now+1000*hour);assert.equal(s.notifications.length,count);assert.equal(s.tasks.length,5);assert(s.events.length>=17);
});
for(const type of ['profile','owner','check','onboard','raw','launchCheck','launch','continue','close','reassign','member'])for(const index of [2,3])test(`${type} rejects ${index===2?'editor':'campaign'} owner privileges`,()=>{
  const s=demoState(),before=structuredClone(s);assert.throws(()=>transition(s,s.members[index],{type,clientId:'demo-5',taskId:'edit-1',value:'owner',key:checklist[0],member:{id:'test',name:'Test',role:'manager'}},now),/Owners only/);assert.deepEqual(s,before);
});
test('role forgery and cross-client task IDs cannot bypass permissions',()=>{
  const s=demoState();assert.throws(()=>transition(s,{...s.members[2],role:'approver'},{type:'refresh'}),/Unauthorized/);
  assert.throws(()=>transition(s,s.members[2],{type:'submit',clientId:'demo-0',taskId:'edit-1',value:'https://drive.google.com/file/d/x/view'}),/assigned/);
});
test('invalid links and blank revision or update notes do not change data',()=>{
  const s=demoState();for(const value of ['','https://evil.test/file/d/id','https://drive.google.com.evil.test/file/d/id','javascript:alert(1)','https://drive.google.com/drive/folders/x'])assert.throws(()=>transition(s,s.members[2],{type:'submit',clientId:'demo-1',taskId:'edit-1',value}),/Drive/);
  assert.throws(()=>transition(s,s.members[0],{type:'revise',clientId:'demo-0',taskId:'edit-0',value:'   '}),/instructions/);
  s.clients[7].nextUpdate=new Date(now).toISOString();tick(s,now);const t=s.tasks.at(-1)!;
  assert.throws(()=>transition(s,s.members[1],{type:'update',clientId:'demo-7',taskId:t.id,value:'   '}),/summary/);
});
test('deadline boundaries and cycles generate exactly one notice per recipient and phase',()=>{
  const s=demoState();s.clients=[];s.tasks=[{...s.tasks[1],createdAt:new Date(now).toISOString(),dueAt:new Date(now+24*hour).toISOString()}];s.notifications=[];
  tick(s,now+18*hour-1);assert.equal(s.notifications.length,0);tick(s,now+18*hour);assert.equal(s.notifications.length,2);
  tick(s,now+24*hour-1);assert.equal(s.notifications.length,2);tick(s,now+24*hour);assert.equal(s.notifications.length,4);tick(s,now+48*hour);assert.equal(s.notifications.length,4);
  s.tasks[0].cycle++;tick(s,now+48*hour);assert.equal(s.notifications.length,6);
});
test('reassigning ownership alerts new update assignee and preserves due date',()=>{
  const s=demoState();s.clients[7].nextUpdate=new Date(now).toISOString();tick(s,now);const task=s.tasks.at(-1)!;const next=transition(s,s.members[0],{type:'owner',clientId:'demo-7',value:'owner'},now);
  assert.equal(next.tasks.at(-1)!.assignee,'owner');assert.equal(next.tasks.at(-1)!.dueAt,task.dueAt);assert(next.notifications.some(n=>n.userId==='owner'&&n.clientId==='demo-7'&&n.text.includes('assigned')));
});
test('reassignment removes inaccessible notices and repeated same assignment stays quiet',()=>{
  const s=demoState();s.members.push({id:'second',name:'Second',role:'editor'});s.notifications.push({id:'assigned',clientId:'demo-1',userId:'john',text:'Private client task',createdAt:new Date(now).toISOString(),read:false});
  const action={type:'reassign',clientId:'demo-1',taskId:'edit-1',value:'second'};const next=transition(s,s.members[0],action,now);
  assert(!visibleState(next,next.members[2]).notifications.some(n=>n.id==='assigned'));assert.deepEqual(transition(next,next.members[0],action,now),next);
});
test('team changes protect approver, unique usernames, existing client ownership and open assignments',()=>{
  const s=demoState();for(const member of [{id:'owner',name:'Owner',role:'manager'},{id:'second',name:'John Second',role:'editor'},{id:'john',name:'John',role:'campaign'},{id:'yaniv',name:'Yaniv',role:'editor'},{id:'empty',name:' ',role:'editor'}])assert.throws(()=>transition(s,s.members[0],{type:'member',member:member as any}));
  const next=transition(s,s.members[0],{type:'member',member:{id:'second',name:' Second Editor ',role:'editor'}});assert.equal(next.members.at(-1)!.name,'Second Editor');
});
test('missing downstream assignee fails atomically without advancing stage',()=>{
  const s=demoState();s.members=s.members.filter(m=>m.role!=='campaign');const before=structuredClone(s);assert.throws(()=>transition(s,s.members[0],{type:'approve',clientId:'demo-0',taskId:'edit-0'}),/Configure/);assert.deepEqual(s,before);
});
test('profile edits whitelist editable fields and cannot change stage, owner or payments',()=>{
  const s=demoState();const next=transition(s,s.members[0],{type:'profile',clientId:'demo-5',profile:{phone:'555',stage:'Active',owner:'john',paymentConfirmed:true}});assert.equal(next.clients[5].phone,'555');assert.equal(next.clients[5].stage,'Onboarding');assert.equal(next.clients[5].owner,'yaniv');assert.equal(next.clients[5].paymentConfirmed,false);
});
test('mark all read affects only current recipient',()=>{
  const s=demoState();tick(s,Date.now()+48*hour);const next=transition(s,s.members[0],{type:'read'});assert(next.notifications.filter(n=>n.userId==='owner').every(n=>n.read));assert.deepEqual(next.notifications.filter(n=>n.userId!=='owner'),s.notifications.filter(n=>n.userId!=='owner'));
});
