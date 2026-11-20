"use client";
import { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, FileSpreadsheet, Sun, Moon } from "lucide-react";
import * as XLSX from "xlsx";
import { useData } from "@/contexts/DataContext";
import { useSettings } from "@/contexts/SettingsContext";
import { orderLabel } from "@/lib/production-helpers";
import { daysBetween, formatDate, formatNumber, plural } from "@/lib/utils";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Select } from "@/components/ui/Select";
import { Segmented } from "@/components/ui/Segmented";
import { PageHeader } from "@/components/ui/PageHeader";
import { StatCard } from "@/components/ui/StatCard";

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const WEEKDAYS = ["Sat", "Sun", "Mon", "Tue", "Wed", "Thu", "Fri"];
const shiftMonth = (m, d) => {
  const [y, mo] = m.split("-").map(Number);
  const dt = new Date(y, mo - 1 + d, 1);
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}`;
};

/**
 * 24-hour production by calendar day: day shift + night shift = the day's total,
 * with a click-through to every entry (machine, order, crew, counter start → end).
 * A night shift counts on the date it STARTED (e.g. 9pm Monday to 9am Tuesday is Monday).
 */
export default function ProductionCalendarPage() {
  const { settings } = useSettings();
  const { data, today, machineById, productById, workerById } = useData();
  const [monthState, setMonth] = useState("");
  const month = monthState || (today ? today.slice(0, 7) : "");
  const [view, setView] = useState("calendar");
  const [machine, setMachine] = useState("");
  const [selected, setSelected] = useState("");

  const orderById = useMemo(() => new Map(data.orders.map((o) => [o.id, o])), [data.orders]);
  const logs = useMemo(() => data.production_logs.filter((l) => (l.date ?? "").startsWith(month) && (!machine || l.machine_id === machine)), [data.production_logs, month, machine]);

  const byDate = useMemo(() => {
    const m = new Map();
    logs.forEach((l) => {
      const d = m.get(l.date) ?? { day: 0, night: 0, logs: [] };
      d[l.shift === "night" ? "night" : "day"] += Number(l.total_quantity) || 0;
      d.logs.push(l);
      m.set(l.date, d);
    });
    return m;
  }, [logs]);

  if (!month) return null;
  const [y, mo] = month.split("-").map(Number);
  const daysInMonth = new Date(y, mo, 0).getDate();
  const allDates = daysBetween(`${month}-01`, `${month}-${String(daysInMonth).padStart(2, "0")}`);
  // Saturday-first grid, matching the working week used elsewhere in the app.
  const firstDow = (new Date(y, mo - 1, 1).getDay() + 1) % 7;
  const cells = [...Array(firstDow).fill(null), ...allDates];

  const monthDay = [...byDate.values()].reduce((s, d) => s + d.day, 0);
  const monthNight = [...byDate.values()].reduce((s, d) => s + d.night, 0);
  const activeDays = byDate.size;
  const sel = selected && byDate.get(selected);

  function itemRows(log) {
    return (log.items ?? []).map((it) => {
      const ord = it.order_id ? orderById.get(it.order_id) : null;
      return { log, it, order: ord };
    });
  }

  function exportExcel() {
    const rows = [];
    allDates.forEach((d) => {
      const g = byDate.get(d);
      (g?.logs ?? []).forEach((l) =>
        itemRows(l).forEach(({ it, order }) =>
          rows.push({
            Date: d, Shift: l.shift === "night" ? "Night" : "Day", Machine: machineById.get(l.machine_id)?.name ?? "",
            Product: productById.get(it.product_id)?.name ?? "", Order: order ? orderLabel(order, productById) : "",
            "Start counter": it.start_count ?? "", "End counter": it.end_count ?? "", Produced: it.quantity,
            "Worker 1": workerById.get(l.worker1_id)?.name ?? "", "Worker 2": workerById.get(l.worker2_id)?.name ?? "",
          })
        )
      );
    });
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), "Entries");
    const sheet = allDates.map((d) => { const g = byDate.get(d); return { Date: d, "Day shift": g?.day ?? 0, "Night shift": g?.night ?? 0, "24h total": (g?.day ?? 0) + (g?.night ?? 0) }; });
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(sheet), "Daily totals");
    XLSX.writeFile(wb, `production_${month}.xlsx`);
  }

  const maxTotal = Math.max(1, ...[...byDate.values()].map((d) => d.day + d.night));

  return (
    <div className="space-y-6">
      <PageHeader
        title="Production Calendar"
        description={`24-hour totals by day. Day shift ${settings.day_shift_start}–${settings.night_shift_start}, night shift ${settings.night_shift_start}–${settings.day_shift_start} (counted on the date it starts).`}
        actions={<><Segmented options={[{ value: "calendar", label: "Calendar" }, { value: "table", label: "Table" }]} value={view} onChange={setView} /><Button variant="secondary" onClick={exportExcel}><FileSpreadsheet className="h-4 w-4" /> Excel</Button></>}
      />

      <div className="flex flex-wrap items-center gap-2">
        <Button variant="secondary" size="sm" onClick={() => { setMonth(shiftMonth(month, -1)); setSelected(""); }} aria-label="Previous month"><ChevronLeft className="h-4 w-4" /></Button>
        <span className="min-w-[9rem] text-center font-display text-lg font-semibold">{MONTHS[mo - 1]} {y}</span>
        <Button variant="secondary" size="sm" onClick={() => { setMonth(shiftMonth(month, 1)); setSelected(""); }} aria-label="Next month"><ChevronRight className="h-4 w-4" /></Button>
        <Select className="ml-auto w-48" value={machine} onChange={(e) => setMachine(e.target.value)}>
          <option value="">All machines</option>
          {data.machines.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
        </Select>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Month total (24h)" value={formatNumber(monthDay + monthNight)} sub="pieces" tone="blue" />
        <StatCard label="Day shift" value={formatNumber(monthDay)} icon={Sun} tone="amber" />
        <StatCard label="Night shift" value={formatNumber(monthNight)} icon={Moon} tone="blue" />
        <StatCard label="Average per running day" value={formatNumber(activeDays ? Math.round((monthDay + monthNight) / activeDays) : 0)} sub={`${plural(activeDays, "day")} with production`} tone="green" />
      </div>

      {view === "calendar" ? (
        <Card>
          <CardBody>
            <div className="grid grid-cols-7 gap-1.5 text-center text-[11px] font-semibold uppercase tracking-wide text-steel-400">
              {WEEKDAYS.map((d) => <div key={d}>{d}</div>)}
            </div>
            <div className="mt-1.5 grid grid-cols-7 gap-1.5">
              {cells.map((d, i) => {
                if (!d) return <div key={`e${i}`} />;
                const g = byDate.get(d);
                const total = g ? g.day + g.night : 0;
                const isSel = selected === d;
                return (
                  <button
                    key={d}
                    type="button"
                    onClick={() => setSelected(isSel ? "" : d)}
                    className={`min-h-[84px] rounded-lg border p-1.5 text-left transition-colors sm:p-2 ${isSel ? "border-instrument-500 bg-instrument-500/10" : "border-steel-100 hover:bg-steel-50 dark:border-steel-700 dark:hover:bg-steel-900/40"} ${d === today ? "ring-1 ring-gauge-400" : ""}`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-semibold text-steel-500">{Number(d.slice(8))}</span>
                    </div>
                    {g ? (
                      <>
                        <p className="mt-1 font-mono text-sm font-bold text-steel-800 dark:text-steel-50">{formatNumber(total)}</p>
                        <p className="font-mono text-[10px] leading-tight text-gauge-700 dark:text-gauge-300">☀ {formatNumber(g.day)}</p>
                        <p className="font-mono text-[10px] leading-tight text-instrument-600 dark:text-instrument-400">☾ {formatNumber(g.night)}</p>
                        <div className="mt-1 h-1 overflow-hidden rounded-full bg-steel-100 dark:bg-steel-700"><div className="h-full bg-ok" style={{ width: `${(total / maxTotal) * 100}%` }} /></div>
                      </>
                    ) : (
                      <p className="mt-2 text-[11px] text-steel-300 dark:text-steel-600">—</p>
                    )}
                  </button>
                );
              })}
            </div>
            <p className="mt-3 text-[11px] text-steel-400">Big number = total for the 24 hours · ☀ day shift · ☾ night shift. Tap a day for the details.</p>
          </CardBody>
        </Card>
      ) : (
        <Card>
          <CardHeader><CardTitle>Daily sheet · {MONTHS[mo - 1]} {y}</CardTitle></CardHeader>
          <CardBody className="overflow-x-auto p-0">
            <table className="w-full text-sm">
              <thead className="bg-steel-50 text-left text-xs uppercase tracking-wide text-steel-400 dark:bg-steel-900">
                <tr><th className="px-4 py-3">Date</th><th className="px-4 py-3 text-right">Day shift</th><th className="px-4 py-3 text-right">Night shift</th><th className="px-4 py-3 text-right">24h total</th><th className="px-4 py-3" /></tr>
              </thead>
              <tbody>
                {allDates.map((d) => {
                  const g = byDate.get(d);
                  return (
                    <tr key={d} className="cursor-pointer border-t border-steel-100 hover:bg-steel-50/60 dark:border-steel-700 dark:hover:bg-steel-900/40" onClick={() => setSelected(selected === d ? "" : d)}>
                      <td className="px-4 py-2.5 whitespace-nowrap">{formatDate(d)}</td>
                      <td className="px-4 py-2.5 text-right font-mono">{g ? formatNumber(g.day) : "—"}</td>
                      <td className="px-4 py-2.5 text-right font-mono">{g ? formatNumber(g.night) : "—"}</td>
                      <td className="px-4 py-2.5 text-right font-mono font-semibold">{g ? formatNumber(g.day + g.night) : "—"}</td>
                      <td className="px-4 py-2.5 text-xs text-instrument-600">{g ? "details" : ""}</td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot className="border-t-2 border-steel-200 bg-steel-50 font-semibold dark:border-steel-700 dark:bg-steel-900">
                <tr><td className="px-4 py-3">Month total</td><td className="px-4 py-3 text-right font-mono">{formatNumber(monthDay)}</td><td className="px-4 py-3 text-right font-mono">{formatNumber(monthNight)}</td><td className="px-4 py-3 text-right font-mono">{formatNumber(monthDay + monthNight)}</td><td /></tr>
              </tfoot>
            </table>
          </CardBody>
        </Card>
      )}

      {sel && (
        <Card>
          <CardHeader><CardTitle>{formatDate(selected)}: {formatNumber(sel.day + sel.night)} pieces in 24 hours</CardTitle></CardHeader>
          <CardBody className="overflow-x-auto p-0">
            <table className="w-full text-sm">
              <thead className="bg-steel-50 text-left text-xs uppercase tracking-wide text-steel-400 dark:bg-steel-900">
                <tr><th className="px-4 py-3">Shift</th><th className="px-4 py-3">Machine</th><th className="px-4 py-3">Order / product</th><th className="px-4 py-3 text-right">Counter</th><th className="px-4 py-3 text-right">Difference</th><th className="px-4 py-3">Crew</th></tr>
              </thead>
              <tbody>
                {[...sel.logs].sort((a, b) => (a.shift === b.shift ? (a.created_at ?? 0) - (b.created_at ?? 0) : a.shift === "day" ? -1 : 1)).flatMap((l) =>
                  itemRows(l).map(({ it, order }, k) => (
                    <tr key={`${l.id}-${k}`} className="border-t border-steel-100 dark:border-steel-700">
                      <td className="px-4 py-2.5">{l.shift === "night" ? "☾ Night" : "☀ Day"}</td>
                      <td className="px-4 py-2.5">{machineById.get(l.machine_id)?.name ?? "—"}</td>
                      <td className="px-4 py-2.5">{order ? <>{orderLabel(order, productById)} <span className="text-xs text-steel-400">· {productById.get(it.product_id)?.name}</span></> : productById.get(it.product_id)?.name ?? "Unknown"}</td>
                      <td className="px-4 py-2.5 text-right font-mono">{it.start_count ?? 0} → {it.end_count ?? "—"}</td>
                      <td className="px-4 py-2.5 text-right font-mono font-semibold">+{formatNumber(it.quantity)}</td>
                      <td className="px-4 py-2.5 text-steel-500">{workerById.get(l.worker1_id)?.name ?? "—"} &amp; {workerById.get(l.worker2_id)?.name ?? "—"}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </CardBody>
        </Card>
      )}
    </div>
  );
}
