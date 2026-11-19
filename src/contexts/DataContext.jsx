"use client";
// One shared, live copy of every collection, loaded once after login.
//
// Before, each page opened its own listeners, so moving between pages re-downloaded
// everything and totals on different pages could briefly disagree. Now every page
// reads the same snapshot, and the derived business figures (`biz`) are computed
// once, in one place (lib/finance.js), from that snapshot.
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { collection, onSnapshot } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "@/contexts/AuthContext";
import { useSettings } from "@/contexts/SettingsContext";
import { computeBusiness } from "@/lib/finance";
import { todayISO } from "@/lib/utils";

const DataContext = createContext(undefined);

const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);
const byName = (a, b) => String(a.name ?? "").localeCompare(String(b.name ?? ""));
const byCreatedDesc = (a, b) => num(b.created_at) - num(a.created_at);
const byDateDesc = (a, b) => {
  const da = a.date ?? "";
  const db_ = b.date ?? "";
  if (da !== db_) return da < db_ ? 1 : -1;
  return num(b.created_at) - num(a.created_at);
};

// Default ordering per collection. Done in the browser (not in the Firestore
// query) so a document that is missing a field is never silently hidden.
const SORTERS = {
  clients: byName,
  machines: byName,
  workers: byName,
  products: byName,
  production_logs: byCreatedDesc,
  orders: (a, b) => num(a.sequence) - num(b.sequence) || num(a.created_at) - num(b.created_at),
  expenses: byDateDesc,
  payments: byDateDesc,
  staff_payments: byDateDesc,
  sales_orders: (a, b) => {
    const da = a.order_date ?? "";
    const db_ = b.order_date ?? "";
    if (da !== db_) return da < db_ ? 1 : -1;
    return num(b.created_at) - num(a.created_at);
  },
};
const NAMES = Object.keys(SORTERS);

function DataProvider({ children }) {
  const { user } = useAuth();
  const { settings } = useSettings();
  const [store, setStore] = useState({});
  const [loaded, setLoaded] = useState({});
  const [errors, setErrors] = useState({});
  const [pending, setPending] = useState({});
  const [fromCache, setFromCache] = useState({});
  const [attempt, setAttempt] = useState(0);
  const [online, setOnline] = useState(true);
  const [today, setToday] = useState(null);

  // Today's date, kept current across midnight without causing hydration mismatches.
  useEffect(() => {
    setToday(todayISO());
    const t = setInterval(() => setToday((prev) => (prev === todayISO() ? prev : todayISO())), 60000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    const update = () => setOnline(navigator.onLine);
    update();
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
  }, []);

  useEffect(() => {
    if (!user) {
      setStore({});
      setLoaded({});
      setErrors({});
      setPending({});
      return;
    }
    setErrors({});
    const unsubs = NAMES.map((name) =>
      onSnapshot(
        collection(db, name),
        { includeMetadataChanges: true },
        (snap) => {
          const items = snap.docs.map((d) => ({ id: d.id, ...d.data() })).sort(SORTERS[name]);
          setStore((s) => ({ ...s, [name]: items }));
          setLoaded((l) => (l[name] ? l : { ...l, [name]: true }));
          setPending((p) => (p[name] === snap.metadata.hasPendingWrites ? p : { ...p, [name]: snap.metadata.hasPendingWrites }));
          setFromCache((f) => (f[name] === snap.metadata.fromCache ? f : { ...f, [name]: snap.metadata.fromCache }));
          setErrors((e) => {
            if (!e[name]) return e;
            const { [name]: _gone, ...rest } = e;
            return rest;
          });
        },
        (err) => {
          // Keep whatever data we already have. The old code replaced it with an
          // empty list, which made a permissions problem look like "no data".
          console.error(`[firestore] ${name}: ${err.code} — ${err.message}`);
          setErrors((e) => ({ ...e, [name]: err }));
          setLoaded((l) => ({ ...l, [name]: true }));
        }
      )
    );
    return () => unsubs.forEach((u) => u());
  }, [user, attempt]);

  const reconnect = useCallback(() => setAttempt((a) => a + 1), []);

  const data = useMemo(() => Object.fromEntries(NAMES.map((n) => [n, store[n] ?? []])), [store]);
  const loading = !!user && NAMES.some((n) => !loaded[n]);
  const syncing = Object.values(pending).some(Boolean);
  const offlineData = Object.values(fromCache).some(Boolean) && !online;

  const biz = useMemo(
    () =>
      computeBusiness({
        clients: data.clients,
        orders: data.sales_orders,
        payments: data.payments,
        expenses: data.expenses,
        logs: data.production_logs,
        products: data.products,
        workers: data.workers,
        staffPayments: data.staff_payments,
        settings,
        today: today ?? "",
      }),
    [data, settings, today]
  );

  const lookups = useMemo(
    () => ({
      clientById: new Map(data.clients.map((c) => [c.id, c])),
      productById: new Map(data.products.map((p) => [p.id, p])),
      machineById: new Map(data.machines.map((m) => [m.id, m])),
      workerById: new Map(data.workers.map((w) => [w.id, w])),
    }),
    [data]
  );

  const value = useMemo(
    () => ({ data, loading, loaded, errors, reconnect, biz, today, syncing, online, offlineData, ...lookups }),
    [data, loading, loaded, errors, reconnect, biz, today, syncing, online, offlineData, lookups]
  );
  return <DataContext.Provider value={value}>{children}</DataContext.Provider>;
}

function useData() {
  const ctx = useContext(DataContext);
  if (!ctx) throw new Error("useData must be used within DataProvider");
  return ctx;
}

export { DataProvider, useData };
