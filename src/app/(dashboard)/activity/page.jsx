"use client";
import { useMemo, useState } from "react";
import { History } from "lucide-react";
import { useData } from "@/contexts/DataContext";
import { Card, CardBody } from "@/components/ui/Card";
import { Select } from "@/components/ui/Select";
import { Badge } from "@/components/ui/Badge";
import { PageHeader } from "@/components/ui/PageHeader";
import { EmptyState } from "@/components/ui/EmptyState";

const TONE = { deleted: "red", cancelled: "red", edited: "amber", reopened: "blue" };
const stamp = (ms) => {
  const d = new Date(Number(ms));
  if (!Number.isFinite(d.getTime())) return "—";
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getDate()} ${["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][d.getMonth()]} ${d.getFullYear()}, ${p(d.getHours())}:${p(d.getMinutes())}`;
};

export default function ActivityPage() {
  const { data, loaded, errors } = useData();
  const [entity, setEntity] = useState("");
  const entities = useMemo(() => [...new Set(data.activity_log.map((a) => a.entity))].sort(), [data.activity_log]);
  const rows = data.activity_log.filter((a) => !entity || a.entity === entity).slice(0, 300);

  return (
    <div className="space-y-4">
      <PageHeader title="Activity Log" description="Who edited, cancelled or deleted payments, expenses, salary payments, orders and production entries. Entries can't be changed or removed." />
      <Card><CardBody>
        <Select className="sm:w-60" value={entity} onChange={(e) => setEntity(e.target.value)}>
          <option value="">Everything</option>
          {entities.map((e) => <option key={e} value={e}>{e}</option>)}
        </Select>
      </CardBody></Card>
      <Card>
        <CardBody className="overflow-x-auto p-0">
          <table className="w-full text-sm">
            <thead className="bg-steel-50 text-left text-xs uppercase tracking-wide text-steel-400 dark:bg-steel-900">
              <tr><th className="px-4 py-3">When</th><th className="px-4 py-3">Who</th><th className="px-4 py-3">What</th><th className="px-4 py-3">Details</th></tr>
            </thead>
            <tbody>
              {rows.map((a) => (
                <tr key={a.id} className="border-t border-steel-100 dark:border-steel-700">
                  <td className="whitespace-nowrap px-4 py-3 text-steel-500">{stamp(a.at)}</td>
                  <td className="px-4 py-3">{a.by || "—"}</td>
                  <td className="px-4 py-3"><Badge tone={TONE[a.action] ?? "gray"}>{a.action || "event"}</Badge> <span className="ml-1">{a.entity || "Other"}</span></td>
                  <td className="px-4 py-3 text-steel-600 dark:text-steel-300">{a.summary || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {errors.activity_log && (
            <div className="m-4 rounded-lg border border-danger/30 bg-danger/5 p-4 text-sm text-danger" role="alert">
              Activity history could not be loaded. Check the signed-in account and publish the current firestore.rules to the Firebase project used by this deployment.
            </div>
          )}
          {!errors.activity_log && loaded.activity_log && rows.length === 0 && <EmptyState icon={History} title="Nothing logged yet">Edits and deletions will appear here.</EmptyState>}
        </CardBody>
      </Card>
    </div>
  );
}
