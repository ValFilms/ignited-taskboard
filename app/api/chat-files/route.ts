import { createHash } from "node:crypto";
import { admin, identity, readState, member, mutate, failure } from "../../../lib/server";
import { transition, visibleState } from "../../../lib/workflow";
import { canReadMessage, conversationMembers, threadKey, type MessageInput } from "../../../lib/messaging";
import { validateAttachment, MAX_ATTACHMENTS, baseType, type Attachment } from "../../../lib/attachments";
const headers = {"Cache-Control": "no-store"};
const uuid = /^[\da-f]{8}-[\da-f]{4}-4[\da-f]{3}-[89ab][\da-f]{3}-[\da-f]{12}$/i;
export async function POST(req: Request) {
  try {
    const id = await identity(req), body = await req.text();
    if (body.length > 32000) throw new Error("Request too large");
    const a = JSON.parse(body), {state} = await readState(), me = member(state, id);
    const storage = admin().storage.from("chat-attachments");
    if (a.type === "download") {
      const message = state.messages?.find(m => m.id === a.messageId && canReadMessage(state, me, m));
      const file = message?.attachments?.find(f => f.path === a.path);
      if (!file) throw new Error("Unauthorized attachment");
      const {data, error} = await storage.createSignedUrl(file.path, 300, a.download ? {download: file.name} : undefined);
      if (error || !data) throw new Error("Could not open attachment");
      return Response.json({url: data.signedUrl}, {headers});
    }
    const input = a.message as MessageInput;
    if (!input || typeof input.id !== "string" || !uuid.test(input.id)) throw new Error("Invalid message ID");
    conversationMembers(state, me, input.target);
    const taskId = input.target.kind === "task" ? input.target.taskId : undefined;
    if (taskId && state.tasks.find(t => t.id === taskId)?.archivedAt) throw new Error("Restore this task before adding attachments");
    const hash = createHash("sha256").update(threadKey(input.target, id)).digest("hex");
    const prefix = `chat/${id}/${hash}/${input.id}`;
    if (a.type === "sign") {
      if (state.messages?.some(m => m.id === input.id)) throw new Error("This message has already been sent");
      validateAttachment(a.file);
      const path = `${prefix}/${crypto.randomUUID()}`;
      const {data, error} = await storage.createSignedUploadUrl(path);
      if (error || !data) throw new Error("Could not prepare attachment upload. An administrator must configure the private chat-attachments bucket with the supported file types.");
      return Response.json({path, token: data.token}, {headers});
    }
    if (a.type !== "complete") throw new Error("Unknown attachment action");
    if (!Array.isArray(input.attachments) || !input.attachments.length || input.attachments.length > MAX_ATTACHMENTS) throw new Error("Choose 1–5 attachments");
    const {data, error} = await storage.list(prefix, {limit: 100});
    if (error || !data) throw new Error("Could not verify uploads");
    const attachments: Attachment[] = input.attachments.map(file => {
      validateAttachment(file);
      if (typeof file.path !== "string" || !file.path.startsWith(prefix + "/") || !uuid.test(file.path.slice(prefix.length + 1))) throw new Error("Unauthorized attachment path");
      const stored = data.find(item => `${prefix}/${item.name}` === file.path);
      if (!stored || Number(stored.metadata?.size) !== file.size || baseType(stored.metadata?.mimetype || "") !== baseType(file.contentType)) throw new Error("Upload has not completed or does not match the file");
      return {path: file.path, name: file.name.trim(), contentType: baseType(file.contentType), size: file.size};
    });
    const next = await mutate(s => transition(s, member(s,id), {type: "sendMessage", message: {...input, attachments}}));
    return Response.json(visibleState(next, member(next,id)), {headers});
  } catch (e) {return failure(e);}
}
