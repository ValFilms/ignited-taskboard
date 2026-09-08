import type { Notice } from "./workflow";
export function notificationQueue(notices: Notice[], seen: Set<string> | null, current: Notice[]) {
  const nextSeen = new Set(notices.map(n => n.id));
  if (!seen) return { seen: nextSeen, items: [] as Notice[] };
  const fresh = notices.filter(n => !n.read && !seen.has(n.id));
  const retained = current.filter(n => notices.some(v => v.id === n.id && !v.read));
  return { seen: nextSeen, items: [...retained, ...fresh].slice(-3) };
}
