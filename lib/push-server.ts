import webpush from "web-push";
import { mutate } from "./server";
import { pushConfigured, subscriptionInput, type Device } from "./push-state";

export async function sendPush(device: Device, tag: string, test = false) {
  if (!pushConfigured()) throw new Error("Push sender is not configured");
  return webpush.sendNotification(subscriptionInput(device), JSON.stringify({
    title: test ? "Ignited test notification" : "Ignited · Team update",
    body: test ? "Push notifications work on this device." : "You have a new team notification. Open your inbox to view it.",
    tag, url: "/?inbox=1",
  }), { TTL: 3600, timeout: 4000, vapidDetails: {
    subject: process.env.WEB_PUSH_SUBJECT!, publicKey: process.env.WEB_PUSH_PUBLIC_KEY!, privateKey: process.env.WEB_PUSH_PRIVATE_KEY!,
  } });
}

export async function flushPush() {
  if (!pushConfigured()) return;
  const lease = crypto.randomUUID(), now = Date.now();
  const claimed = await mutate(s => {
    s.pushQueue = (s.pushQueue || []).filter(q => q.createdAt > now - 86400000 && q.attempts < 5 &&
      s.pushDevices?.some(d => d.id === q.deviceId && s.members.some(m => m.id === d.userId)) &&
      s.notifications.some(n => n.id === q.noticeId && !n.read));
    for (const q of s.pushQueue.filter(q => q.nextAttempt <= now && (!q.leaseUntil || q.leaseUntil < now)).slice(0, 10)) {
      q.lease = lease; q.leaseUntil = now + 60000; q.attempts++;
    }
    return s;
  }, false);
  const results = await Promise.all((claimed.pushQueue || []).filter(q => q.lease === lease).map(async q => {
    const device = claimed.pushDevices!.find(d => d.id === q.deviceId)!;
    try { await sendPush(device, q.noticeId); return { id: q.id, device, outcome: "sent" }; }
    catch (e) { return { id: q.id, device, outcome: [404, 410].includes((e as { statusCode?: number }).statusCode || 0) ? "expired" : "retry" }; }
  }));
  if (!results.length) return;
  await mutate(s => {
    for (const result of results) {
      const q = s.pushQueue?.find(q => q.id === result.id && q.lease === lease);
      if (!q) continue;
      if (result.outcome === "retry") { q.lease = undefined; q.leaseUntil = undefined; q.nextAttempt = Date.now() + Math.min(3600000, 60000 * 2 ** q.attempts); }
      else s.pushQueue = s.pushQueue!.filter(item => item.id !== q.id);
      if (result.outcome === "expired") {
        s.pushDevices = s.pushDevices?.filter(d => d.id !== result.device.id);
        s.pushQueue = s.pushQueue?.filter(item => item.deviceId !== result.device.id);
      }
    }
    return s;
  }, false);
}
