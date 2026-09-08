"use client";
import { useEffect, useState } from "react";
import { Moon, Sun } from "lucide-react";

const key = "ignited-theme";
export default function ThemeToggle() {
  const [light, setLight] = useState(false);
  useEffect(() => {
    const sync = () => setLight(document.documentElement.dataset.theme === "light");
    const storage = (event: StorageEvent) => {
      if (event.key !== key && event.key !== null) return;
      document.documentElement.dataset.theme = event.newValue === "light" ? "light" : "dark";
      sync();
    };
    sync();
    window.addEventListener("ignited-theme-change", sync);
    window.addEventListener("storage", storage);
    return () => {
      window.removeEventListener("ignited-theme-change", sync);
      window.removeEventListener("storage", storage);
    };
  }, []);
  function toggle() {
    const next = document.documentElement.dataset.theme === "light" ? "dark" : "light";
    document.documentElement.dataset.theme = next;
    try { localStorage.setItem(key, next); } catch { /* Still works when browser storage is disabled. */ }
    window.dispatchEvent(new Event("ignited-theme-change"));
  }
  const label = `Switch to ${light ? "dark" : "light"} mode`;
  return <button type="button" className="theme-toggle" onClick={toggle} aria-label={label} title={label}>
    {light ? <Moon size={18} aria-hidden="true" /> : <Sun size={18} aria-hidden="true" />}
    <span>{light ? "Dark mode" : "Light mode"}</span>
  </button>;
}
