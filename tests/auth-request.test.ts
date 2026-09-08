import { test } from 'node:test';
import assert from 'node:assert/strict';
import { authenticatedRequest } from '../lib/auth-request';
test('session recovery retries once with a renewed token', async()=>{
  const original=globalThis.fetch;const tokens:string[]=[];let expired=false;
  globalThis.fetch=async (_url,init)=>{tokens.push(new Headers(init?.headers).get('authorization')!);return tokens.length===1?Response.json({error:'Sign in required'},{status:401}):Response.json({ok:true});};
  try {assert.deepEqual(await authenticatedRequest('/api/workspace',{type:'refresh'},'old',async()=>'new',()=>{expired=true;}),{ok:true});assert.deepEqual(tokens,['Bearer old','Bearer new']);assert.equal(expired,false);} finally {globalThis.fetch=original;}
});
test('revoked session returns to sign-in without retry loops',async()=>{
  const original=globalThis.fetch;let calls=0,expired=0;
  globalThis.fetch=async()=>{calls++;return Response.json({error:'Sign in required'},{status:401});};
  try {await assert.rejects(()=>authenticatedRequest('/api/workspace',{},'old',async()=>'revoked',()=>{expired++;}),/session expired/);assert.equal(calls,2);assert.equal(expired,1);}finally{globalThis.fetch=original;}
});
test('failed refresh expires session; forbidden actions never refresh or replay',async()=>{
  const original=globalThis.fetch;let status=401,calls=0,refreshes=0,expired=0;
  globalThis.fetch=async()=>{calls++;return Response.json({error:'Owners only'},{status});};
  const refresh=async()=>{refreshes++;return null;};
  try {await assert.rejects(()=>authenticatedRequest('/api/workspace',{},'old',refresh,()=>{expired++;}),/session expired/);status=403;await assert.rejects(()=>authenticatedRequest('/api/workspace',{},'valid',refresh,()=>{expired++;}),/Owners only/);assert.equal(calls,2);assert.equal(refreshes,1);assert.equal(expired,1);}finally{globalThis.fetch=original;}
});
