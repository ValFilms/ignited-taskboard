"use client";
import { useRef, useState } from "react";
import { KeyRound } from "lucide-react";
import { passwordChange, type PasswordChange } from "../lib/password";

export default function PasswordSettings({ configured, save }: {
  configured: boolean;
  save: (values: PasswordChange) => Promise<string>;
}) {
  const [currentPassword, setCurrent] = useState(""), [newPassword, setNew] = useState(""), [confirmPassword, setConfirm] = useState("");
  const [show, setShow] = useState(false), [busy, setBusy] = useState(false);
  const [error, setError] = useState(""), [message, setMessage] = useState("");
  const submitting = useRef(false);
  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (submitting.current) return;
    setError(""); setMessage("");
    try {
      const values = passwordChange({ currentPassword, newPassword, confirmPassword });
      if (!configured) { setMessage("Demo preview only. No password was changed. Sign in to the live workspace to save your own password."); return; }
      submitting.current = true; setBusy(true);
      const result = await save(values);
      setCurrent(""); setNew(""); setConfirm(""); setShow(false); setMessage(result);
    } catch (e) { setError(e instanceof Error ? e.message : "Could not change your password. Please try again."); }
    finally { submitting.current = false; setBusy(false); }
  }
  return <section className="panel">
    <div className="panel-heading"><h2><KeyRound size={18} /> Change password</h2></div>
    <form className="settings-body" onSubmit={event => void submit(event)}>
      <p>Choose your own password. Keep using the same name to sign in.</p>
      {!configured && <p className="muted">Demo preview · use sample passwords only. Nothing entered here is saved.</p>}
      <label>Current password<input type={show ? "text" : "password"} autoComplete="current-password" required maxLength={256} disabled={busy} value={currentPassword} onChange={e => setCurrent(e.target.value)} /></label>
      <label>New password<input type={show ? "text" : "password"} autoComplete="new-password" required maxLength={256} aria-describedby="password-help" disabled={busy} value={newPassword} onChange={e => setNew(e.target.value)} /></label>
      <p id="password-help" className="muted">Use at least 8 characters. A longer, unique passphrase works well.</p>
      <label>Confirm new password<input type={show ? "text" : "password"} autoComplete="new-password" required maxLength={256} disabled={busy} value={confirmPassword} onChange={e => setConfirm(e.target.value)} /></label>
      <div className="password-actions">
        <button type="button" className="secondary" aria-pressed={show} disabled={busy} onClick={() => setShow(!show)}>{show ? "Hide passwords" : "Show passwords"}</button>
        <button type="submit" className="primary" disabled={busy}>{busy ? "Updating…" : "Update password"}</button>
      </div>
      {error && <p className="error" role="alert">{error}</p>}
      {message && <p role="status">{message}</p>}
    </form>
  </section>;
}
