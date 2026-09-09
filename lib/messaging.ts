import type { Member, State, Task } from "./workflow";

export type MessageTarget = { kind: "team" } | { kind: "direct"; memberId: string } | { kind: "task"; taskId: string };
export type Message = { id: string; senderId: string; body: string; createdAt: string; threadId: string; target: MessageTarget };
export type MessageInput = { id: string; body: string; target: MessageTarget };
export const canDiscuss = (task: Task, member: Member) => member.role === "approver" || member.role === "manager" || task.assignee === member.id || task.createdBy === member.id;
export function threadKey(target: MessageTarget, senderId: string): string {
  if (target.kind === "team") return "team";
  if (target.kind === "direct") return `dm:${[senderId, target.memberId].sort().join(":")}`;
  return `task:${target.taskId}`;
}
export function canReadMessage(state: State, member: Member, message: Message): boolean {
  if (!state.members.some(m => m.id === member.id)) return false;
  const target = message.target;
  if (target.kind === "team") return true;
  if (target.kind === "direct") return message.senderId === member.id || target.memberId === member.id;
  const task = state.tasks.find(t => t.id === target.taskId);
  return !!task && canDiscuss(task, member);
}
export function conversationMembers(state: State, member: Member, target: MessageTarget): Member[] {
  if (!target || typeof target !== "object") throw new Error("Choose a conversation");
  if (target.kind === "team") return state.members;
  if (target.kind === "direct") {
    const recipient = state.members.find(m => m.id === target.memberId && m.id !== member.id);
    if (!recipient) throw new Error("Choose another team member");
    return [member, recipient];
  }
  if (target.kind === "task") {
    const task = state.tasks.find(t => t.id === target.taskId);
    if (!task || !canDiscuss(task, member)) throw new Error("Unauthorized task conversation");
    return state.members.filter(m => canDiscuss(task, m));
  }
  throw new Error("Choose a conversation");
}
export const mentionName = (member: Member) => member.name.trim().split(/\s+/)[0];
export function sendMessage(state: State, member: Member, input: MessageInput | undefined, now: number) {
  if (!input || typeof input.id !== "string" || !/^[\da-f]{8}-[\da-f]{4}-4[\da-f]{3}-[89ab][\da-f]{3}-[\da-f]{12}$/i.test(input.id)) throw new Error("Invalid message ID");
  if (typeof input.body !== "string" || !input.body.trim() || input.body.length > 4000) throw new Error("Enter a message of up to 4,000 characters");
  const recipients = conversationMembers(state, member, input.target);
  const taskId = input.target.kind === "task" ? input.target.taskId : undefined;
  if (taskId && state.tasks.find(t => t.id === taskId)?.archivedAt) throw new Error("Restore this task from Archive before adding comments");
  const target: MessageTarget = input.target.kind === "team" ? {kind: "team"} : input.target.kind === "direct" ? {kind: "direct", memberId: input.target.memberId} : {kind: "task", taskId: input.target.taskId};
  const body = input.body.trim(), threadId = threadKey(target, member.id);
  const existing = state.messages?.find(m => m.id === input.id);
  if (existing) {
    if (existing.senderId !== member.id || existing.threadId !== threadId || existing.body !== body) throw new Error("Message ID already used");
    return;
  }
  const handles = new Set(Array.from(body.matchAll(/(?:^|[^\p{L}\p{N}_])@([\p{L}\p{N}_-]+)/gu), match => match[1].toLowerCase()));
  const mentioned = state.members.filter(m => handles.has(mentionName(m).toLowerCase()));
  if (mentioned.some(m => !recipients.some(r => r.id === m.id))) throw new Error("That teammate cannot access this conversation. Assign the task to them or use team chat.");
  const createdAt = new Date(now).toISOString();
  const message: Message = {id: input.id, senderId: member.id, body, target, threadId, createdAt};
  (state.messages ||= []).push(message);
  const task = target.kind === "task" ? state.tasks.find(t => t.id === target.taskId) : undefined;
  for (const recipient of recipients.filter(m => m.id !== member.id)) {
    const context = task ? ` on ${task.title}` : target.kind === "team" ? " in team chat" : " in a private message";
    const text = mentioned.some(m => m.id === recipient.id) ? `${member.name} mentioned you${context}` : target.kind === "direct" ? `${member.name} sent you a private message` : `${member.name} ${task ? "commented" : "sent a message"}${context}`;
    state.notifications.push({id: `message:${message.id}:${recipient.id}`, userId: recipient.id, clientId: task?.clientId || "", taskId: task?.id, messageId: message.id, threadId, text, createdAt, read: false});
  }
}
