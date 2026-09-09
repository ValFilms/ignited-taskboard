import { test } from 'node:test';
import assert from 'node:assert/strict';
import { POST as password } from '../app/api/password/route';
import { POST as status } from '../app/api/onboarding/route';
import { onboardingComplete, ONBOARDING_VERSION } from '../lib/onboarding';
import { demoState } from '../lib/demo';

test('completion requires the current numeric tutorial version', () => {
  for (const metadata of [undefined, {}, {ignited_onboarding_version:'1'}, {ignited_onboarding_version:0}])
    assert.equal(onboardingComplete(metadata),false);
  assert.equal(onboardingComplete({ignited_onboarding_version:ONBOARDING_VERSION}),true);
});

test('onboarding completion travels with the verified account and password update', async t => {
  const originalFetch=globalThis.fetch, env={...process.env};
  Object.assign(process.env,{NEXT_PUBLIC_SUPABASE_URL:'http://127.0.0.1:9997',NEXT_PUBLIC_SUPABASE_ANON_KEY:'test-public',SUPABASE_SERVICE_ROLE_KEY:'test-private'});
  const state=demoState();
  state.members.forEach((m,i)=>{m.id=`00000000-0000-4000-8000-00000000000${i}`;});
  const accounts=new Map<string,{password:string;metadata:Record<string,unknown>}>([...state.members.map(m=>[m.id,{password:'old-password',metadata:{display_name:m.name}}] as [string,{password:string;metadata:Record<string,unknown>}]),['outsider',{password:'old-password',metadata:{}}]]);
  const first=state.members[0].id;
  const user=(id:string)=>({id,email:id+'@example.test',aud:'authenticated',role:'authenticated',created_at:new Date().toISOString(),user_metadata:accounts.get(id)?.metadata});
  let writes=0, logins=0, rejectUpdate=false;
  globalThis.fetch=async(input,init)=>{
    const url=new URL(typeof input==='string'?input:input instanceof URL?input.href:input.url);
    assert.equal(url.origin,'http://127.0.0.1:9997','Tests must not reach real accounts');
    const headers=new Headers(init?.headers), token=headers.get('authorization')?.replace('Bearer ','')||'';
    const body=init?.body?JSON.parse(String(init.body)):{};
    if(url.pathname==='/auth/v1/user'&&init?.method==='PUT'){
      writes++;
      assert.equal(headers.get('apikey'),'test-public');
      assert(token.startsWith('fresh-'),'Must reauthenticate before password/completion update');
      const id=token.slice(6), account=accounts.get(id)!;
      assert.equal(body.current_password,account.password);
      if(body.data) assert.deepEqual(body.data,{ignited_onboarding_version:ONBOARDING_VERSION});
      if(rejectUpdate) return Response.json({code:'weak_password',msg:'Private provider detail'},{status:422});
      account.password=body.password;
      account.metadata={...account.metadata,...body.data};
      return Response.json(user(id));
    }
    if(url.pathname==='/auth/v1/user') return accounts.has(token)?Response.json(user(token)):Response.json({msg:'Invalid JWT'},{status:401});
    if(url.pathname==='/rest/v1/workspace') {assert.equal(init?.method,'GET','Onboarding never writes client data');return Response.json({data:state,version:1});}
    if(url.pathname==='/auth/v1/token'){
      logins++;const id=body.email.split('@')[0];
      if(accounts.get(id)?.password!==body.password) return Response.json({msg:'Invalid credentials'},{status:400});
      return Response.json({access_token:'fresh-'+id,refresh_token:'refresh-'+id,expires_in:3600,token_type:'bearer',user:user(id)});
    }
    throw new Error('Unexpected transport request: '+url.pathname);
  };
  const req=(body:unknown={},id=first)=>new Request('http://localhost/api/onboarding',{method:'POST',headers:{Authorization:'Bearer '+id,'Content-Type':'application/json'},body:JSON.stringify(body)});
  const values={currentPassword:'old-password',newPassword:'my new passphrase',confirmPassword:'my new passphrase',finishOnboarding:true};
  try {
    await t.test('first visit is incomplete and status cannot be used to forge completion',async()=>{
      const before=writes;
      const response=await status(req({completed:true,userId:'outsider',ignited_onboarding_version:1}));
      assert.equal(response.status,200);assert.equal(response.headers.get('cache-control'),'no-store');
      assert.deepEqual(await response.json(),{completed:false});assert.equal(writes,before);
    });
    await t.test('status rejects missing, expired and non-team sessions',async()=>{
      for(const id of ['', 'expired', 'outsider']) assert.notEqual((await status(req({},id))).status,200);
    });
    await t.test('invalid flags fail before reauthentication',async()=>{
      const before=logins;
      for(const flag of ['true',1,null,{}]) assert.equal((await password(req({...values,finishOnboarding:flag}))).status,400);
      assert.equal(logins,before);assert.equal(writes,0);
    });
    await t.test('wrong current password never completes the tutorial',async()=>{
      assert.equal((await password(req({...values,currentPassword:'wrong'}))).status,400);
      assert.equal(writes,0);assert.equal(onboardingComplete(accounts.get(first)!.metadata),false);
    });
    await t.test('provider rejection leaves both password and completion unchanged',async()=>{
      rejectUpdate=true;
      const response=await password(req(values));
      assert.equal(response.status,400);assert(!JSON.stringify(await response.json()).includes('Private provider'));
      assert.equal(accounts.get(first)!.password,'old-password');assert.equal(onboardingComplete(accounts.get(first)!.metadata),false);
      rejectUpdate=false;
    });
    for(const {id,name} of state.members) await t.test('own completion is durable across independent status requests: '+name,async()=>{
      const before=writes;
      const response=await password(req({...values,userId:'outsider',data:{display_name:'forged',ignited_onboarding_version:99}},id));
      assert.equal(response.status,200);assert.equal(writes,before+1,'One provider update for password and metadata');
      assert.equal((await response.json()).onboardingCompleted,true);
      assert.equal(accounts.get(id)!.password,values.newPassword);
      assert.deepEqual(accounts.get(id)!.metadata,{display_name:name,ignited_onboarding_version:ONBOARDING_VERSION});
      assert.deepEqual(await (await status(req({},id))).json(),{completed:true});
      assert.equal(onboardingComplete(accounts.get('outsider')!.metadata),false);
    });
    await t.test('later ordinary password changes preserve tutorial completion',async()=>{
      const response=await password(req({currentPassword:values.newPassword,newPassword:'another passphrase',confirmPassword:'another passphrase'}));
      assert.equal(response.status,200);assert.equal((await response.json()).onboardingCompleted,undefined);
      assert.deepEqual(await (await status(req())).json(),{completed:true});
    });
  } finally {globalThis.fetch=originalFetch;for(const key of Object.keys(process.env)) if(!(key in env)) delete process.env[key];Object.assign(process.env,env);}
});
