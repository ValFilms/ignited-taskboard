"use client";
import { useEffect, useRef, useState } from "react";
import { ArrowLeft, AtSign, MessageCircle, Search, Send, Users } from "lucide-react";
import type { Action, Member, State } from "../lib/workflow";
import { conversationMembers, mentionName, threadKey, type MessageTarget } from "../lib/messaging";
import { AttachmentView, MediaPicker, type ChatFiles } from "./chat-media";
import Dialog from "./dialog";

type Props = { state: State; me: Member; act: (action: Action) => Promise<boolean>; error?: string; media?: ChatFiles };
export function Conversation({ state, me, target, act, error, media, drafts, fileDrafts }: Props & { target: MessageTarget; drafts?: {current: Record<string, string>}; fileDrafts?: {current: Record<string, File[]>} }) {
  const thread = threadKey(target, me.id);
  const [body, setBody] = useState(drafts?.current[thread] || "");
  const [files, setFiles] = useState<File[]>(fileDrafts?.current[thread] || []);
  const [recording, setRecording] = useState(false);
  const changeFiles = (next: File[]) => {setFiles(next); if (fileDrafts) fileDrafts.current[thread]=next;};
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const [limit, setLimit] = useState(50);
  const [mentionOpen, setMentionOpen] = useState(false);
  const pending = useRef<{id: string; body: string; files: File[]} | null>(null);
  const sending = useRef(false);
  const textarea = useRef<HTMLTextAreaElement>(null);
  const history = useRef<HTMLDivElement>(null);
  const nearBottom = useRef(true);
  const reading = useRef(false);
  const action = useRef(act); action.current = act;
  useEffect(() => {
    if (drafts) drafts.current[thread] = body;
    const el = textarea.current;
    if (el) {el.style.height = "46px"; el.style.height = `${Math.min(el.scrollHeight,160)}px`;}
  }, [body, drafts, thread]);
  const messages = (state.messages || []).filter(m => m.threadId === thread);
  const archived = target.kind === "task" && !!state.tasks.find(t => t.id === target.taskId)?.archivedAt;
  const unread = state.notifications.filter(n => n.threadId === thread && !n.read);
  const lastId = messages.at(-1)?.id;
  const markRead = () => {
    if (reading.current || !unread.length || !lastId || document.visibilityState !== "visible" || !history.current?.getClientRects().length || !nearBottom.current) return;
    reading.current = true;
    void action.current({type: "readConversation", key: thread, value: lastId}).finally(() => {reading.current = false;});
  };
  useEffect(() => {
    if (nearBottom.current && history.current) history.current.scrollTop = history.current.scrollHeight;
    markRead();
    const visible = () => markRead();
    document.addEventListener("visibilitychange", visible);
    return () => document.removeEventListener("visibilitychange", visible);
    // Only new messages/unread changes should scroll or mark the visible thread read.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lastId, unread.length, thread]);
  let members: Member[];
  try { members = conversationMembers(state, me, target); }
  catch { return <p role="status">This conversation is no longer available to your account.</p>; }
  const send = async () => {
    if (sending.current || (!body.trim() && !files.length) || archived || recording) return;
    sending.current = true; setBusy(true); setFailed(false);
    if (pending.current?.body !== body || pending.current?.files !== files) pending.current = {id: crypto.randomUUID(), body, files};
    try {
      nearBottom.current = true;
      const message = {id: pending.current!.id, body, target};
      if (files.length ? media && await media.send(message, files) : await act({type: "sendMessage", message})) { setBody(""); if (drafts && drafts.current[thread] === body) drafts.current[thread] = ""; changeFiles([]); pending.current = null; textarea.current?.focus({preventScroll:true}); }
      else setFailed(true);
    } finally { sending.current = false; setBusy(false); }
  };
  return <section className="conversation" aria-label={target.kind === "task" ? "Task comments" : "Messages"}>
    <div className="message-history" ref={history} role="region" aria-label="Message history" tabIndex={0} onScroll={() => {
      const el = history.current!; nearBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 60; markRead();
    }}>
      {messages.length > limit && <button className="secondary" onClick={() => setLimit(limit + 50)}>Show earlier messages</button>}
      {!messages.length && <div className="chat-empty"><MessageCircle size={32} /><p>{target.kind === "task" ? "Ask a question or leave an update." : "Say hello"}</p><small>{target.kind === "task" ? "Keep the details with the task." : "Send a message to start the conversation."}</small></div>}
      {messages.slice(-limit).map(message => <article className={`chat-message ${message.senderId === me.id ? "mine" : ""}`} key={message.id}>
        {message.senderId !== me.id && <strong className="message-sender">{state.members.find(m => m.id === message.senderId)?.name || "Former teammate"}</strong>}
        <p>{message.body}</p>{message.attachments?.map(file => <AttachmentView key={file.path} messageId={message.id} file={file} media={media}/>)}
        <time dateTime={message.createdAt} title={new Date(message.createdAt).toLocaleString()}>{new Date(message.createdAt).toLocaleString(undefined, {month: "short", day: "numeric", hour: "numeric", minute: "2-digit"})}</time>
      </article>)}
    </div>
    {archived ? <p className="muted archive-comment-note">Comments are saved. Restore the task to continue the conversation.</p> : <form className="message-composer" onSubmit={e => {e.preventDefault(); void send();}}>
      <MediaPicker files={files} onChange={changeFiles} busy={busy} onRecording={setRecording}/>
      {mentionOpen && <div className="mention-options" aria-label="Mention a teammate">{members.filter(m => m.id !== me.id).map(m => <button type="button" key={m.id} disabled={busy} onClick={() => {
        setBody(old => `${old}${old && !/\s$/.test(old) ? " " : ""}@${mentionName(m)} `.slice(0,4000)); setMentionOpen(false); textarea.current?.focus();
      }}>@{mentionName(m)}</button>)}</div>}
      <div className="composer-row"><button className="chat-icon" type="button" aria-label="Mention a teammate" aria-expanded={mentionOpen} disabled={busy} onClick={() => setMentionOpen(!mentionOpen)}><AtSign size={20}/></button>
      <textarea aria-label={target.kind === "task" ? "Write a comment" : "Write a message"} ref={textarea} rows={1} value={body} maxLength={4000} readOnly={busy || recording} onChange={e => setBody(e.target.value)} onKeyDown={e => {
        if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing && (e.ctrlKey || e.metaKey || window.matchMedia("(pointer: fine)").matches)) {e.preventDefault(); void send();}
      }} placeholder={target.kind === "task" ? "Write a comment…" : "Message…"} />
      <button className="chat-send" aria-label={target.kind === "task" ? "Post comment" : "Send message"} onMouseDown={e=>e.preventDefault()} disabled={busy || recording || (!body.trim() && !files.length)}><Send size={20}/></button></div>
      {body.length > 3600 && <small className="muted">{body.length}/4,000</small>}
      {failed && <p className="error" role="alert">{error || "Could not save. Your message is still here; try again."}</p>}
    </form>}
  </section>;
}

export default function TeamChat({ state, me, act, error, media, selected, onSelect, onAssignTask }: Props & { selected: string; onSelect: (thread: string) => void; onAssignTask: (memberId: string) => void }) {
  const [search, setSearch] = useState("");
  const drafts = useRef<Record<string,string>>({});
  const fileDrafts = useRef<Record<string,File[]>>({});
  const [viewport, setViewport] = useState({height: 0, top: 0});
  useEffect(() => {
    const update = () => setViewport({height: window.visualViewport?.height || window.innerHeight, top: window.visualViewport?.offsetTop || 0});
    update(); const vv = window.visualViewport; vv?.addEventListener("resize", update); vv?.addEventListener("scroll", update); window.addEventListener("resize",update);
    return () => {vv?.removeEventListener("resize",update); vv?.removeEventListener("scroll",update); window.removeEventListener("resize",update);};
  }, []);
  const teammate = state.members.find(m => m.id !== me.id && threadKey({kind: "direct", memberId: m.id}, me.id) === selected);
  const target: MessageTarget = teammate ? {kind: "direct", memberId: teammate.id} : {kind: "team"};
  const thread = threadKey(target, me.id);
  const count = (id: string) => state.notifications.filter(n => n.threadId === id && !n.read).length;
  const chats = [{id: "team", name: "Team chat", initials: "", description: "Everyone at Ignited"}, ...state.members.filter(m => m.id !== me.id).map(m => ({id: threadKey({kind: "direct", memberId: m.id},me.id), name: m.name, initials: m.name.split(/\s+/).map(n=>n[0]).slice(0,2).join(""), description: "Start a conversation"}))].map(c => ({...c, last: (state.messages || []).filter(m=>m.threadId===c.id).at(-1)})).sort((a,b)=>(b.last?.createdAt || "").localeCompare(a.last?.createdAt || ""));
  return <section className={`chat-panel ${selected ? "chat-open" : ""}`} style={{"--phone-chat-height": viewport.height ? `${viewport.height}px` : "100dvh", "--phone-chat-top": `${viewport.top}px`} as React.CSSProperties} aria-label="Team messenger">
    <div className="chat-list"><div className="chat-list-heading"><h2>Messages</h2><small>{state.members.length} teammates</small></div>
      <label className="chat-search"><Search size={18}/><input aria-label="Search conversations" placeholder="Search people" value={search} onChange={e=>setSearch(e.target.value)}/></label>
      <nav aria-label="Conversations">{chats.filter(c=>c.name.toLowerCase().includes(search.trim().toLowerCase())).map(c=><button data-tour-chat={c.id} key={c.id} className={`chat-list-item ${thread===c.id ? "selected" : ""}`} aria-label={`Chat with ${c.name}`} aria-current={thread===c.id ? "page" : undefined} onClick={()=>onSelect(c.id)}>
        <span className={`chat-avatar ${c.id==="team" ? "group" : ""}`}>{c.initials || <Users size={22}/>}</span><span className="chat-preview"><strong>{c.name}</strong><small>{c.last ? `${c.last.senderId===me.id ? "You: " : ""}${c.last.body || (c.last.attachments?.some(f => f.contentType.startsWith("audio/")) ? "Voice / audio message" : "Attachment")}` : c.description}</small></span>{count(c.id)>0 && <span className="chat-unread">{count(c.id)}</span>}
      </button>)}</nav>
      {!chats.some(c=>c.name.toLowerCase().includes(search.trim().toLowerCase())) && <p className="muted">No conversations found.</p>}
    </div>
    <div className="chat-thread"><header className="chat-thread-heading"><button className="chat-icon chat-back" aria-label="Back to conversations" onClick={()=>onSelect("")}><ArrowLeft size={22}/></button><span className="chat-avatar">{teammate ? teammate.name[0] : <Users size={22}/>}</span><div className="chat-thread-title"><h2>{teammate?.name || "Team chat"}</h2><small>{teammate ? "Private conversation" : `${state.members.length} members · Everyone at Ignited`}</small></div>{teammate && <button className="secondary chat-assign-task" onClick={() => onAssignTask(teammate.id)}>Assign task</button>}</header>
      <Conversation key={`${me.id}:${thread}:${!!selected}`} state={state} me={me} target={target} act={act} error={error} media={media} drafts={drafts} fileDrafts={fileDrafts} />
    </div>
  </section>;
}

export function TaskDiscussion({state, me, taskId, act, error, media, onClose}: Props & {taskId: string; onClose: () => void}) {
  const task = state.tasks.find(t => t.id === taskId);
  return <Dialog title="Task comments" onClose={onClose}>{task ? <><h3 className="task-title">{task.title}</h3><p className="muted">Visible to owners, the assignee, and the task creator.</p><Conversation key={`${me.id}:${taskId}`} state={state} me={me} target={{kind: "task", taskId}} act={act} error={error} media={media} /></> : <p role="status">This task is no longer available to your account.</p>}</Dialog>;
}
