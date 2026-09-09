"use client";
import { useEffect, useRef } from "react";
import { X } from "lucide-react";

export default function Dialog({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const dialog = ref.current!;
    dialog.showModal();
    const practice=!!dialog.closest('[data-practice-workspace]');
    const overflow = document.body.style.overflow;
    if(!practice)document.body.style.overflow = "hidden";
    return () => { dialog.close(); if(!practice)document.body.style.overflow = overflow; previous?.focus(); };
  }, []);
  return <dialog ref={ref} className="task-dialog" aria-label={title} onCancel={e => { e.preventDefault(); onClose(); }}
    onClick={e => { if (e.target === ref.current) { const r = ref.current.getBoundingClientRect(); if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) onClose(); } }}>
    <div data-guide-host />
    <div className="drawer-top"><h2>{title}</h2><button className="icon-button" aria-label="Close task" onClick={onClose}><X /></button></div>
    <div className="dialog-body">{children}</div>
  </dialog>;
}
