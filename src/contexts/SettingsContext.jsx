"use client";
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { doc, onSnapshot, setDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "@/contexts/AuthContext";
import { DEFAULT_SETTINGS } from "@/lib/constants";

const SETTINGS_PATH = ["app_config", "settings"];
const SettingsContext = createContext(undefined);

// Numbers coming back from Firestore (or typed in a form) are coerced so a
// stray "" or null can never turn into NaN in a calculation.
function sanitize(raw) {
  const s = { ...DEFAULT_SETTINGS, ...raw };
  ["opening_balance", "credit_days", "low_cash_threshold", "week_starts_on", "overtime_rate", "salary_days_per_month"].forEach((k) => {
    const n = Number(s[k]);
    s[k] = Number.isFinite(n) ? n : DEFAULT_SETTINGS[k];
  });
  return s;
}

function SettingsProvider({ children }) {
  const { user } = useAuth();
  const [settings, setSettings] = useState(DEFAULT_SETTINGS);
  const [loading, setLoading] = useState(true);

  // Subscribe only once signed in. Subscribing earlier hit the security rules
  // while logged out, which permanently killed the listener, so settings never
  // loaded after login until a manual page refresh.
  useEffect(() => {
    if (!user) {
      setSettings(DEFAULT_SETTINGS);
      setLoading(true);
      return;
    }
    const unsub = onSnapshot(
      doc(db, ...SETTINGS_PATH),
      (snap) => {
        setSettings(snap.exists() ? sanitize(snap.data()) : DEFAULT_SETTINGS);
        setLoading(false);
      },
      (err) => {
        console.error("[settings] read failed:", err?.code, err?.message);
        setLoading(false);
      }
    );
    return () => unsub();
  }, [user]);

  useEffect(() => {
    const root = document.documentElement;
    const applyDark = (dark) => root.classList.toggle("dark", dark);
    if (settings.theme === "dark") applyDark(true);
    else if (settings.theme === "light") applyDark(false);
    else {
      const mq = window.matchMedia("(prefers-color-scheme: dark)");
      applyDark(mq.matches);
      const listener = (e) => applyDark(e.matches);
      mq.addEventListener("change", listener);
      return () => mq.removeEventListener("change", listener);
    }
  }, [settings.theme]);

  // The snapshot listener reflects the write instantly (latency compensation)
  // and rolls it back automatically if the server rejects it.
  const updateSettings = useCallback(async (patch) => {
    await setDoc(doc(db, ...SETTINGS_PATH), patch, { merge: true });
  }, []);

  const value = useMemo(() => ({ settings, loading, updateSettings }), [settings, loading, updateSettings]);
  return <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>;
}

function useSettings() {
  const ctx = useContext(SettingsContext);
  if (!ctx) throw new Error("useSettings must be used within SettingsProvider");
  return ctx;
}

export { SettingsProvider, useSettings };
