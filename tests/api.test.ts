import { test } from 'node:test';
import assert from 'node:assert/strict';
import { demoState } from '../lib/demo';
import { taskVersion } from '../lib/workflow';
import * as workspace from '../app/api/workspace/route';
import * as files from '../app/api/files/route';
import * as login from '../app/api/login/route';
import * as form from '../app/api/form/route';
import * as cron from '../app/api/cron/route';

// Exercise actual handlers and the Supabase SDK against an isolated transport.
test('API regression with isolated Supabase transport', async t => {
  const originalFetch = globalThis.fetch;
  const env = { ...process.env };
  Object.assign(process.env, { NEXT_PUBLIC_SUPABASE_URL: 'http://127.0.0.1:9999',
    NEXT_PUBLIC_SUPABASE_ANON_KEY: 'test-public', SUPABASE_SERVICE_ROLE_KEY: 'test-private',
    FORM_WEBHOOK_SECRET: 'test-form', CRON_SECRET: 'test-cron' });
  let state = demoState(), version = 1, conflicts = 0, writes = 0, storage: any[] = [];
  let onConflict: (() => void) | undefined;
  const reset = () => { state = demoState(); version = 1; conflicts = 0; writes = 0; storage = []; onConflict = undefined; };
  const user = (id: string) => ({ id, email: id + '@example.test', aud: 'authenticated', role: 'authenticated', created_at: new Date().toISOString() });
  globalThis.fetch = async (input, init) => {
    const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url);
    assert.equal(url.origin, 'http://127.0.0.1:9999', 'Tests must never contact production');
    const body = init?.body ? JSON.parse(String(init.body)) : {};
    const headers = new Headers(init?.headers);
    if (url.pathname === '/auth/v1/user') {
      const id = headers.get('authorization')?.replace('Bearer ', '') || '';
      return ['owner','yaniv','john','carl','outsider'].includes(id) ? Response.json(user(id)) : Response.json({message:'invalid JWT'}, {status:401});
    }
    if (url.pathname.startsWith('/auth/v1/admin/users/')) return Response.json({user: user(url.pathname.split('/').at(-1)!)});
    if (url.pathname === '/auth/v1/token') return body.password === 'valid-password'
      ? Response.json({access_token:'test-token',refresh_token:'test-refresh',token_type:'bearer',expires_in:3600,user:user(body.email.split('@')[0])})
      : Response.json({msg:'Invalid credentials'}, {status:400});
    if (url.pathname === '/rest/v1/workspace') {
      if (init?.method === 'PATCH') {
        writes++;
        if (conflicts-- > 0) { version++; state.clients[0].offer = 'Concurrent change'; onConflict?.(); return Response.json([]); }
        assert.equal(url.searchParams.get('version'), 'eq.' + version);
        state = body.data; version = body.version; return Response.json([{version}]);
      }
      return Response.json({data:state,version});
    }
    if (url.pathname === '/storage/v1/object/list/raw-footage') return Response.json(storage);
    if (url.pathname.startsWith('/storage/v1/object/upload/sign/')) return Response.json({url:'/object/upload/sign/raw-footage/test?token=test-upload'});
    if (url.pathname.startsWith('/storage/v1/object/sign/')) return Response.json({signedURL:'/object/sign/raw-footage/test?token=test-download'});
    throw new Error('Unexpected test request: ' + url.pathname);
  };
  const req = (body?: unknown, token = 'owner') => new Request('http://localhost/api', {method: body === undefined ? 'GET':'POST', headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'}, ...(body === undefined ? {} : {body:JSON.stringify(body)})});
  try {
    for (const id of ['owner','yaniv','john','carl']) await t.test('workspace visibility: '+id, async () => {
      reset(); const r=await workspace.GET(req(undefined,id)); const s=await r.json();
      assert.equal(r.status,200); assert.equal(r.headers.get('cache-control'),'no-store');
      if (['john','carl'].includes(id)) { assert(s.tasks.every((x:any)=>x.assignee===id)); assert(s.clients.every((c:any)=>!c.email&&!c.phone&&!c.closebot)); assert.deepEqual(s.events,[]); }
      else assert.equal(s.clients.length,8);
    });
    for(const id of ['', 'invalid', 'outsider']) await t.test('reject unauthorised workspace: '+id,async()=>{
      reset(); assert.equal((await workspace.POST(req({type:'refresh'},id))).status,id==='outsider'?403:401); assert.equal(writes,0);
    });
    for(const body of [{type:'raw',clientId:'demo-6',files:[{path:'fake',name:'fake'}]}, {type:'unknown',clientId:'demo-6'}, {type:'profile',clientId:'missing'}, null]) await t.test('invalid workspace action '+JSON.stringify(body),async()=>{
      reset(); assert.equal((await workspace.POST(req(body))).status,400); assert.equal(writes,0);
    });
    await t.test('compare-and-swap retries preserve concurrent changes',async()=>{
      reset(); conflicts=2; const r=await workspace.POST(req({type:'profile',clientId:'demo-1',profile:{phone:'123'}}));
      assert.equal(r.status,200); assert.equal(writes,3); assert.equal(state.clients[0].offer,'Concurrent change'); assert.equal(state.clients[1].phone,'123');
    });
    await t.test('compare-and-swap exhaustion reports failure',async()=>{
      reset(); conflicts=5; assert.equal((await workspace.POST(req({type:'profile',clientId:'demo-1',profile:{phone:'123'}}))).status,400); assert.equal(writes,5); assert.equal(state.clients[1].phone,'');
    });
    await t.test('task editing and archiving enforce the authenticated assigner and owner permissions', async () => {
      reset();
      assert.equal((await workspace.POST(req({type:'createTask', task:{title:'API task',assignee:'john',notes:'Original',dueAt:null}},'carl'))).status,200);
      let task = state.tasks.at(-1)!;
      const change = {type:'editTask',taskId:task.id,taskVersion:taskVersion(task),task:{title:'Edited through API',assignee:'john',notes:'Changed',dueAt:null}};
      const before = writes;
      assert.equal((await workspace.POST(req({...change,role:'approver',userId:'owner'},'john'))).status,403); assert.equal(writes,before);
      assert.equal((await workspace.POST(req(change,'carl'))).status,200); task=state.tasks.at(-1)!;
      const archive={type:'archiveTask',taskId:task.id,taskVersion:taskVersion(task)};
      assert.equal((await workspace.POST(req(archive,'john'))).status,403);
      assert.equal((await workspace.POST(req(archive,'yaniv'))).status,200); task=state.tasks.at(-1)!;
      assert.equal(task.archivedBy,'yaniv'); assert.equal(task.title,'Edited through API');
      assert.equal((await workspace.POST(req({type:'completeTask',taskId:task.id},'john'))).status,400);
      const restore={type:'restoreTask',taskId:task.id,taskVersion:taskVersion(task)};
      assert.equal((await workspace.POST(req(restore,'john'))).status,403);
      assert.equal((await workspace.POST(req(restore,'owner'))).status,200); assert.equal(state.tasks.at(-1)!.archivedAt,undefined);
    });
    await t.test('an edit retry detects a concurrently changed task and preserves the newer details', async () => {
      reset();
      await workspace.POST(req({type:'createTask',task:{title:'Original task',notes:'Original',assignee:'john',dueAt:null}},'carl'));
      const task=state.tasks.at(-1)!;
      conflicts=1; onConflict=()=>{state.tasks.at(-1)!.notes='Newer teammate instructions';};
      const result=await workspace.POST(req({type:'editTask',taskId:task.id,taskVersion:taskVersion(task),task:{title:'Old draft',notes:'Stale notes',assignee:'john',dueAt:null}},'carl'));
      assert.equal(result.status,400); assert.match((await result.json()).error,/changed while/);
      assert.equal(state.tasks.at(-1)!.title,'Original task'); assert.equal(state.tasks.at(-1)!.notes,'Newer teammate instructions');
    });
    await t.test('message API derives identity, retries CAS and keeps private data out of other responses',async()=>{
      reset(); conflicts=2;
      const action={type:'sendMessage',message:{id:crypto.randomUUID(),body:'Private API test',target:{kind:'direct',memberId:'carl'},senderId:'owner',createdAt:'forged'}};
      const r=await workspace.POST(req(action,'john'));assert.equal(r.status,200);
      assert.equal(state.messages?.length,1);assert.equal(state.messages?.[0].senderId,'john');assert.notEqual(state.messages?.[0].createdAt,'forged');
      assert.equal(state.clients[0].offer,'Concurrent change');
      assert.equal((await workspace.POST(req(action,'john'))).status,200);assert.equal(state.messages?.length,1);
      for(const id of ['owner','yaniv']) {
        const visible=await (await workspace.GET(req(undefined,id))).json();assert.deepEqual(visible.messages,[]);assert(!JSON.stringify(visible).includes('Private API test'));
      }
      const recipient=await (await workspace.GET(req(undefined,'carl'))).json();assert.equal(recipient.messages.length,1);assert.equal(recipient.notifications.filter((n:any)=>n.messageId).length,1);
    });
    await t.test('message API rejects unknown users and forbidden task threads without writing',async()=>{
      reset();const action={type:'sendMessage',message:{id:crypto.randomUUID(),body:'Test',target:{kind:'task',taskId:'campaign-2'}}};
      assert.equal((await workspace.POST(req(action,'john'))).status,403);
      assert.equal((await workspace.POST(req(action,'outsider'))).status,403);assert.equal(writes,0);
    });
    await t.test('unchanged polling avoids database writes',async()=>{
      reset();state.tasks=[];state.clients=[];assert.equal((await workspace.POST(req({type:'refresh'}))).status,200);assert.equal(writes,0);
    });
    await t.test('team access requires an owner and a real Auth UUID',async()=>{
      reset(); const action={type:'member',member:{id:'00000000-0000-4000-8000-000000000099',name:'Second',role:'editor'}};
      assert.equal((await workspace.POST(req(action,'john'))).status,403);
      assert.equal((await workspace.POST(req({...action,member:{...action.member,id:'not-a-user'}}))).status,400);
      assert.equal((await workspace.POST(req(action))).status,200);assert.equal(state.members.length,5);
    });
    await t.test('oversized and malformed request bodies are rejected',async()=>{
      reset();for(const route of [workspace,files]) {
        assert.equal((await route.POST(req({type:'refresh',padding:'x'.repeat(32001)}))).status,400);
        assert.equal((await route.POST(new Request('http://localhost/api',{method:'POST',headers:{Authorization:'Bearer owner'},body:'{broken'}))).status,400);
      } assert.equal(writes,0);
    });
    for(const username of ['Val',' VAL ','Yaniv','John','Karl','owner@example.test']) await t.test('username login '+username,async()=>{
      reset(); state.members.forEach((m,i)=>m.id=`00000000-0000-4000-8000-00000000000${i}`); const r=await login.POST(req({username,password:'valid-password'})); assert.equal(r.status,200); assert.equal(r.headers.get('cache-control'),'no-store');
    });
    for(const body of [{username:'John',password:'wrong'},{username:'Nobody',password:'valid-password'},{username:'',password:'x'},{username:123,password:'x'},null,{username:'x'.repeat(2100),password:'x'}]) await t.test('invalid login '+JSON.stringify(body).slice(0,65),async()=>{
      assert.equal((await login.POST(req(body))).status,401);
    });
    await t.test('ambiguous first name is rejected',async()=>{reset();state.members.push({id:'john2',name:'John Second',role:'editor'});assert.equal((await login.POST(req({username:'John',password:'valid-password'}))).status,401);});
    const payload={sourceId:'test-intake',name:'Test client',person:'',email:'',location:'',phone:'555',offer:'offer',historical:true};
    await t.test('form secret and field validation',async()=>{
      reset(); assert.equal((await form.POST(req(payload,'wrong'))).status,401);
      for(const body of [{...payload,sourceId:''},{...payload,name:7},{...payload,phone:7},{...payload,offer:'x'.repeat(501)}]) assert.equal((await form.POST(req(body,'test-form'))).status,400);
      assert.equal(writes,0);
    });
    await t.test('historical intake retries preserve workflow and manual contacts',async()=>{
      reset(); assert.equal((await form.POST(req(payload,'test-form'))).status,200);
      const c=state.clients.at(-1)!; c.stage='Active';c.email='manual@example.test';const n=state.notifications.length;
      assert.equal((await form.POST(req({...payload,phone:'new'},'test-form'))).status,200);
      assert.equal(state.clients.length,9);assert.equal(state.clients.at(-1)!.stage,'Active');assert.equal(state.clients.at(-1)!.email,'manual@example.test');assert.equal(state.notifications.length,n);
    });
    await t.test('new intake notifies both owners only once',async()=>{
      reset(); for(let i=0;i<2;i++) assert.equal((await form.POST(req({...payload,historical:false},'test-form'))).status,200);
      assert.equal(state.notifications.filter(n=>n.clientId===state.clients.at(-1)!.id).length,2);
    });
    await t.test('cron requires explicit configured secret',async()=>{
      reset();assert.equal((await cron.GET(req(undefined,'wrong'))).status,401);assert.equal((await cron.GET(req(undefined,'test-cron'))).status,200);delete process.env.CRON_SECRET;assert.equal((await cron.GET(req(undefined,'test-cron'))).status,401);
    });
    for(const token of ['john','carl']) await t.test('file access cannot escape assigned clients '+token,async()=>{
      reset();assert.equal((await files.POST(req({type:'sign',clientId:'demo-6',name:'test.mp4',size:10,contentType:'video/mp4'},token))).status,400);
    });
    await t.test('valid upload completes exactly once, then assigned editor can download',async()=>{
      reset();const path='demo-6/test.mp4';storage=[{name:'test.mp4',metadata:{size:10,mimetype:'video/mp4'}}];
      assert.equal((await files.POST(req({type:'sign',clientId:'demo-6',name:'test.mp4',size:10,contentType:'video/mp4'}))).status,200);
      const action={type:'complete',clientId:'demo-6',files:[{path,name:'test.mp4'}]};
      assert.equal((await files.POST(req(action))).status,200);assert.equal(state.clients[6].stage,'Editing');assert.equal(state.tasks.filter(x=>x.clientId==='demo-6').length,1);
      assert.equal((await files.POST(req(action))).status,400);
      assert.equal((await files.POST(req({type:'download',clientId:'demo-6',path},'john'))).status,200);
      assert.equal((await files.POST(req({type:'download',clientId:'demo-6',path:'demo-1/private.mp4'},'john'))).status,400);
    });
    for(const metadata of [{size:0,mimetype:'video/mp4'},{size:52428801,mimetype:'video/mp4'},{size:10,mimetype:'text/html'}]) await t.test('completion validates stored object metadata '+JSON.stringify(metadata),async()=>{
      reset();storage=[{name:'test.mp4',metadata}];assert.equal((await files.POST(req({type:'complete',clientId:'demo-6',files:[{path:'demo-6/test.mp4',name:'test.mp4'}]}))).status,400);assert.equal(writes,0);
    });
    for(const size of [undefined,null,-1,0,'10',50*1024*1024+1]) await t.test('reject invalid upload size '+String(size),async()=>{
      reset();assert.equal((await files.POST(req({type:'sign',clientId:'demo-6',name:'test.mp4',contentType:'video/mp4',size}))).status,400);
    });
    await t.test('reject video type unsupported by bucket',async()=>{reset();assert.equal((await files.POST(req({type:'sign',clientId:'demo-6',name:'test.avi',contentType:'video/avi',size:10}))).status,400);});
    for(const bad of [[],[{path:'demo-1/test.mp4',name:'x'}],[{path:'demo-6/missing.mp4',name:'x'}],[{path:'demo-6/test.mp4'}],[{path:'demo-6/test.mp4',name:'x'},{path:'demo-6/test.mp4',name:'x'}]]) await t.test('reject invalid completion '+JSON.stringify(bad),async()=>{
      reset();storage=[{name:'test.mp4',metadata:{size:10,mimetype:'video/mp4'}}];assert.equal((await files.POST(req({type:'complete',clientId:'demo-6',files:bad}))).status,400);assert.equal(writes,0);
    });
  } finally { globalThis.fetch=originalFetch; process.env=env; }
});
