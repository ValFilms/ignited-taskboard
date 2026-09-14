"use client";
import { useEffect, useRef, useState } from "react";
import { Mic, Paperclip, Square, X } from "lucide-react";
import { Attachment, MAX_ATTACHMENTS, baseType, validateAttachment } from "../lib/attachments";
import type { MessageInput } from "../lib/messaging";
export type ChatFiles = {
  demo?: boolean;
  send: (message: MessageInput, files: File[]) => Promise<boolean>;
  open: (messageId: string, file: Attachment, download?: boolean) => Promise<string>;
};
export function AttachmentView({messageId, file, media}: {messageId: string; file: Attachment; media?: ChatFiles}) {
  const [url, setUrl] = useState(""), [error, setError] = useState(""), [busy, setBusy] = useState(false);
  const open = async () => {setBusy(true); setError(""); try {if (!media) throw Error("Attachments require the connected workspace"); setUrl(await media.open(messageId,file));} catch (e) {setError((e as Error).message);} finally {setBusy(false);}};
  return <div className="chat-attachment"><strong>{file.name.startsWith("Voice memo ") ? "Voice memo" : file.name}</strong>{!file.contentType.startsWith("audio/") && <small>{(file.size / 1024 / 1024).toFixed(1)} MB</small>}
    {!url ? <button className="secondary" disabled={busy} onClick={() => void open()}>{busy ? "Opening…" : file.contentType.startsWith("audio/") ? "Play voice memo" : "Open attachment"}</button> : <>
      {file.contentType.startsWith("image/") && <img src={url} alt={file.name} />}
      {file.contentType.startsWith("video/") && <video src={url} controls playsInline preload="metadata" />}
      {file.contentType.startsWith("audio/") && <audio src={url} controls preload="metadata" />}
      <a href={url} target="_blank" rel="noopener noreferrer">Open file</a><button className="text-button" onClick={() => void open()}>Refresh file access</button>
    </>}{error && <p role="alert">{error}</p>}
  </div>;
}
function LocalAudio({file}: {file: File}) {
  const [url,setUrl] = useState("");
  useEffect(() => {const value = URL.createObjectURL(file); setUrl(value); return () => URL.revokeObjectURL(value);}, [file]);
  return <audio controls src={url || undefined} preload="metadata" aria-label="Preview voice memo"/>;
}
export function MediaPicker({files, onChange, busy, onRecording}: {files: File[]; onChange: (files: File[]) => void; busy: boolean; onRecording: (value: boolean) => void}) {
  const input = useRef<HTMLInputElement>(null), recorder = useRef<MediaRecorder | null>(null), stream = useRef<MediaStream | null>(null), chunks = useRef<Blob[]>([]);
  const alive = useRef(true), cancel = useRef(false), timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [recording, setRecording] = useState(false), [starting, setStarting] = useState(false), [error, setError] = useState("");
  const update = useRef(onChange); update.current = onChange;
  const currentFiles = useRef(files); currentFiles.current = files;
  useEffect(() => {alive.current = true; return () => {alive.current=false; cancel.current=true; if (timer.current) clearTimeout(timer.current); if (recorder.current?.state === "recording") recorder.current.stop(); stream.current?.getTracks().forEach(t => t.stop());};}, []);
  const add = (more: File[]) => {
    try {if (currentFiles.current.length + more.length > MAX_ATTACHMENTS) throw Error("Attach up to 5 files per message"); more.forEach(file => validateAttachment({name:file.name, size:file.size, contentType:file.type})); update.current([...currentFiles.current, ...more]); setError("");} catch(e) {setError((e as Error).message);}
  };
  const stop = (discard = false) => {cancel.current=discard; if (timer.current) clearTimeout(timer.current); if (recorder.current?.state === "recording") recorder.current.stop(); stream.current?.getTracks().forEach(t => t.stop());};
  const start = async () => {
    setError(""); setStarting(true); onRecording(true); cancel.current=false;
    try {
      if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") throw Error("Voice recording is unavailable here. You can attach an audio file instead.");
      const mic = await navigator.mediaDevices.getUserMedia({audio:true});
      if (!alive.current) {mic.getTracks().forEach(t => t.stop()); return;}
      stream.current = mic;
      const type = ["audio/mp4", "audio/webm;codecs=opus", "audio/ogg;codecs=opus"].find(t => MediaRecorder.isTypeSupported(t));
      const rec = new MediaRecorder(mic, type ? {mimeType:type} : undefined); recorder.current=rec; chunks.current=[];
      rec.ondataavailable = e => {if (e.data.size) chunks.current.push(e.data);};
      rec.onerror = () => {cancel.current=true; setError("Recording failed. Please try again."); stop(true);};
      rec.onstop = () => {
        mic.getTracks().forEach(t => t.stop());
        if (!alive.current) return;
        setRecording(false); onRecording(false);
        if (!cancel.current) {const mime=baseType(rec.mimeType), blob=new Blob(chunks.current,{type:mime}); add([new File([blob], `Voice memo ${new Date().toISOString().replaceAll(":","-")}.${mime === "audio/mp4" ? "m4a" : mime === "audio/ogg" ? "ogg" : "webm"}`,{type:mime})]);}
      };
      rec.start(1000); setRecording(true); timer.current=setTimeout(() => stop(), 5 * 60000);
    } catch(e) {stream.current?.getTracks().forEach(t => t.stop()); if(alive.current) {setError((e as Error).name === "NotAllowedError" ? "Microphone access was denied. Allow it in your browser settings or attach an audio file." : (e as Error).message); onRecording(false);}}
    finally {if(alive.current) setStarting(false);}
  };
  return <div className="media-picker">
    <div className="media-tools"><input ref={input} hidden type="file" multiple accept="image/jpeg,image/png,image/gif,image/webp,image/heic,image/heif,video/mp4,video/quicktime,video/webm,video/x-m4v,audio/*,application/pdf,text/plain,application/zip" onChange={e => {add(Array.from(e.target.files || [])); e.target.value="";}} />
      <button type="button" className="chat-icon" aria-label="Attach files" disabled={busy || recording || starting || files.length >= MAX_ATTACHMENTS} onClick={() => input.current?.click()}><Paperclip size={20}/></button>
      {recording ? <><span role="status">Recording · up to 5 minutes</span><button type="button" className="secondary" onClick={() => stop()}><Square size={16}/>Stop and review</button><button type="button" className="text-button" onClick={() => stop(true)}>Discard</button></> : <button type="button" className="chat-icon" aria-label="Record voice memo" disabled={busy || starting || files.length >= MAX_ATTACHMENTS} onClick={() => void start()}><Mic size={20}/>{starting && "Opening microphone…"}</button>}
      <small>Up to 5 files · 50 MB each</small>
    </div>
    {files.map((file,i) => <div className="pending-attachment" key={`${i}:${file.name}`}><span>{file.name.startsWith("Voice memo ") ? "Voice memo · ready to send" : file.name}</span>{file.type.startsWith("audio/") && <LocalAudio file={file}/>}<button type="button" className="chat-icon" aria-label={`Remove ${file.name}`} disabled={busy || recording || starting} onClick={() => onChange(files.filter((_,j) => j!==i))}><X size={16}/></button></div>)}
    {error && <p className="error" role="alert">{error}</p>}
  </div>;
}
