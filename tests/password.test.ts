import { test } from 'node:test';
import assert from 'node:assert/strict';
import { POST } from '../app/api/password/route';
import * as login from '../app/api/login/route';
import { passwordChange } from '../lib/password';
import { demoState } from '../lib/demo';

test('password validation rejects invalid input without trimming passphrases', () => {
  for (const value of [null, {}, {currentPassword:3}, {currentPassword:'old',newPassword:'short',confirmPassword:'short'},
    {currentPassword:'old',newPassword:'long-enough',confirmPassword:'different'},
    {currentPassword:'unchanged',newPassword:'unchanged',confirmPassword:'unchanged'},
    {currentPassword:'old',newPassword:'x'.repeat(257),confirmPassword:'x'.repeat(257)}])
    assert.throws(() => passwordChange(value));
  assert.equal(passwordChange({currentPassword:' old ',newPassword:' new passphrase ',confirmPassword:' new passphrase '}).newPassword,' new passphrase ');
});

test('personal password changes use isolated Supabase authentication', async t => {
  const originalFetch = globalThis.fetch, env = {...process.env};
  Object.assign(process.env,{NEXT_PUBLIC_SUPABASE_URL:'http://127.0.0.1:9999',NEXT_PUBLIC_SUPABASE_ANON_KEY:'test-public',SUPABASE_SERVICE_ROLE_KEY:'test-private'});
  const state = demoState();
  state.members.forEach((m,i)=>{m.id=`00000000-0000-4000-8000-00000000000${i}`;});
  const ownerId=state.members[0].id;
  const passwords = new Map([...state.members.map(m=>[m.id,'old-password'] as const),['outsider','old-password']]);
  let updates=0, logins=0, rejectedCode='', wrongIdentity=false;
  const user=(id:string)=>({id,email:id+'@example.test',aud:'authenticated',role:'authenticated',created_at:new Date().toISOString()});
  globalThis.fetch=async(input,init)=>{
    const url=new URL(typeof input==='string'?input:input instanceof URL?input.href:input.url);
    assert.equal(url.origin,'http://127.0.0.1:9999','Never call real auth from regression tests');
    const headers=new Headers(init?.headers), token=headers.get('authorization')?.replace('Bearer ','')||'';
    const body=init?.body?JSON.parse(String(init.body)):{};
    if(url.pathname==='/auth/v1/user'&&init?.method==='PUT'){
      updates++;
      assert.equal(headers.get('apikey'),'test-public','Password update must not use an administrator credential');
      assert(token.startsWith('fresh-'),'Password update must use the reauthenticated session');
      assert.deepEqual(Object.keys(body).filter(k=>body[k]!==null).sort(),['current_password','password']);
      if(rejectedCode) return Response.json({code:rejectedCode,msg:'Provider detail must not leak'},{status:422});
      const id=token.slice(6); assert.equal(body.current_password,passwords.get(id));
      passwords.set(id,body.password); return Response.json(user(id));
    }
    if(url.pathname==='/auth/v1/user') return passwords.has(token)?Response.json(user(token)):Response.json({msg:'Invalid JWT'},{status:401});
    if(url.pathname==='/rest/v1/workspace') {assert.notEqual(init?.method,'PATCH');return Response.json({data:state,version:1});}
    if(url.pathname.startsWith('/auth/v1/admin/users/')) return Response.json({user:user(url.pathname.split('/').at(-1)!)});
    if(url.pathname==='/auth/v1/token'){
      logins++; const id=body.email.split('@')[0];
      if(passwords.get(id)!==body.password) return Response.json({msg:'Invalid credentials'},{status:400});
      return Response.json({access_token:'fresh-'+id,refresh_token:'refresh-'+id,token_type:'bearer',expires_in:3600,user:user(wrongIdentity?'other':id)});
    }
    throw new Error('Unexpected transport request: '+url.pathname);
  };
  const values={currentPassword:'old-password',newPassword:'my own passphrase',confirmPassword:'my own passphrase'};
  const req=(body:unknown=values,token=ownerId)=>new Request('http://localhost/api/password',{method:'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},body:JSON.stringify(body)});
  try {
    for(const {id,name} of state.members) await t.test('only own password changes; name login uses new password: '+name,async()=>{
      const response=await POST(req({...values,userId:'outsider',email:'outsider@example.test'},id));
      assert.equal(response.status,200);assert.equal(response.headers.get('cache-control'),'no-store');
      assert.deepEqual(await response.json(),{access_token:'fresh-'+id,refresh_token:'refresh-'+id});
      assert.equal(passwords.get('outsider'),'old-password');
      const username=state.members.find(m=>m.id===id)!.name;
      assert.equal((await login.POST(req({username,password:'old-password'},id))).status,401);
      assert.equal((await login.POST(req({username,password:values.newPassword},id))).status,200);
    });
    await t.test('missing/expired sessions and non-members cannot change passwords',async()=>{
      const before=updates;
      for(const [id,status] of [['',401],['expired',401],['outsider',403]] as const) assert.equal((await POST(req(values,id))).status,status);
      assert.equal(updates,before);
    });
    await t.test('wrong current password does not expire the browser session or update the account',async()=>{
      const before=updates;const response=await POST(req(values));
      assert.equal(response.status,400);assert.match((await response.json()).error,/current password/);assert.equal(updates,before);
    });
    await t.test('malformed and invalid input is rejected before reauthentication',async()=>{
      const before=logins;
      for(const body of [null,{}, {...values,confirmPassword:'mismatch'},{...values,newPassword:'short'}, {...values,currentPassword:'x'.repeat(4100)}]) assert.equal((await POST(req(body))).status,400);
      const malformed=new Request('http://localhost/api/password',{method:'POST',headers:{Authorization:'Bearer '+ownerId},body:'{'});
      assert.equal((await POST(malformed)).status,400); assert.equal(logins,before);
    });
    await t.test('reauthenticated identity must match the requesting account',async()=>{
      const before=updates;wrongIdentity=true;
      assert.equal((await POST(req({...values,currentPassword:values.newPassword,newPassword:'another passphrase',confirmPassword:'another passphrase'}))).status,400);
      assert.equal(updates,before);wrongIdentity=false;
    });
    await t.test('provider failures are honest, do not leak details, and leave the password unchanged',async()=>{
      for(const code of ['weak_password','same_password','unexpected_failure']){
        rejectedCode=code;
        const response=await POST(req({...values,currentPassword:values.newPassword,newPassword:'another passphrase',confirmPassword:'another passphrase'}));
        assert.equal(response.status,400);assert.equal(response.headers.get('cache-control'),'no-store');
        assert(!JSON.stringify(await response.json()).includes('Provider detail'));assert.equal(passwords.get(ownerId),values.newPassword);
      }
    });
  } finally {globalThis.fetch=originalFetch; for(const key of Object.keys(process.env)) if(!(key in env)) delete process.env[key];Object.assign(process.env,env);}
});
