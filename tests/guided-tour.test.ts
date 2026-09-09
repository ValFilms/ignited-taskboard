import {test} from 'node:test';
import assert from 'node:assert/strict';
import {practiceState,practiceId,practiceAction,tourSteps,stepComplete,actionMilestones,type TourSnapshot} from '../lib/guided-tour';
import {visibleState,checklist,type Member,type Action} from '../lib/workflow';

const empty:TourSnapshot={view:'settings',selected:null,creating:false,filter:'mine',chat:'',events:[],profileOpen:false};
for(const role of ['approver','manager','editor','campaign'] as const){
  test(role+' can finish practice actions without changing another session or calling a server',()=>{
    const person:Member={id:'real-account-id',name:{approver:'Val',manager:'Yaniv',editor:'John',campaign:'Karl'}[role],role};
    let s=practiceState(person);const untouched=practiceState(person), before=JSON.stringify(untouched);
    const me=s.members.find(m=>m.id===practiceId(role))!;
    assert.notEqual(me.id,person.id);assert.equal(s.clients.some(c=>!c.sourceId?.startsWith('sample-')),false);
    const run=(a:Action)=>{s=practiceAction(s,me,a);return actionMilestones(a,me);};
    const target=me.id==='owner'?'yaniv':'owner';
    assert(visibleState(s,me).tasks.some(t=>t.id==='tour-received'));
    assert.deepEqual(run({type:'sendMessage',message:{id:crypto.randomUUID(),body:`@${s.members.find(m=>m.id===target)!.name} Ready to review`,target:{kind:'task',taskId:'tour-received'}}}),['comment']);
    assert.deepEqual(run({type:'completeTask',taskId:'tour-received'}),['complete']);
    assert.deepEqual(run({type:'createTask',task:{title:'Practice refilm',notes:'Please improve the opening shot',assignee:target}}),['assign']);
    assert(visibleState(s,me).tasks.some(t=>t.createdBy===me.id&&t.title==='Practice refilm'));
    assert.deepEqual(run({type:'sendMessage',message:{id:crypto.randomUUID(),body:`@${s.members.find(m=>m.id===target)!.name} Team update`,target:{kind:'team'}}}),['team-send']);
    assert.deepEqual(run({type:'sendMessage',message:{id:crypto.randomUUID(),body:'Private update',target:{kind:'direct',memberId:target}}}),['direct-send']);
    assert.deepEqual(run({type:'read'}),['read']);
    if(role==='editor'){
      assert.deepEqual(run({type:'submit',taskId:'edit-1',clientId:'demo-1',value:'https://drive.google.com/drive/folders/practice-edits'}),['submit']);
      assert.equal(s.tasks.find(t=>t.id==='edit-1')!.dueAt,null);
    }
    if(role==='campaign'){
      assert.deepEqual(run({type:'campaign',taskId:'campaign-2',clientId:'demo-2'}),['campaign']);
      assert(s.tasks.some(t=>t.campaignTaskId==='campaign-2'&&t.assignee==='yaniv'));
    }
    if(role==='manager'||role==='approver'){
      for(const key of checklist)if(!s.clients.find(c=>c.id==='demo-5')!.onboarding[key])run({type:'check',clientId:'demo-5',key});
      assert.deepEqual(run({type:'onboard',clientId:'demo-5'}),['onboard']);assert.equal(s.clients.find(c=>c.id==='demo-5')!.stage,'Filming');
    }
    if(role==='manager')assert.deepEqual(run({type:'completeTask',taskId:'tour-closebot'}),['integration']);
    if(role==='approver'){
      assert.deepEqual(run({type:'revise',clientId:'demo-0',taskId:'edit-0',value:'Tighten opening shot'}),['revise']);
      s=practiceAction(s,s.members.find(m=>m.id==='john')!,{type:'submit',clientId:'demo-0',taskId:'edit-0',value:'https://drive.google.com/drive/folders/practice-edits'});
      assert.deepEqual(run({type:'approve',clientId:'demo-0',taskId:'edit-0'}),['approve']);
      for(const key of ['launchCall','paymentConfirmed'])run({type:'launchCheck',clientId:'demo-3',key});
      assert.deepEqual(run({type:'launch',clientId:'demo-3'}),['launch']);assert.equal(s.clients.find(c=>c.id==='demo-3')!.stage,'Trial');
    }
    assert.equal(JSON.stringify(untouched),before);assert.equal(s.pushQueue,undefined);
  });
  test(role+' guide requires user actions, with only upload/push orientation skippable',()=>{
    const steps=tourSteps(role);assert.equal(new Set(steps.map(s=>s.id)).size,steps.length);
    for(const step of steps)if(!['upload','push','settings'].includes(step.id))assert.equal(stepComplete(step.id,empty),false,step.id);
    assert(steps.some(s=>s.id==='assign'));assert(steps.some(s=>s.id==='direct-send'));assert.equal(steps.at(-1)!.id,'push');
    assert.equal(steps.some(s=>s.id==='approve'),role==='approver');assert.equal(steps.some(s=>s.id==='submit'),role==='editor');
    assert.equal(stepComplete('comment',{...empty,events:['team-send']}),false);
    assert.equal(stepComplete('comment',{...empty,events:['comment']}),true);
  });
}
test('invalid practice actions retain real validation and do not count as progress',()=>{
  const s=practiceState({id:'real',name:'John',role:'editor'}),me=s.members.find(m=>m.id==='john')!;
  assert.throws(()=>practiceAction(s,me,{type:'approve',clientId:'demo-0',taskId:'edit-0'}));
  assert.throws(()=>practiceAction(s,me,{type:'submit',clientId:'demo-1',taskId:'edit-1',value:'not a folder'}));
  assert.throws(()=>practiceAction(s,me,{type:'createTask',task:{title:'Self task',notes:'Note',assignee:me.id}}),/another teammate/);
  assert.deepEqual(actionMilestones({type:'createTask',task:{title:'Self task',notes:'Note',assignee:me.id}},me),[]);
  assert.deepEqual(actionMilestones({type:'sendMessage',message:{id:crypto.randomUUID(),body:'No mention',target:{kind:'task',taskId:'tour-received'}}},me),[]);
});
