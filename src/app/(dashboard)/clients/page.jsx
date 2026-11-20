"use client";
import { useMemo, useState } from "react";
import Link from "next/link";
import { Plus, Search, Pencil, Trash2, UserRound } from "lucide-react";
import { toast } from "sonner";
import { useData } from "@/contexts/DataContext";
import { useSettings } from "@/contexts/SettingsContext";
import { deleteDocById, errorMessage, logActivity, notifySaved } from "@/lib/firestore-service";
import { formatCurrency, formatDate } from "@/lib/utils";
import { Card, CardBody } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { PageHeader } from "@/components/ui/PageHeader";
import { StatCard } from "@/components/ui/StatCard";
import { EmptyState } from "@/components/ui/EmptyState";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { ClientFormModal } from "@/components/business/ClientFormModal";

export default function ClientsPage() {
  const { settings } = useSettings();
  const { biz, data, loading } = useData();
  const cur = settings.currency;
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("all");
  const [modal, setModal] = useState({ open: false, client: null });
  const [deleting, setDeleting] = useState(null);
  const [busy, setBusy] = useState(false);

  const rows = useMemo(() => {
    const s = search.trim().toLowerCase();
    return biz.clientStats
      .filter((c) => !c.client.missing)
      .filter((c) => {
        if (filter === "due" && c.due <= 0.004) return false;
        if (filter === "overdue" && c.overdue_count === 0) return false;
        if (filter === "clear" && c.due > 0.004) return false;
        if (s && ![c.client.name, c.client.phone, c.client.email].join(" ").toLowerCase().includes(s)) return false;
        return true;
      })
      .sort((a, b) => b.due - a.due || String(a.client.name).localeCompare(String(b.client.name)));
  }, [biz.clientStats, search, filter]);

  async function confirmDelete() {
    if (!deleting) return;
    setBusy(true);
    try {
      notifySaved(await deleteDocById("clients", deleting.id), "Client deleted");
      logActivity("deleted", "client", deleting.name);
      setDeleting(null);
    } catch (e) {
      toast.error(errorMessage(e, "Could not delete the client"));
    } finally {
      setBusy(false);
    }
  }
  const hasActivity = (c) => c.orders_count + c.cancelled_count + c.payments_count > 0;

  return (
    <div className="space-y-4">
      <PageHeader title="Clients" description="Every client has their own account with orders, payments and what they owe." actions={<Button onClick={() => setModal({ open: true, client: null })}><Plus className="h-4 w-4" /> Add Client</Button>} />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Clients" value={data.clients.length} icon={UserRound} tone="blue" />
        <StatCard label="Total billed" value={formatCurrency(biz.salesTotal, cur)} tone="blue" />
        <StatCard label="Received" value={formatCurrency(biz.receivedTotal, cur)} tone="green" valueTone="green" />
        <StatCard label="Outstanding" value={formatCurrency(biz.receivables, cur)} tone="red" valueTone={biz.receivables > 0 ? "red" : "default"} />
      </div>

      <Card>
        <CardBody className="flex flex-col gap-3 sm:flex-row">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-steel-400" />
            <Input className="pl-9" placeholder="Search name, phone, email…" value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          <Select className="sm:w-48" value={filter} onChange={(e) => setFilter(e.target.value)}>
            <option value="all">All clients</option>
            <option value="due">Owing money</option>
            <option value="overdue">Overdue</option>
            <option value="clear">Fully paid</option>
          </Select>
        </CardBody>
      </Card>

      <Card>
        <CardBody className="overflow-x-auto p-0">
          <table className="w-full text-sm">
            <thead className="bg-steel-50 text-left text-xs uppercase tracking-wide text-steel-400 dark:bg-steel-900">
              <tr>
                <th className="px-4 py-3">Client</th><th className="px-4 py-3">Phone</th>
                <th className="px-4 py-3 text-right">Orders</th><th className="px-4 py-3 text-right">Billed</th>
                <th className="px-4 py-3 text-right">Paid</th><th className="px-4 py-3 text-right">Due</th>
                <th className="px-4 py-3">Last payment</th><th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((c) => (
                <tr key={c.id} className="border-t border-steel-100 dark:border-steel-700">
                  <td className="px-4 py-3">
                    <Link href={`/clients/${c.id}`} className="font-medium text-instrument-600 hover:underline dark:text-gauge-300">{c.client.name}</Link>
                    <div className="mt-0.5 flex gap-1">
                      {c.client.status === "inactive" && <Badge>Inactive</Badge>}
                      {c.overdue_count > 0 && <Badge tone="red">{c.overdue_count} overdue</Badge>}
                      {c.over_limit && <Badge tone="amber">Over limit</Badge>}
                      {c.credit > 0.004 && <Badge tone="green">Advance {formatCurrency(c.credit, cur)}</Badge>}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-steel-500">{c.client.phone || "—"}</td>
                  <td className="px-4 py-3 text-right font-mono">{c.orders_count}</td>
                  <td className="px-4 py-3 text-right font-mono">{formatCurrency(c.billed, cur)}</td>
                  <td className="px-4 py-3 text-right font-mono text-ok">{formatCurrency(c.received, cur)}</td>
                  <td className={`px-4 py-3 text-right font-mono ${c.due > 0.004 ? "font-semibold text-danger" : "text-steel-400"}`}>{formatCurrency(c.due, cur)}</td>
                  <td className="px-4 py-3 whitespace-nowrap text-steel-500">{c.last_payment_date ? formatDate(c.last_payment_date) : "—"}</td>
                  <td className="px-4 py-3">
                    <div className="flex justify-end gap-1">
                      <button onClick={() => setModal({ open: true, client: c.client })} className="rounded-md p-1.5 text-steel-400 hover:bg-steel-100 hover:text-instrument-600 dark:hover:bg-steel-700" aria-label="Edit"><Pencil className="h-4 w-4" /></button>
                      <button onClick={() => (hasActivity(c) ? toast.error("This client has orders or payments, so it can't be deleted. Mark it Inactive instead.") : setDeleting(c.client))} className="rounded-md p-1.5 text-steel-400 hover:bg-danger/10 hover:text-danger" aria-label="Delete"><Trash2 className="h-4 w-4" /></button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {!loading && rows.length === 0 && (
            <EmptyState icon={UserRound} title={data.clients.length ? "No clients match." : "No clients yet"} action={!data.clients.length && <Button onClick={() => setModal({ open: true, client: null })}><Plus className="h-4 w-4" /> Add your first client</Button>}>
              {!data.clients.length && "Add a client, then create orders and record their payments."}
            </EmptyState>
          )}
        </CardBody>
      </Card>

      <ClientFormModal open={modal.open} client={modal.client} onClose={() => setModal({ open: false, client: null })} />
      <ConfirmDialog target={deleting} title="Delete client?" busy={busy} onCancel={() => setDeleting(null)} onConfirm={confirmDelete}>
        "{deleting?.name}" has no orders or payments and will be removed permanently.
      </ConfirmDialog>
    </div>
  );
}
