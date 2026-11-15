"use client";
import { useState } from "react";
import { Menu, LogOut, Sun, Moon, CloudOff, RefreshCw, CheckCircle2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";
import { useSettings } from "@/contexts/SettingsContext";
import { useData } from "@/contexts/DataContext";

function SyncStatus() {
  const { online, syncing, offlineData } = useData();
  if (!online || offlineData) {
    return (
      <span className="flex items-center gap-1.5 rounded-full bg-danger/10 px-2.5 py-1 text-xs font-medium text-danger" title="No connection. Changes are saved on this device and will sync later.">
        <CloudOff className="h-3.5 w-3.5" /> <span className="hidden sm:inline">Offline</span>
      </span>
    );
  }
  if (syncing) {
    return (
      <span className="flex items-center gap-1.5 rounded-full bg-gauge-100 px-2.5 py-1 text-xs font-medium text-gauge-700 dark:bg-gauge-900/30 dark:text-gauge-300" title="Saving changes to the server…">
        <RefreshCw className="h-3.5 w-3.5 animate-spin" /> <span className="hidden sm:inline">Syncing</span>
      </span>
    );
  }
  return (
    <span className="flex items-center gap-1.5 rounded-full bg-ok/10 px-2.5 py-1 text-xs font-medium text-ok" title="All changes are saved.">
      <CheckCircle2 className="h-3.5 w-3.5" /> <span className="hidden sm:inline">Saved</span>
    </span>
  );
}

function Navbar({ onMenuClick }) {
  const { user, logout } = useAuth();
  const { settings, updateSettings } = useSettings();
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function handleLogout() {
    setBusy(true);
    try {
      await logout();
      router.replace("/login");
    } catch {
      toast.error("Could not log out. Try again.");
      setBusy(false);
    }
  }
  async function toggleTheme() {
    // Decide from what's actually on screen so "Match system" also toggles correctly.
    const isDark = document.documentElement.classList.contains("dark");
    try {
      await updateSettings({ theme: isDark ? "light" : "dark" });
    } catch {
      toast.error("Could not save the theme.");
    }
  }

  return (
    <header className="no-print sticky top-0 z-30 flex h-16 items-center justify-between border-b border-steel-200 bg-white/80 px-4 backdrop-blur dark:border-steel-700 dark:bg-steel-900/80">
      <button onClick={onMenuClick} className="rounded-lg p-2 text-steel-500 hover:bg-steel-100 dark:hover:bg-steel-800 lg:hidden" aria-label="Open menu">
        <Menu className="h-5 w-5" />
      </button>
      <h1 className="hidden font-display text-lg font-semibold text-steel-800 dark:text-steel-50 lg:block">{settings.factory_name}</h1>
      <div className="ml-auto flex items-center gap-2">
        <SyncStatus />
        <button onClick={toggleTheme} className="rounded-lg p-2 text-steel-500 hover:bg-steel-100 dark:text-steel-400 dark:hover:bg-steel-800" aria-label="Toggle theme">
          <Sun className="hidden h-[18px] w-[18px] dark:block" />
          <Moon className="h-[18px] w-[18px] dark:hidden" />
        </button>
        <div className="hidden items-center gap-2 rounded-lg border border-steel-200 px-3 py-1.5 dark:border-steel-700 sm:flex">
          <div className="flex h-7 w-7 items-center justify-center rounded-full bg-gauge-400 text-xs font-bold text-white">{user?.email?.[0]?.toUpperCase() ?? "A"}</div>
          <span className="max-w-[140px] truncate text-sm text-steel-600 dark:text-steel-300">{user?.email}</span>
        </div>
        <button onClick={handleLogout} disabled={busy} className="rounded-lg p-2 text-steel-500 hover:bg-danger/10 hover:text-danger dark:text-steel-400" aria-label="Log out">
          <LogOut className="h-[18px] w-[18px]" />
        </button>
      </div>
    </header>
  );
}
export { Navbar };
