"use client";
import { useEffect, useRef, useState } from "react";
import { Bell, X } from "lucide-react";
import type { Notice } from "../lib/workflow";
import { notificationQueue } from "../lib/notification-queue";

export default function NotificationToasts({ notices, onOpen }: {
  notices: Notice[]; onOpen: (notice: Notice) => void;
}) {
  const seen = useRef<Set<string> | null>(null);
  const [items, setItems] = useState<Notice[]>([]);
  useEffect(() => {
    const previous = seen.current;
    seen.current = new Set(notices.map(n => n.id));
    setItems(current => notificationQueue(notices, previous, current).items);
  }, [notices]);
  return <aside className="notification-toasts" aria-label="New notifications" aria-live="polite" aria-relevant="additions">
    {items.map(n => <div className="notification-toast" key={n.id}>
      <Bell size={20} aria-hidden="true" />
      <button className="toast-open" onClick={() => onOpen(n)}>
        <strong>New notification</strong><span>{n.text}</span><small>{n.taskId ? "View task" : "View client"}</small>
      </button>
      <button className="icon-button" aria-label="Dismiss notification pop-up" onClick={() => setItems(items => items.filter(v => v.id !== n.id))}><X size={17} /></button>
    </div>)}
  </aside>;
}
