import type { State } from "./workflow";
export type Device = { id: string; userId: string; endpoint: string; keys: { p256dh: string; auth: string }; createdAt: number; lastTestAt?: number };
export type Delivery = { id: string; deviceId: string; noticeId: string; createdAt: number; attempts: number; nextAttempt: number; lease?: string; leaseUntil?: number };
export function pushConfigured() {
  return !!(process.env.WEB_PUSH_PUBLIC_KEY && process.env.WEB_PUSH_PRIVATE_KEY && process.env.WEB_PUSH_SUBJECT);
}
export function subscriptionInput(input: unknown): Pick<Device, "endpoint" | "keys"> {
  const value = input as Partial<Device> | null;
  if (!value || typeof value.endpoint !== "string" || value.endpoint.length > 2048) throw new Error("Invalid push subscription");
  let url: URL;
  try { url = new URL(value.endpoint); } catch { throw new Error("Invalid push endpoint"); }
  const host = url.hostname;
  // Do not send server requests to arbitrary URLs supplied by browsers.
  const allowed = host === "fcm.googleapis.com" || host === "updates.push.services.mozilla.com" ||
    host === "web.push.apple.com" || /^[a-z0-9-]+\.notify\.windows\.com$/.test(host);
  if (!allowed || url.protocol !== "https:" || url.port || url.username || url.password || url.hash)
    throw new Error("Unsupported push service. Use Safari, Chrome, Edge or Firefox.");
  const { p256dh, auth } = value.keys || {};
  if (typeof p256dh !== "string" || !/^[A-Za-z0-9_-]{87}$/.test(p256dh) || Buffer.from(p256dh, "base64url")[0] !== 4 ||
      typeof auth !== "string" || !/^[A-Za-z0-9_-]{22}$/.test(auth)) throw new Error("Invalid push keys");
  return { endpoint: url.href, keys: { p256dh, auth } };
}
export function addDevice(s: State, userId: string, input: unknown, now = Date.now()) {
  const subscription = subscriptionInput(input);
  const existing = s.pushDevices?.find(d => d.endpoint === subscription.endpoint);
  if (existing && existing.userId !== userId) throw new Error("Disable notifications for the previous account on this device first");
  if (existing) { existing.keys = subscription.keys; return s; }
  if ((s.pushDevices || []).filter(d => d.userId === userId).length >= 5) throw new Error("Five devices are already enabled. Disable an old device first.");
  (s.pushDevices ||= []).push({ id: crypto.randomUUID(), userId, ...subscription, createdAt: now });
  return s;
}
export function removeDevice(s: State, userId: string, endpoint: string) {
  const ids = new Set((s.pushDevices || []).filter(d => d.userId === userId && d.endpoint === endpoint).map(d => d.id));
  s.pushDevices = (s.pushDevices || []).filter(d => !ids.has(d.id));
  s.pushQueue = (s.pushQueue || []).filter(q => !ids.has(q.deviceId));
  return s;
}
export function queueNotices(s: State, before: Set<string>, now = Date.now()) {
  const active = new Set(s.members.map(m => m.id));
  const devices = (s.pushDevices || []).filter(d => active.has(d.userId));
  if (!devices.length && !s.pushQueue?.length) return;
  s.pushQueue = (s.pushQueue || []).filter(q => q.createdAt > now - 86400000 && q.attempts < 5 && devices.some(d => d.id === q.deviceId));
  for (const notice of s.notifications) {
    if (before.has(notice.id) || notice.read) continue;
    for (const device of devices.filter(d => d.userId === notice.userId)) {
      const id = `${notice.id}:${device.id}`;
      if (!s.pushQueue.some(q => q.id === id)) s.pushQueue.push({ id, noticeId: notice.id, deviceId: device.id, createdAt: now, attempts: 0, nextAttempt: now });
    }
  }
  s.pushQueue = s.pushQueue.slice(-500);
}
