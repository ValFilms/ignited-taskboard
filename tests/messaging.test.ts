import { test } from "node:test";
import assert from "node:assert/strict";
import { demoState } from "../lib/demo";
import { transition, visibleState, type State } from "../lib/workflow";
import { threadKey, type MessageTarget } from "../lib/messaging";

const now = Date.parse("2026-09-08T12:00:00Z");
function send(s: State, sender: string, target: MessageTarget, body = "Test message", id = crypto.randomUUID()) {
  return transition(s, s.members.find(m => m.id === sender)!, {type: "sendMessage", message: {id, target, body}}, now);
}
function view(s: State, id: string) { return visibleState(s, s.members.find(m => m.id === id)!); }
function taskState() {
  let s = demoState();
  s = transition(s, s.members.find(m => m.id === "john")!, {type: "createTask", task: {title: "Refilm opening", assignee: "carl"}}, now);
  return {s, task: s.tasks.find(t => t.title === "Refilm opening")!};
}
test("legacy workspaces work without message storage", () => {
  const s = demoState(); assert.equal(s.messages, undefined); assert.equal(view(s, "john").messages, undefined);
  assert.equal(send(s, "john", {kind: "team"}).messages?.length, 1); assert.equal(s.messages, undefined);
});
test("all four roles can send and read team chat with server-derived authors and times", () => {
  let s = demoState();
  for (const member of s.members) s = send(s, member.id, {kind: "team"});
  for (const member of s.members) {
    assert.equal(view(s, member.id).messages?.length, 4);
    assert.equal(view(s, member.id).notifications.filter(n => n.messageId).length, 3);
  }
  assert(s.messages?.every(m => m.createdAt === new Date(now).toISOString()));
});
test("private conversation excludes unrelated owners and staff, including notices", () => {
  let s = send(demoState(), "john", {kind: "direct", memberId: "carl"}, "Private test");
  s = send(s, "carl", {kind: "direct", memberId: "john"}, "Private reply");
  assert.equal(s.messages?.[0].threadId, s.messages?.[1].threadId);
  for (const id of ["owner", "yaniv"]) {assert.deepEqual(view(s,id).messages, []); assert.equal(view(s,id).notifications.filter(n=>n.messageId).length, 0);}
  for (const id of ["john", "carl"]) {assert.equal(view(s,id).messages?.length, 2); assert.equal(view(s,id).notifications.filter(n=>n.messageId).length, 1);}
});
test("private recipient must be another current teammate", () => {
  for (const id of ["john", "unknown", ""]) assert.throws(() => send(demoState(), "john", {kind:"direct",memberId:id}), /another team member/);
});
test("mentions match names case-insensitively and do not duplicate alerts", () => {
  const s = send(demoState(), "john", {kind:"team"}, "@Karl, @karl please check this. @Yaniv?");
  assert.equal(view(s,"carl").notifications.filter(n=>n.messageId).length,1);
  assert.match(view(s,"carl").notifications.find(n=>n.messageId)!.text,/mentioned you/);
  assert.match(view(s,"yaniv").notifications.find(n=>n.messageId)!.text,/mentioned you/);
  assert.equal(view(s,"john").notifications.filter(n=>n.messageId).length,0);
});
test("email and partial names do not accidentally mention teammates", () => {
  const s = send(demoState(), "john", {kind:"team"}, "email@Karl.com @Karlton @Yaniv_other");
  assert(s.notifications.filter(n=>n.messageId).every(n=>!n.text.includes("mentioned")));
});
test("task comments notify owners, creator, assignee and remain available after completion", () => {
  const {s, task} = taskState();
  const next = send(s,"carl",{kind:"task",taskId:task.id},"@John ready for review");
  assert.equal(next.notifications.filter(n=>n.messageId).length,3);
  for(const m of next.members) assert.equal(view(next,m.id).messages?.length,1);
  const done = transition(next,next.members.find(m=>m.id==="carl")!,{type:"completeTask",taskId:task.id},now);
  assert.equal(send(done,"john",{kind:"task",taskId:task.id},"Thanks").messages?.length,2);
});
test("unrelated staff cannot read or post task comments", () => {
  const {s,task}=taskState(); s.members.push({id:"other",name:"Other",role:"editor"});
  const next=send(s,"john",{kind:"task",taskId:task.id});
  assert.deepEqual(view(next,"other").messages,[]);
  assert.throws(()=>send(next,"other",{kind:"task",taskId:task.id}),/Unauthorized/);
  assert.throws(()=>send(next,"john",{kind:"task",taskId:"missing"}),/Unauthorized/);
});
test("reassignment revokes old assignee comments and old comment notifications", () => {
  const {s,task}=taskState(); s.members.push({id:"other",name:"Other",role:"editor"});
  const next=send(s,"john",{kind:"task",taskId:task.id});
  const reassigned=transition(next,next.members[0],{type:"reassignTask",taskId:task.id,value:"other"},now);
  assert.deepEqual(view(reassigned,"carl").messages,[]);
  assert.equal(view(reassigned,"carl").notifications.filter(n=>n.messageId).length,0);
  assert.equal(view(reassigned,"other").messages?.length,1);
  assert.throws(()=>send(reassigned,"carl",{kind:"task",taskId:task.id}),/Unauthorized/);
});
test("mention cannot grant task or private conversation access", () => {
  const {s,task}=taskState();s.members.push({id:"other",name:"Other",role:"editor"});
  assert.throws(()=>send(s,"john",{kind:"task",taskId:task.id},"@Other please help"),/cannot access/);
  assert.throws(()=>send(s,"john",{kind:"direct",memberId:"carl"},"@Yaniv please help"),/cannot access/);
  assert.equal(s.messages,undefined);
});
test("retries are idempotent and conflicting IDs are rejected", () => {
  const id=crypto.randomUUID();const s=send(demoState(),"john",{kind:"team"},"Test",id);
  assert.deepEqual(send(s,"john",{kind:"team"}," Test ",id),s);
  assert.throws(()=>send(s,"john",{kind:"team"},"Changed",id),/already used/);
  assert.throws(()=>send(s,"carl",{kind:"team"},"Test",id),/already used/);
  assert.throws(()=>send(s,"john",{kind:"direct",memberId:"carl"},"Test",id),/already used/);
});
test("blank, oversized and malformed message requests fail without mutation", () => {
  const s=demoState();
  for(const message of [undefined,null,{}, {id:crypto.randomUUID(),body:" "}, {id:crypto.randomUUID(),body:123}, {id:"bad",body:"Test"}, {id:crypto.randomUUID(),body:"x".repeat(4001),target:{kind:"team"}}, {id:crypto.randomUUID(),body:"Test",target:{kind:"invalid"}}]) {
    assert.throws(()=>transition(s,s.members[0],{type:"sendMessage",message:message as any},now));
  }
  assert.equal(s.messages,undefined);
});
test("plain text preserves markup and newlines as data", () => {
  const body='<script>alert("test")</script>\n'+"x".repeat(3900);
  assert.equal(send(demoState(),"john",{kind:"team"},body).messages?.[0].body,body);
});
test("read conversation marks only own visible notices through the displayed message", () => {
  let s=send(demoState(),"john",{kind:"team"});const end=s.messages![0].id;
  s=send(s,"john",{kind:"team"},"Later");s=send(s,"john",{kind:"direct",memberId:"carl"});
  const next=transition(s,s.members.find(m=>m.id==="carl")!,{type:"readConversation",key:"team",value:end},now);
  assert.equal(next.notifications.filter(n=>n.messageId&&n.read).length,1);
  assert.equal(next.notifications.find(n=>n.userId==="carl"&&n.messageId===end)!.read,true);
  assert.throws(()=>transition(s,s.members[0],{type:"readConversation",key:threadKey({kind:"direct",memberId:"carl"},"john"),value:s.messages!.at(-1)!.id},now),/no longer available/);
});
test("automated edit, campaign and update tasks support comments with the same access rules", () => {
  for(const kind of ["edit","campaign","update"] as const) {
    const s=demoState(); s.tasks=[{id:"auto",clientId:s.clients[0].id,title:"Automated",kind,assignee:"john",status:"done",createdAt:new Date(now).toISOString(),dueAt:null,cycle:1}];
    const next=send(s,"john",{kind:"task",taskId:"auto"});
    assert.equal(view(next,"john").messages?.length,1);assert.deepEqual(view(next,"carl").messages,[]);
  }
});
