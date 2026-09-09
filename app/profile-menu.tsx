"use client";
import { useEffect, useRef, useState } from "react";
import { Bell, ChevronDown, ListTodo, LogOut, Settings, MessageCircle, Users } from "lucide-react";
import ThemeToggle from "./theme-toggle";
import type { Member } from "../lib/workflow";
import { isOwner } from "../lib/workflow";

export default function ProfileMenu({ me, navigate, signOut }: {
  me: Member; navigate: (view: "work" | "settings" | "notifications" | "chat" | "sales") => void; signOut?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!open) return;
    const dismiss = (e: PointerEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); };
    const key = (e: KeyboardEvent) => { if (e.key === "Escape") { setOpen(false); button.current?.focus(); } };
    document.addEventListener("pointerdown", dismiss); document.addEventListener("keydown", key);
    return () => { document.removeEventListener("pointerdown", dismiss); document.removeEventListener("keydown", key); };
  }, [open]);
  const go = (view: "work" | "settings" | "notifications" | "chat" | "sales") => { setOpen(false); navigate(view); };
  return <div className="profile-control" ref={ref} onBlur={e => { if (!e.currentTarget.contains(e.relatedTarget)) setOpen(false); }}>
    <button className="profile-trigger" ref={button} aria-label="Open profile menu" aria-expanded={open} aria-controls="profile-options" onClick={() => setOpen(!open)}>
      <span className="avatar small">{me.name.split(" ").map(n => n[0]).slice(0, 2).join("")}</span><ChevronDown size={14} />
    </button>
    {open && <div id="profile-options" className="profile-popover">
      <div className="profile-summary"><strong>{me.name}</strong><small>{me.role === "approver" ? "Owner · ad approver" : me.role === "manager" ? "Owner" : me.role}</small></div>
      <button onClick={() => go("work")}><ListTodo size={18} />My work</button>
      <button onClick={() => go("notifications")}><Bell size={18} />Inbox</button>
      <button onClick={() => go("chat")}><MessageCircle size={18} />Team chat</button>
      {isOwner(me) && <button onClick={() => go("sales")}><Users size={18} />Sales pipeline</button>}
      <button onClick={() => go("settings")}><Settings size={18} />Settings & notifications</button>
      <ThemeToggle />
      {signOut ? <button onClick={() => { setOpen(false); signOut(); }}><LogOut size={18} />Sign out</button> : <small className="demo-profile-note">Demo workspace · no account signed in</small>}
    </div>}
  </div>;
}
