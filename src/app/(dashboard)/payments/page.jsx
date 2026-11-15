"use client";
import { useMemo, useState } from "react";
import { Plus, FileSpreadsheet } from "lucide-react";
import * as XLSX from "xlsx";
import { toast } from "sonner";
import { useData } from "@/contexts/DataContext";
import { useSettings } from "@/contexts/SettingsContext";
import { PAYMENT_METHODS, METHOD_LABEL } from "@/lib/constants";
import { deleteDocById, errorMessage, notifySaved } from "@/lib/firestore-service";
import { addDays, formatCurrency, round2 } from "@/lib/utils";
import { Card, CardBody } from "@/components/ui/Card";
import { Input, Label } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Button } from "@/components/ui/Button";
import { PageHeader } from "@/components/ui/PageHeader";
import { StatCard } from "@/components/ui/StatCard";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { PaymentsTable } from "@/components/business/Tables";
import { PaymentFormModal } from "@/components/business/PaymentFormModal";

export default function PaymentsPage() {
  const { settings } = useSettings();
  const { data, biz, today, clientById } = useData();
  const cur = settings.currency;
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [method, setMethod] = useState("");
  const [client, setClient] = useState("");
  const [modal, setModal] = useState({ open: false, payment: null });
  const [del, setDel] = useState(null);
  const [busy, setBusy] = useState(false);
  const [page, setPage] = useState(1);

  const filtered = useMemo(
    () => data.payments.filter((p) => (!from || p.date >= from) && (!to || p.date <= to) && (!method || p.method === method) && (!client || p.client_id === client)),
    [data.payments, from, to, method, client]
  );
  const total = round2(filtered.reduce((s, p) => s + Number(p.amount || 0), 0));
  const byMethod = useMemo(() => {
    const m = { cash: 0, bkash: 0, bank: 0, other: 0 };
    filtered.forEach((p) => { const k = m[p.method] !== undefined ? p.method : "other"; m[k] = round2(m[k] + Number(p.amount || 0)); });
    return m;
  }, [filtered]);
  const orderById = useMemo(() => new Map(data.sales_orders.map((o) => [o.id, o])), [data.sales_orders]);
  const paged = filtered.slice((page - 1) * 25, page * 25);
  const pages = Math.max(1, Math.ceil(filtered.length / 25));

  function exportExcel() {
    const rows = filtered.map((p) => ({ Date: p.date, Client: clientById.get(p.client_id)?.name ?? "", Order: orderById.get(p.order_id)?.order_no ?? (p.order_id ? "(removed)" : "On account"), Method: METHOD_LABEL[p.method] ?? p.method, Amount: p.amount, Reference: p.reference ?? "", Notes: p.notes ?? "" }));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), "Payments");
    XLSX.writeFile(wb, "payments.xlsx");
  }
  async function remove() {
    setBusy(true);
    try { notifySaved(await deleteDocById("payments", del.id), "Payment deleted"); setDel(null); }
    catch (e) { toast.error(errorMessage(e, "Could not delete the payment")); }
    finally { setBusy(false); }
  }
  const quick = (days) => { setFrom(days === 0 ? today : addDays(today, -days)); setTo(today); setPage(1); };

  return (
    <div className="space-y-4">
      <PageHeader title="Payments" description="Every payment received, with date, client and method." actions={<><Button variant="secondary" onClick={exportExcel}><FileSpreadsheet className="h-4 w-4" /> Excel</Button><Button onClick={() => setModal({ open: true, payment: null })}><Plus className="h-4 w-4" /> Record Payment</Button></>} />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <StatCard label={from || to || method || client ? "Received (filtered)" : "Total received"} value={formatCurrency(total, cur)} sub={`${filtered.length} payments`} tone="green" valueTone="green" />
        {PAYMENT_METHODS.map((m) => <StatCard key={m.value} label={m.label} value={formatCurrency(byMethod[m.value], cur)} tone="gray" />)}
      </div>
      <Card>
        <CardBody className="grid grid-cols-2 gap-3 lg:grid-cols-5">
          <div><Label>From</Label><Input type="date" value={from} onChange={(e) => { setFrom(e.target.value); setPage(1); }} /></div>
          <div><Label>To</Label><Input type="date" value={to} onChange={(e) => { setTo(e.target.value); setPage(1); }} /></div>
          <div><Label>Method</Label><Select value={method} onChange={(e) => { setMethod(e.target.value); setPage(1); }}><option value="">All methods</option>{PAYMENT_METHODS.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}</Select></div>
          <div><Label>Client</Label><Select value={client} onChange={(e) => { setClient(e.target.value); setPage(1); }}><option value="">All clients</option>{data.clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</Select></div>
          <div className="col-span-2 flex flex-wrap items-end gap-2 lg:col-span-1">
            <Button size="sm" variant="secondary" onClick={() => quick(0)}>Today</Button>
            <Button size="sm" variant="secondary" onClick={() => quick(6)}>7 days</Button>
            <Button size="sm" variant="secondary" onClick={() => quick(29)}>30 days</Button>
            <Button size="sm" variant="ghost" onClick={() => { setFrom(""); setTo(""); setMethod(""); setClient(""); }}>Clear</Button>
          </div>
        </CardBody>
      </Card>
      <Card>
        <CardBody className="overflow-x-auto p-0">
          <PaymentsTable payments={paged} clientById={clientById} orderById={orderById} onEdit={(p) => setModal({ open: true, payment: p })} onDelete={setDel} />
        </CardBody>
      </Card>
      {pages > 1 && (
        <div className="flex items-center justify-between text-sm text-steel-500">
          <span>Page {page} of {pages}</span>
          <div className="flex gap-2"><Button variant="secondary" size="sm" disabled={page === 1} onClick={() => setPage((p) => p - 1)}>Previous</Button><Button variant="secondary" size="sm" disabled={page === pages} onClick={() => setPage((p) => p + 1)}>Next</Button></div>
        </div>
      )}
      <p className="text-xs text-steel-400">Payments not tied to an order automatically settle the client's oldest unpaid order first.</p>
      <PaymentFormModal open={modal.open} payment={modal.payment} onClose={() => setModal({ open: false, payment: null })} />
      <ConfirmDialog target={del} title="Delete payment?" busy={busy} onCancel={() => setDel(null)} onConfirm={remove}>
        This removes the payment of {del ? formatCurrency(del.amount, cur) : ""} and increases what the client owes. Use "Edit" if you only need to correct it.
      </ConfirmDialog>
    </div>
  );
}
