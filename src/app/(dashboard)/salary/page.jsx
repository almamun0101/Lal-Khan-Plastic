"use client";
import { Fragment, useMemo, useState } from "react";
import Link from "next/link";
import { ChevronLeft, ChevronRight, ChevronDown, ChevronUp, HandCoins, Banknote, FileSpreadsheet, Printer, Pencil, Trash2, Users } from "lucide-react";
import * as XLSX from "xlsx";
import { toast } from "sonner";
import { useData } from "@/contexts/DataContext";
import { useSettings } from "@/contexts/SettingsContext";
import { computePayroll } from "@/lib/payroll";
import { METHOD_LABEL } from "@/lib/constants";
import { deleteDocById, errorMessage, notifySaved } from "@/lib/firestore-service";
import { formatCurrency, formatDate } from "@/lib/utils";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Badge } from "@/components/ui/Badge";
import { PageHeader } from "@/components/ui/PageHeader";
import { StatCard } from "@/components/ui/StatCard";
import { EmptyState } from "@/components/ui/EmptyState";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { StaffPaymentModal } from "@/components/business/StaffPaymentModal";

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const shiftMonth = (m, d) => {
  const [y, mo] = m.split("-").map(Number);
  const dt = new Date(y, mo - 1 + d, 1);
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}`;
};

export default function SalaryPage() {
  const { settings } = useSettings();
  const { data, today } = useData();
  const cur = settings.currency;
  const fmt = (v) => formatCurrency(v, cur);
  const [monthState, setMonth] = useState("");
  const month = monthState || (today ? today.slice(0, 7) : "");
  const [open, setOpen] = useState(null);
  const [modal, setModal] = useState({ open: false, payment: null, workerId: "", type: "advance" });
  const [del, setDel] = useState(null);
  const [busy, setBusy] = useState(false);
  const [showAll, setShowAll] = useState(false);

  const payroll = useMemo(
    () => (month ? computePayroll({ workers: data.workers, logs: data.production_logs, staffPayments: data.staff_payments, settings, month }) : { rows: [], totals: {} }),
    [data.workers, data.production_logs, data.staff_payments, settings, month]
  );
  const rows = payroll.rows.filter((r) => showAll || r.active || r.worker.status !== "inactive");
  const t = payroll.totals;
  const [y, m] = month ? month.split("-").map(Number) : [0, 1];

  async function removePayment() {
    setBusy(true);
    try { notifySaved(await deleteDocById("staff_payments", del.id), "Deleted"); setDel(null); }
    catch (e) { toast.error(errorMessage(e, "Could not delete")); }
    finally { setBusy(false); }
  }

  function exportExcel() {
    const out = rows.map((r) => ({
      Worker: r.worker.name, "Days present": r.daysPresent, "Overtime shifts": r.otShifts, "Per day": r.rate, "Basic pay": r.basic, "Overtime pay": r.otPay,
      "Earned this month": r.earned, "Carried from before": r.opening, "Advances taken": r.advances, "Salary paid": r.salaryPaid,
      "Net payable": r.closing >= 0 ? r.closing : 0, "Over-advance (owes)": r.overAdvance,
    }));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(out), month);
    XLSX.writeFile(wb, `salary_${month}.xlsx`);
  }

  if (!month) return null;
  return (
    <div className="space-y-6">
      <PageHeader
        title="Salary"
        description="Worked out automatically from who was on duty. Attendance comes from production entries."
        actions={
          <>
            <Button variant="secondary" onClick={() => window.print()}><Printer className="h-4 w-4" /> Print</Button>
            <Button variant="secondary" onClick={exportExcel}><FileSpreadsheet className="h-4 w-4" /> Excel</Button>
            <Button variant="secondary" onClick={() => setModal({ open: true, payment: null, workerId: "", type: "advance" })}><HandCoins className="h-4 w-4" /> Give advance</Button>
            <Button onClick={() => setModal({ open: true, payment: null, workerId: "", type: "salary" })}><Banknote className="h-4 w-4" /> Pay salary</Button>
          </>
        }
      />

      <div className="no-print flex flex-wrap items-center gap-2">
        <Button variant="secondary" size="sm" onClick={() => setMonth(shiftMonth(month, -1))} aria-label="Previous month"><ChevronLeft className="h-4 w-4" /></Button>
        <span className="min-w-[9rem] text-center font-display text-lg font-semibold">{MONTHS[m - 1]} {y}</span>
        <Button variant="secondary" size="sm" onClick={() => setMonth(shiftMonth(month, 1))} aria-label="Next month"><ChevronRight className="h-4 w-4" /></Button>
        <Input type="month" className="w-44" value={month} onChange={(e) => e.target.value && setMonth(e.target.value)} />
        <label className="ml-auto flex items-center gap-2 text-xs text-steel-500"><input type="checkbox" checked={showAll} onChange={(e) => setShowAll(e.target.checked)} /> Show inactive workers</label>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <StatCard label="Earned this month" value={fmt(t.earned ?? 0)} tone="blue" sub="Basic + overtime" />
        <StatCard label="Advances this month" value={fmt(t.advances ?? 0)} tone="amber" />
        <StatCard label="Salary paid this month" value={fmt(t.salaryPaid ?? 0)} tone="green" />
        <StatCard label="Still to pay (end of month)" value={fmt(t.payable ?? 0)} tone="red" valueTone={t.payable > 0 ? "red" : "default"} hint="What you owe workers, including unpaid earlier months." />
        <StatCard label="Over-advance" value={fmt(t.overAdvance ?? 0)} tone="amber" valueTone={t.overAdvance > 0 ? "red" : "default"} hint="Workers who took more than they earned." />
      </div>

      <Card>
        <CardHeader><CardTitle>Salary sheet · {MONTHS[m - 1]} {y}</CardTitle><span className="text-xs text-steel-400 no-print">Tap a row for the daily detail</span></CardHeader>
        <CardBody id="print-area" className="overflow-x-auto p-0">
          <table className="w-full text-sm">
            <thead className="bg-steel-50 text-left text-xs uppercase tracking-wide text-steel-400 dark:bg-steel-900">
              <tr>
                <th className="px-3 py-3">Worker</th>
                <th className="px-3 py-3 text-right">Days</th>
                <th className="px-3 py-3 text-right">Overtime</th>
                <th className="px-3 py-3 text-right">Earned</th>
                <th className="px-3 py-3 text-right">Carried</th>
                <th className="px-3 py-3 text-right">Advance</th>
                <th className="px-3 py-3 text-right">Paid</th>
                <th className="px-3 py-3 text-right">Net payable</th>
                <th className="no-print px-3 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const isOpen = open === r.worker.id;
                return (
                  <Fragment key={r.worker.id}>
                    <tr className="cursor-pointer border-t border-steel-100 hover:bg-steel-50/60 dark:border-steel-700 dark:hover:bg-steel-900/40" onClick={() => setOpen(isOpen ? null : r.worker.id)}>
                      <td className="px-3 py-3">
                        <div className="flex items-center gap-2">
                          {isOpen ? <ChevronUp className="no-print h-4 w-4 text-steel-400" /> : <ChevronDown className="no-print h-4 w-4 text-steel-400" />}
                          <div>
                            <Link href={`/workers/${r.worker.id}`} onClick={(e) => e.stopPropagation()} className="font-medium hover:underline">{r.worker.name}</Link>
                            <p className="text-xs text-steel-400">{fmt(r.rate)} / day{!r.worker.salary_amount && <span className="ml-1 text-gauge-600">· salary not set</span>}</p>
                          </div>
                          {r.worker.status === "inactive" && <Badge>Inactive</Badge>}
                        </div>
                      </td>
                      <td className="px-3 py-3 text-right font-mono">{r.daysPresent}</td>
                      <td className="px-3 py-3 text-right font-mono">{r.otShifts > 0 ? <>{r.otShifts} <span className="text-xs text-steel-400">({fmt(r.otPay)})</span></> : "—"}</td>
                      <td className="px-3 py-3 text-right font-mono">{fmt(r.earned)}</td>
                      <td className={`px-3 py-3 text-right font-mono ${r.opening < 0 ? "text-danger" : "text-steel-500"}`}>{Math.abs(r.opening) > 0.004 ? fmt(r.opening) : "—"}</td>
                      <td className="px-3 py-3 text-right font-mono text-gauge-700 dark:text-gauge-300">{r.advances > 0 ? `−${fmt(r.advances)}` : "—"}</td>
                      <td className="px-3 py-3 text-right font-mono text-ok">{r.salaryPaid > 0 ? `−${fmt(r.salaryPaid)}` : "—"}</td>
                      <td className="px-3 py-3 text-right">
                        {r.closing >= 0 ? (
                          <span className="font-mono font-bold">{fmt(r.closing)}</span>
                        ) : (
                          <span className="font-mono font-bold text-danger">{fmt(0)} <span className="block text-[11px] font-semibold">Owes {fmt(r.overAdvance)} (over-advance)</span></span>
                        )}
                      </td>
                      <td className="no-print px-3 py-3" onClick={(e) => e.stopPropagation()}>
                        <div className="flex justify-end gap-1">
                          <Button size="sm" variant="secondary" onClick={() => setModal({ open: true, payment: null, workerId: r.worker.id, type: "advance" })}>Advance</Button>
                          <Button size="sm" onClick={() => setModal({ open: true, payment: null, workerId: r.worker.id, type: "salary" })}>Pay</Button>
                        </div>
                      </td>
                    </tr>
                    {isOpen && (
                      <tr className="bg-steel-50/60 dark:bg-steel-900/40">
                        <td colSpan={9} className="px-4 py-4">
                          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
                            <div>
                              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-steel-400">Days present ({r.daysPresent})</p>
                              {r.days.length === 0 && <p className="text-sm text-steel-400">No duty this month.</p>}
                              <div className="flex flex-wrap gap-1.5">
                                {r.days.map((d) => (
                                  <span key={d.date} className={`rounded-md border px-2 py-1 text-xs ${d.ot ? "border-gauge-400 bg-gauge-50 text-gauge-700 dark:bg-gauge-900/20 dark:text-gauge-300" : "border-steel-200 dark:border-steel-700"}`} title={d.ot ? "Covered both shifts: overtime" : d.shifts.join(", ")}>
                                    {Number(d.date.slice(8))} · {d.shifts.map((s) => (s === "day" ? "D" : "N")).join("+")}{d.ot ? ` · OT ${fmt(d.otPay)}` : ""}
                                  </span>
                                ))}
                              </div>
                              <p className="mt-2 text-[11px] text-steel-400">D = day shift, N = night shift. Highlighted = covered both shifts that date (1 day + overtime).</p>
                            </div>
                            <div>
                              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-steel-400">Advances and payments this month</p>
                              {[...r.advanceList, ...r.salaryList].length === 0 && <p className="text-sm text-steel-400">Nothing paid this month.</p>}
                              <ul className="divide-y divide-steel-100 dark:divide-steel-700">
                                {[...r.advanceList, ...r.salaryList].sort((a, b) => (a.date < b.date ? -1 : 1)).map((p) => (
                                  <li key={p.id} className="flex items-center justify-between gap-2 py-2 text-sm">
                                    <span className="flex items-center gap-2">{formatDate(p.date)} <Badge tone={p.type === "advance" ? "amber" : "green"}>{p.type === "advance" ? "Advance" : "Salary"}</Badge> <span className="text-xs text-steel-400">{METHOD_LABEL[p.method] ?? ""}{p.note ? ` · ${p.note}` : ""}</span></span>
                                    <span className="flex items-center gap-1">
                                      <span className="font-mono">{fmt(p.amount)}</span>
                                      <button className="no-print rounded p-1 text-steel-400 hover:text-instrument-600" onClick={() => setModal({ open: true, payment: p, workerId: "", type: p.type })} aria-label="Edit"><Pencil className="h-3.5 w-3.5" /></button>
                                      <button className="no-print rounded p-1 text-steel-400 hover:text-danger" onClick={() => setDel(p)} aria-label="Delete"><Trash2 className="h-3.5 w-3.5" /></button>
                                    </span>
                                  </li>
                                ))}
                              </ul>
                              <p className="mt-3 rounded-lg bg-white p-3 text-xs text-steel-500 dark:bg-steel-800">
                                Net payable = carried {fmt(r.opening)} + earned {fmt(r.earned)} − advance {fmt(r.advances)} − paid {fmt(r.salaryPaid)} = <strong className="font-mono">{fmt(r.closing)}</strong>
                              </p>
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
              {rows.length === 0 && (
                <tr><td colSpan={9}><EmptyState icon={Users} title="No workers to show">Add workers with a joining date and salary on the Workers page. Attendance fills in from production entries.</EmptyState></td></tr>
              )}
            </tbody>
            {rows.length > 0 && (
              <tfoot className="border-t-2 border-steel-200 bg-steel-50 text-sm font-semibold dark:border-steel-700 dark:bg-steel-900">
                <tr>
                  <td className="px-3 py-3">Total</td>
                  <td className="px-3 py-3 text-right font-mono">{rows.reduce((s, r) => s + r.daysPresent, 0)}</td>
                  <td className="px-3 py-3 text-right font-mono">{rows.reduce((s, r) => s + r.otShifts, 0)}</td>
                  <td className="px-3 py-3 text-right font-mono">{fmt(rows.reduce((s, r) => s + r.earned, 0))}</td>
                  <td className="px-3 py-3" />
                  <td className="px-3 py-3 text-right font-mono">{fmt(rows.reduce((s, r) => s + r.advances, 0))}</td>
                  <td className="px-3 py-3 text-right font-mono">{fmt(rows.reduce((s, r) => s + r.salaryPaid, 0))}</td>
                  <td className="px-3 py-3 text-right font-mono">{fmt(rows.reduce((s, r) => s + Math.max(0, r.closing), 0))}</td>
                  <td className="no-print" />
                </tr>
              </tfoot>
            )}
          </table>
        </CardBody>
      </Card>

      <div className="no-print rounded-lg bg-steel-50 p-4 text-xs leading-relaxed text-steel-500 dark:bg-steel-900 dark:text-steel-400">
        <p className="mb-1 font-semibold text-steel-600 dark:text-steel-300">How this is worked out</p>
        A worker is <strong>present</strong> on a date when they are named on a production entry. Present = one day's pay (monthly salary ÷ {settings.salary_days_per_month}).
        If a worker covers <strong>both shifts</strong> on the same date (for example because a colleague didn't come), the second shift is <strong>overtime</strong> at {fmt(settings.overtime_rate)} per shift.
        Advances and salary payments are deducted. If a worker took more than they earned, the difference shows as an <strong>over-advance</strong> and is deducted from the following months. You can change the overtime rate and days per month in <Link href="/settings" className="underline">Settings</Link>.
      </div>

      <StaffPaymentModal open={modal.open} payment={modal.payment} workerId={modal.workerId} type={modal.type} onClose={() => setModal({ ...modal, open: false })} />
      <ConfirmDialog target={del} title="Delete this payment?" busy={busy} onCancel={() => setDel(null)} onConfirm={removePayment}>
        {del ? `${del.type === "advance" ? "Advance" : "Salary payment"} of ${fmt(del.amount)}` : ""} will be removed and the worker's balance and your available cash change accordingly.
      </ConfirmDialog>
    </div>
  );
}
