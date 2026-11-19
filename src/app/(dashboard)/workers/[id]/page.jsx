"use client";
import { useMemo, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft, CalendarCheck, Clock, Boxes } from "lucide-react";
import { useCollection } from "@/hooks/useCollection";
import { useSettings } from "@/contexts/SettingsContext";
import { formatCurrency, formatDate } from "@/lib/utils";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/Card";
import { GaugeStat } from "@/components/ui/GaugeStat";
import { useData } from "@/contexts/DataContext";
import { computePayroll } from "@/lib/payroll";
import { StaffPaymentModal } from "@/components/business/StaffPaymentModal";
import { Button } from "@/components/ui/Button";
function WorkerDetailPage() {
  const params = useParams();
  const router = useRouter();
  const { settings } = useSettings();
  const { data: all, today } = useData();
  const [payModal, setPayModal] = useState({ open: false, type: "advance", payment: null });
  const { data: workers, loading: workersLoading } = useCollection("workers");
  const { data: logs, loading: logsLoading } = useCollection("production_logs");
  const { data: machines } = useCollection("machines");
  const worker = workers.find((w) => w.id === params.id);
  const machineMap = useMemo(() => new Map(machines.map((m) => [m.id, m])), [machines]);
  const workerLogs = logs.filter((l) => l.worker1_id === params.id || l.worker2_id === params.id);
  const stats = useMemo(() => {
    const byDate = /* @__PURE__ */ new Map();
    workerLogs.forEach((l) => {
      const set = byDate.get(l.date) ?? /* @__PURE__ */ new Set();
      set.add(l.shift);
      byDate.set(l.date, set);
    });
    let workingDays = 0;
    let dutyDays = 0;
    let overtimeDays = 0;
    byDate.forEach((shifts) => {
      workingDays += 1;
      dutyDays += shifts.size;
      if (shifts.size >= 2) overtimeDays += 1;
    });
    const totalProduction = workerLogs.reduce((s, l) => s + l.total_quantity, 0);
    const totalBillContribution = workerLogs.reduce((s, l) => s + l.total_bill, 0);
    return { workingDays, dutyDays, overtimeDays, totalProduction, totalBillContribution };
  }, [workerLogs]);
  const payrollRow = useMemo(() => {
    if (!worker || !today) return null;
    return computePayroll({ workers: [worker], logs: all.production_logs, staffPayments: all.staff_payments, settings, month: today.slice(0, 7) }).rows[0];
  }, [worker, all.production_logs, all.staff_payments, settings, today]);
  if (workersLoading || logsLoading) {
    return <p className="text-sm text-steel-400">Loading worker profile…</p>;
  }
  if (!worker) {
    return <div className="space-y-4">
        <Button variant="secondary" onClick={() => router.push("/workers")}><ArrowLeft className="h-4 w-4" /> Back</Button>
        <p className="text-sm text-steel-400">Worker not found.</p>
      </div>;
  }
  return <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Button variant="secondary" size="sm" onClick={() => router.push("/workers")}><ArrowLeft className="h-4 w-4" /></Button>
        <div>
          <h1 className="font-display text-2xl font-bold text-steel-800 dark:text-steel-50">{worker.name}</h1>
          <p className="text-sm text-steel-500 dark:text-steel-400">{worker.phone || "No phone"} · Joined {worker.joining_date ? formatDate(worker.joining_date) : "(date not set)"}</p>
        </div>
        <span className={"ml-auto rounded-full px-2.5 py-1 text-xs font-semibold " + (worker.status === "active" ? "bg-ok/10 text-ok" : "bg-steel-200 text-steel-600 dark:bg-steel-700")}>
          {worker.status}
        </span>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <GaugeStat label="Working Days" value={`${stats.workingDays}`} icon={CalendarCheck} tone="instrument" fill={Math.min(100, stats.workingDays * 3)} />
        <GaugeStat label="Duty Days" value={`${stats.dutyDays}`} subvalue="shifts worked" icon={Clock} tone="gauge" fill={Math.min(100, stats.dutyDays * 3)} />
        <GaugeStat label="Overtime Days" value={`${stats.overtimeDays}`} subvalue="day + night same date" icon={Clock} tone="ok" fill={Math.min(100, stats.overtimeDays * 6)} />
        <GaugeStat label="Total Production" value={stats.totalProduction.toLocaleString()} subvalue="pieces assisted" icon={Boxes} tone="instrument" fill={Math.min(100, stats.totalProduction / 20)} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Salary this month</CardTitle>
          <div className="flex gap-2">
            <Button size="sm" variant="secondary" onClick={() => setPayModal({ open: true, type: "advance", payment: null })}>Give advance</Button>
            <Button size="sm" onClick={() => setPayModal({ open: true, type: "salary", payment: null })}>Pay salary</Button>
          </div>
        </CardHeader>
        <CardBody>
          {payrollRow ? (
            <div className="grid grid-cols-2 gap-4 text-sm sm:grid-cols-5">
              <Mini label="Days present" value={payrollRow.daysPresent} />
              <Mini label="Overtime shifts" value={payrollRow.otShifts} />
              <Mini label="Earned" value={formatCurrency(payrollRow.earned, settings.currency)} />
              <Mini label="Advances + paid" value={formatCurrency(payrollRow.advances + payrollRow.salaryPaid, settings.currency)} />
              <Mini label={payrollRow.closing < 0 ? "Over-advance (owes)" : "Net payable"} value={formatCurrency(Math.abs(payrollRow.closing), settings.currency)} danger={payrollRow.closing < 0} />
            </div>
          ) : null}
          <p className="mt-3 text-xs text-steel-400">Full month-by-month sheet on the <Link href="/salary" className="text-instrument-600 underline dark:text-gauge-300">Salary page</Link>. Pay per day {formatCurrency(payrollRow?.rate ?? 0, settings.currency)}.</p>
        </CardBody>
      </Card>
      <StaffPaymentModal open={payModal.open} workerId={worker.id} type={payModal.type} payment={payModal.payment} onClose={() => setPayModal({ ...payModal, open: false })} />

      <Card>
        <CardHeader><CardTitle>Production Value Contributed</CardTitle></CardHeader>
        <CardBody>
          <p className="font-display text-3xl font-bold text-instrument-600 dark:text-gauge-300">
            {formatCurrency(stats.totalBillContribution, settings.currency)}
          </p>
          <p className="mt-1 text-xs text-steel-400">
            Estimated value of the shifts this worker took part in (counted pieces × price). Not wages and not money received.
          </p>
        </CardBody>
      </Card>

      <Card>
        <CardHeader><CardTitle>Recent Production</CardTitle></CardHeader>
        <CardBody className="overflow-x-auto p-0">
          <table className="w-full text-sm">
            <thead className="bg-steel-50 text-left text-xs uppercase tracking-wide text-steel-400 dark:bg-steel-900">
              <tr>
                <th className="px-4 py-3">Date</th>
                <th className="px-4 py-3">Shift</th>
                <th className="px-4 py-3">Machine</th>
                <th className="px-4 py-3 text-right">Qty</th>
                <th className="px-4 py-3 text-right">Value</th>
              </tr>
            </thead>
            <tbody>
              {workerLogs.slice(0, 10).map((log) => <tr key={log.id} className="border-t border-steel-100 dark:border-steel-700">
                  <td className="px-4 py-3">{formatDate(log.date)}</td>
                  <td className="px-4 py-3 capitalize">{log.shift}</td>
                  <td className="px-4 py-3">{machineMap.get(log.machine_id)?.name ?? "\u2014"}</td>
                  <td className="px-4 py-3 text-right font-mono">{log.total_quantity}</td>
                  <td className="px-4 py-3 text-right font-mono">{formatCurrency(log.total_bill, settings.currency)}</td>
                </tr>)}
              {workerLogs.length === 0 && <tr><td colSpan={5} className="px-4 py-8 text-center text-steel-400">No production logged for this worker yet.</td></tr>}
            </tbody>
          </table>
        </CardBody>
      </Card>
    </div>;
}
function Mini({ label, value, danger }) {
  return (
    <div>
      <p className="text-[11px] uppercase tracking-wide text-steel-400">{label}</p>
      <p className={`font-mono text-lg font-semibold ${danger ? "text-danger" : ""}`}>{value}</p>
    </div>
  );
}
export {
  WorkerDetailPage as default
};
