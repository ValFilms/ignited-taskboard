"use client";
import { useEffect, useState } from "react";
import { Bell, Smartphone } from "lucide-react";

export default function PushSettings({ configured, api }: { configured: boolean; api: (path: string, body: unknown) => Promise<any> }) {
  const [ready, setReady] = useState(false), [enabled, setEnabled] = useState(false), [publicKey, setPublicKey] = useState("");
  const [supported, setSupported] = useState(false), [iosInstall, setIosInstall] = useState(false);
  const [busy, setBusy] = useState(false), [message, setMessage] = useState("");
  const [permission, setPermission] = useState<NotificationPermission>("default");
  useEffect(() => {
    let active = true;
    const standalone = window.matchMedia("(display-mode: standalone)").matches || (navigator as Navigator & { standalone?: boolean }).standalone;
    setIosInstall((/iPad|iPhone|iPod/.test(navigator.userAgent) || navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1) && !standalone);
    const available = "serviceWorker" in navigator && "PushManager" in window && "Notification" in window && window.isSecureContext;
    setSupported(available);
    if (available) setPermission(Notification.permission);
    if (configured && available) void (async () => {
      try {
        const reg = await navigator.serviceWorker.register("/sw.js");
        const sub = await reg.pushManager.getSubscription();
        const result = await api("/api/push", { type: "status", endpoint: sub?.endpoint });
        if (active) { setPublicKey(result.publicKey || ""); setEnabled(!!result.enabled && !!sub); setReady(true); }
      } catch { if (active) { setMessage("Could not check push settings. Refresh to try again."); setReady(true); } }
    })();
    else setReady(true);
    return () => { active = false; };
    // Check once when this settings panel opens; API uses the current session.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [configured]);
  async function enable() {
    setBusy(true); setMessage("");
    let created: PushSubscription | null = null;
    try {
      // This call must remain directly attached to the user's tap for iOS.
      const allowed = await Notification.requestPermission(); setPermission(allowed);
      if (allowed !== "granted") { setMessage("Notifications weren’t allowed. You can change this in your browser or device settings."); return; }
      const reg = await navigator.serviceWorker.ready;
      let sub = await reg.pushManager.getSubscription();
      if (!sub) { sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: publicKey }); created = sub; }
      await api("/api/push", { type: "subscribe", subscription: sub.toJSON() });
      setEnabled(true); setMessage("Push enabled on this device. Send a test to check delivery.");
    } catch (e) { if (created) await created.unsubscribe().catch(() => {}); setMessage(e instanceof Error ? e.message : "Could not enable push."); }
    finally { setBusy(false); }
  }
  async function deviceAction(type: "unsubscribe" | "test") {
    setBusy(true); setMessage("");
    try {
      const reg = await navigator.serviceWorker.getRegistration(); const sub = await reg?.pushManager.getSubscription();
      if (!sub) { setEnabled(false); throw new Error("This device subscription is missing. Enable push again."); }
      await api("/api/push", { type, endpoint: sub.endpoint });
      if (type === "unsubscribe") { await sub.unsubscribe(); setEnabled(false); setMessage("Push disabled on this device. In-app alerts remain available."); }
      else setMessage("The push service accepted the test. Check your device’s notification center; Focus or Do Not Disturb may silence it.");
    } catch (e) { setMessage(e instanceof Error ? e.message : "Could not update push settings."); }
    finally { setBusy(false); }
  }
  return <section className="panel"><div className="panel-heading"><h2><Bell size={18} /> Push notifications</h2></div>
    <div className="settings-body">
      <p>Get notified about assignments, completed tasks, approvals and deadlines, even when the app is closed.</p>
      <span className="badge">{!configured ? "Demo · push needs a signed-in workspace" : !ready ? "Checking…" : permission === "denied" ? "Blocked on this device" : enabled ? "Enabled on this device" : !publicKey ? "Server setup needed" : "Not enabled on this device"}</span>
      {iosInstall && <p className="push-help"><Smartphone size={18} /> On iPhone or iPad, open this site in Safari, tap Share → Add to Home Screen, then launch Ignited from that icon and enable notifications.</p>}
      {!supported && ready && !iosInstall && <p className="push-help">Open the HTTPS app in a supported browser such as Safari, Chrome, Edge or Firefox.</p>}
      {permission === "denied" && <p className="push-help">Notifications are blocked. Allow them in your browser’s site settings or your device’s notification settings, then reopen the app.</p>}
      {configured && ready && !publicKey && <p className="push-help">The workspace owner needs to finish the private push sender setup. Your in-app inbox still works.</p>}
      <div className="push-actions">
        {enabled ? <><button className="primary" disabled={busy} onClick={() => void deviceAction("test")}>Send test notification</button><button className="secondary" disabled={busy} onClick={() => void deviceAction("unsubscribe")}>Disable on this device</button></> :
          <button className="primary" disabled={busy || !configured || !supported || !publicKey || iosInstall || permission === "denied"} onClick={() => void enable()}>{busy ? "Enabling…" : "Enable push notifications"}</button>}
      </div>
      {message && <p className="push-help" role="status">{message}</p>}
      <details className="push-guide"><summary>Phone and desktop setup</summary>
        <ol><li>Open Ignited on the device where you want alerts.</li><li>On iPhone/iPad (16.4 or later), add it to your Home Screen and open it there.</li><li>Sign in, open your profile → Settings & notifications, then enable push and choose Allow.</li><li>Send a test. Repeat on each device you use.</li></ol>
        <p>Push alerts show a generic team update. Open the inbox to see private details. Delivery depends on your device’s notification and Focus settings. Unattended deadline alerts require the server reminder schedule.</p>
      </details>
    </div></section>;
}
