import { test } from "node:test";
import assert from "node:assert/strict";
import { demoState } from "../lib/demo";
import { transition } from "../lib/workflow";
import * as api from "../app/api/chat-files/route";
import * as workspace from "../app/api/workspace/route";
test("Chat media verifies stored uploads, identity, conversation access and retry behavior", async t => {
  const env={...process.env}, original=globalThis.fetch;
  Object.assign(process.env,{NEXT_PUBLIC_SUPABASE_URL:"http://127.0.0.1:9999",SUPABASE_SERVICE_ROLE_KEY:"test-private"});
  let state=demoState(), version=1, writes=0, objects: any[]=[], onConflict:(()=>void)|undefined;
  globalThis.fetch=async (input, init) => {
    const url=new URL(typeof input==="string"?input:input instanceof URL?input.href:input.url);
    assert.equal(url.origin,"http://127.0.0.1:9999");
    const headers=new Headers(init?.headers), body=init?.body?JSON.parse(String(init.body)):{};
    if(url.pathname==="/auth/v1/user") {const id=headers.get("authorization")?.replace("Bearer ",""); return id && state.members.some(m=>m.id===id)?Response.json({id}):Response.json({message:"bad token"},{status:401});}
    if(url.pathname==="/rest/v1/workspace") {
      if(init?.method==="PATCH") {writes++; if(onConflict){const change=onConflict;onConflict=undefined;change();version++;return Response.json([]);} assert.equal(url.searchParams.get("version"),"eq."+version);state=body.data;version=body.version;return Response.json([{version}]);}
      return Response.json({data:state,version});
    }
    if(url.pathname==="/storage/v1/object/list/chat-attachments") return Response.json(objects);
    if(url.pathname.startsWith("/storage/v1/object/upload/sign/chat-attachments/")) return Response.json({url:"/object/upload/sign/chat-attachments/test?token=test-upload"});
    if(url.pathname.startsWith("/storage/v1/object/sign/chat-attachments/")) return Response.json({signedURL:"/object/sign/chat-attachments/test?token=test-download"});
    throw Error("Unexpected request "+url.pathname);
  };
  const req=(body: unknown, actor="john")=>new Request("http://localhost/api/chat-files",{method:"POST",headers:{Authorization:"Bearer "+actor},body:JSON.stringify(body)});
  const input={id:crypto.randomUUID(),body:"",target:{kind:"direct" as const,memberId:"carl"}};
  const file={name:"Voice memo.m4a",contentType:"audio/mp4",size:120};
  try {
    await t.test("unsigned requests and unsupported content cannot upload",async()=>{
      assert.equal((await api.POST(req({type:"sign",message:input,file},""))).status,401);
      for(const bad of [{...file,size:0},{...file,size:52428801},{...file,contentType:"text/html"},{...file,contentType:"image/svg+xml"}]) assert.equal((await api.POST(req({type:"sign",message:input,file:bad}))).status,400);
      assert.equal(writes,0);
    });
    const signed=await (await api.POST(req({type:"sign",message:input,file}))).json(); assert(signed.path.startsWith("chat/john/"));
    const attachment={...file,path:signed.path}, message={...input,attachments:[attachment]};
    await t.test("unverified and spoofed attachment paths cannot reach messages",async()=>{
      assert.equal((await workspace.POST(req({type:"sendMessage",message}))).status,400);
      assert.equal((await api.POST(req({type:"complete",message}))).status,400);
      objects=[{name:signed.path.split("/").at(-1),metadata:{size:119,mimetype:"audio/mp4"}}];
      assert.equal((await api.POST(req({type:"complete",message}))).status,400);
      objects[0].metadata.size=120;
      assert.equal((await api.POST(req({type:"complete",message:{...message,attachments:[{...attachment,path:attachment.path.replace("john","carl")}]}}))).status,403);
      assert.equal((await api.POST(req({type:"complete",message:{...message,target:{kind:"team"}}}))).status,403);
      assert.equal(writes,0);
    });
    await t.test("verified audio sends without text and retries do not duplicate messages or notices",async()=>{
      assert.equal((await api.POST(req({type:"complete",message}))).status,200); const notices=state.notifications.length;
      assert.equal(state.messages!.at(-1)!.attachments![0].contentType,"audio/mp4");
      assert.equal((await api.POST(req({type:"complete",message}))).status,200);
      assert.equal(state.messages!.filter(m=>m.id===input.id).length,1); assert.equal(state.notifications.length,notices);
      assert.equal((await api.POST(req({type:"complete",message:{...message,body:"different"}}))).status,400);
    });
    await t.test("only direct-message participants can open files, including against an owner",async()=>{
      for(const actor of ["john","carl"]) assert.equal((await api.POST(req({type:"download",messageId:input.id,path:attachment.path},actor))).status,200);
      for(const actor of ["owner","yaniv"]) assert.equal((await api.POST(req({type:"download",messageId:input.id,path:attachment.path},actor))).status,403);
    });
    await t.test("task reassignment during upload/save revokes the old assignee's access",async()=>{
      state=transition(state,state.members[0],{type:"createTask",task:{title:"File task",assignee:"john"}});
      const task=state.tasks.at(-1)!, input2={id:crypto.randomUUID(),body:"",target:{kind:"task",taskId:task.id}};
      const signed2=await (await api.POST(req({type:"sign",message:input2,file}))).json();
      objects=[{name:signed2.path.split("/").at(-1),metadata:{size:120,mimetype:"audio/mp4"}}];
      onConflict=()=>{state.tasks.find(t=>t.id===task.id)!.assignee="carl";};
      assert.equal((await api.POST(req({type:"complete",message:{...input2,attachments:[{...file,path:signed2.path}]}}))).status,403);
      assert(!state.messages!.some(m=>m.id===input2.id));
    });
  } finally {globalThis.fetch=original;process.env=env;}
});
