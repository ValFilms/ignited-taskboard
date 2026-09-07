"use client";
import { useEffect, useRef, useState } from "react";
import { Bell, X } from "lucide-react";
import type { Notice } from "../lib/workflow";

export default function NotificationToasts({ notices, onOpen }: {
  notices: Notice[]; onOpen: (notice: Notice) => void;
}) {
  const seen = useRef<Set<string> | null>(null);
  const [items, setItems] = useState<Notice[]>([]);
  useEffect(() => {
    const previous = seen.current;
    seen.current = new Set(notices.map(n => n.id));
    if (!previous) return; // Existing inbox entries stay in the inbox on sign-in.
    const fresh = notices.filter(n => !n.read && !previous.has(n.id));
    setItems(current => [...current.filter(n => notices.some(v => v.id === n.id && !v.read)), ...fresh].slice(-3));
  }, [notices]);
  return <aside className="notification-toasts" aria-label="New notifications" aria-live="polite" aria-relevant="additions">
    {items.map(n => <div className="notification-toast" key={n.id}>
      <Bell size={20} aria-hidden="true" />
      <button className="toast-open" onClick={() => onOpen(n)}>
        <strong>New notification</strong><span>{n.text}</span><small>View client</small>
      </button>
      <button className="icon-button" aria-label="Dismiss notification pop-up" onClick={() => setItems(items => items.filter(v => v.id !== n.id))}><X size={17} /></button>
    </div>)}
  </aside>;
}
