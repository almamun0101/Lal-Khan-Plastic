"use client";
import { useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft, Plus, Wallet, Pencil, Printer, FileSpreadsheet } from "lucide-react";
import * as XLSX from "xlsx";
import { toast } from "sonner";
import { useData } from "@/contexts/DataContext";
import { useSettings } from "@/contexts/SettingsContext";
import { clientLedger } from "@/lib/finance";
import { deleteDocById, errorMessage, logActivity, notifySaved } from "@/lib/firestore-service";
import { formatCurrency, formatDate } from "@/lib/utils";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { StatCard } from "@/components/ui/StatCard";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { OrdersTable, PaymentsTable } from "@/components/business/Tables";
import { MethodBadge } from "@/components/business/badges";
import { OrderFormModal } from "@/components/business/OrderFormModal";
import { PaymentFormModal } from "@/components/business/PaymentFormModal";
import { ClientFormModal } from "@/components/business/ClientFormModal";

export default function ClientDetailPage() {
  const { id } = useParams();
  const router = useRouter();
  const { settings } = useSettings();
  const { data, biz, loading, clientById } = useData();
  const cur = settings.currency;
  const [orderModal, setOrderModal] = useState(false);
  const [payModal, setPayModal] = useState({ open: false, payment: null });
  const [editModal, setEditModal] = useState(false);
  const [delPay, setDelPay] = useState(null);
  const [busy, setBusy] = useState(false);

  const client = clientById.get(id);
  const stat = biz.clientStats.find((c) => c.id === id);
  const orderRows = useMemo(() => biz.orderRows.filter((r) => r.client.id === id).sort((a, b) => ((a.order.order_date ?? "") < (b.order.order_date ?? "") ? 1 : -1)), [biz.orderRows, id]);
  const payments = useMemo(() => data.payments.filter((p) => p.client_id === id), [data.payments, id]);
  const ledger = useMemo(() => clientLedger(data.sales_orders.filter((o) => o.client_id === id), payments), [data.sales_orders, payments, id]);
  const orderById = useMemo(() => new Map(data.sales_orders.map((o) => [o.id, o])), [data.sales_orders]);

  if (loading) return <p className="text-sm text-steel-400">Loading client…</p>;
  if (!client || !stat) {
    return (
      <div className="space-y-4">
        <Button variant="secondary" onClick={() => router.push("/clients")}><ArrowLeft className="h-4 w-4" /> Back</Button>
        <p className="text-sm text-steel-400">Client not found.</p>
      </div>
    );
  }

  async function removePayment() {
    setBusy(true);
    try {
      notifySaved(await deleteDocById("payments", delPay.id), "Payment deleted");
      logActivity("deleted", "payment", `${client.name}: ${formatCurrency(delPay.amount, cur)} on ${delPay.date}`);
      setDelPay(null);
    } catch (e) {
      toast.error(errorMessage(e, "Could not delete the payment"));
    } finally {
      setBusy(false);
    }
  }

  function exportStatement() {
    const rows = ledger.map((e) => ({ Date: e.date, Type: e.kind === "order" ? "Order" : "Payment", Reference: e.ref, Method: e.method ?? "", Billed: e.debit || "", Paid: e.credit || "", Balance: e.balance }));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), "Statement");
    XLSX.writeFile(wb, `statement_${client.name.replace(/\W+/g, "-")}.xlsx`);
  }

  return (
    <div className="space-y-6">
      <div className="no-print flex flex-wrap items-center gap-3">
        <Button variant="secondary" size="sm" onClick={() => router.push("/clients")} aria-label="Back"><ArrowLeft className="h-4 w-4" /></Button>
        <div className="min-w-0">
          <h1 className="font-display text-2xl font-bold text-steel-800 dark:text-steel-50">{client.name}</h1>
          <p className="text-sm text-steel-500">{[client.phone, client.email, client.address].filter(Boolean).join(" · ") || "No contact details yet"}</p>
        </div>
        {client.status === "inactive" && <Badge>Inactive</Badge>}
        <div className="ml-auto flex flex-wrap gap-2">
          <Button variant="secondary" size="sm" onClick={() => setEditModal(true)}><Pencil className="h-4 w-4" /> Edit</Button>
          <Button variant="secondary" size="sm" onClick={() => window.print()}><Printer className="h-4 w-4" /> Print statement</Button>
          <Button variant="secondary" size="sm" onClick={exportStatement}><FileSpreadsheet className="h-4 w-4" /> Excel</Button>
          <Button size="sm" onClick={() => setPayModal({ open: true, payment: null })}><Wallet className="h-4 w-4" /> Record payment</Button>
          <Button size="sm" onClick={() => setOrderModal(true)}><Plus className="h-4 w-4" /> New order</Button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5 no-print">
        <StatCard label="Total billed" value={formatCurrency(stat.billed, cur)} sub={`${stat.orders_count} orders`} tone="blue" />
        <StatCard label="Total paid" value={formatCurrency(stat.received, cur)} sub={`${stat.payments_count} payments`} tone="green" valueTone="green" />
        <StatCard label="Due now" value={formatCurrency(stat.due, cur)} tone="red" valueTone={stat.due > 0.004 ? "red" : "default"} sub={stat.overdue_count ? `${formatCurrency(stat.overdue_amount, cur)} overdue` : "Nothing overdue"} />
        <StatCard label="Advance held" value={formatCurrency(stat.credit, cur)} tone="amber" hint="Paid beyond current bills; used on next orders." />
        <StatCard label="Credit limit" value={client.credit_limit > 0 ? formatCurrency(client.credit_limit, cur) : "None"} tone={stat.over_limit ? "red" : "gray"} valueTone={stat.over_limit ? "red" : "default"} sub={stat.over_limit ? "Over the limit" : undefined} />
      </div>

      <div id="print-area" className="space-y-6">
        <div className="hidden print:block">
          <h2 className="text-xl font-bold">{settings.factory_name}: Statement for {client.name}</h2>
          <p className="text-sm">{settings.business_phone} {settings.business_address}</p>
          <p className="text-sm">Due now: {formatCurrency(stat.due, cur)}</p>
        </div>

        <Card className="no-print">
          <CardHeader><CardTitle>Orders</CardTitle></CardHeader>
          <CardBody className="overflow-x-auto p-0"><OrdersTable rows={orderRows} showClient={false} empty="No orders for this client yet." /></CardBody>
        </Card>

        <Card className="no-print">
          <CardHeader><CardTitle>Payment history</CardTitle></CardHeader>
          <CardBody className="overflow-x-auto p-0">
            <PaymentsTable payments={payments} clientById={clientById} orderById={orderById} showClient={false} onEdit={(p) => setPayModal({ open: true, payment: p })} onDelete={setDelPay} />
          </CardBody>
        </Card>

        <Card>
          <CardHeader><CardTitle>Account statement</CardTitle><span className="text-xs text-steel-400">Positive balance = client owes you</span></CardHeader>
          <CardBody className="overflow-x-auto p-0">
            <table className="w-full text-sm">
              <thead className="bg-steel-50 text-left text-xs uppercase tracking-wide text-steel-400 dark:bg-steel-900">
                <tr><th className="px-4 py-3">Date</th><th className="px-4 py-3">Details</th><th className="px-4 py-3 text-right">Billed</th><th className="px-4 py-3 text-right">Paid</th><th className="px-4 py-3 text-right">Balance</th></tr>
              </thead>
              <tbody>
                {ledger.map((e) => (
                  <tr key={`${e.kind}-${e.id}`} className="border-t border-steel-100 dark:border-steel-700">
                    <td className="px-4 py-2.5 whitespace-nowrap">{formatDate(e.date)}</td>
                    <td className="px-4 py-2.5">{e.kind === "order" ? <>Order <span className="font-mono text-xs">{e.ref}</span></> : <span className="flex items-center gap-2">Payment <MethodBadge method={e.method} /> {e.ref && <span className="text-xs text-steel-400">{e.ref}</span>}</span>}</td>
                    <td className="px-4 py-2.5 text-right font-mono">{e.debit ? formatCurrency(e.debit, cur) : ""}</td>
                    <td className="px-4 py-2.5 text-right font-mono text-ok">{e.credit ? formatCurrency(e.credit, cur) : ""}</td>
                    <td className="px-4 py-2.5 text-right font-mono font-semibold">{formatCurrency(e.balance, cur)}</td>
                  </tr>
                ))}
                {ledger.length === 0 && <tr><td colSpan={5} className="px-4 py-8 text-center text-steel-400">No activity yet.</td></tr>}
              </tbody>
            </table>
          </CardBody>
        </Card>
      </div>

      <OrderFormModal open={orderModal} onClose={() => setOrderModal(false)} clientId={id} />
      <PaymentFormModal open={payModal.open} payment={payModal.payment} clientId={id} onClose={() => setPayModal({ open: false, payment: null })} />
      <ClientFormModal open={editModal} client={client} onClose={() => setEditModal(false)} />
      <ConfirmDialog target={delPay} title="Delete payment?" busy={busy} onCancel={() => setDelPay(null)} onConfirm={removePayment}>
        This removes the payment of {delPay ? formatCurrency(delPay.amount, cur) : ""} and increases what the client owes. This can't be undone.
      </ConfirmDialog>
    </div>
  );
}
