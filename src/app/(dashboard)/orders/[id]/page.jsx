"use client";
import { useMemo, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft, Pencil, Printer, Truck, Wallet, Ban, RotateCcw, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { useData } from "@/contexts/DataContext";
import { useSettings } from "@/contexts/SettingsContext";
import { ORDER_STATUSES } from "@/lib/constants";
import { statusPatch, normalizeOrder, orderTotal, effectiveStatus, deliveryProgress, orderProductCost, orderProfit } from "@/lib/finance";
import { deleteDocById, errorMessage, logActivity, notifySaved, updateDocById } from "@/lib/firestore-service";
import { formatCurrency, formatDate } from "@/lib/utils";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Select } from "@/components/ui/Select";
import { StatCard } from "@/components/ui/StatCard";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { StatusBadge, PayBadge, MethodBadge } from "@/components/business/badges";
import { OrderFormModal } from "@/components/business/OrderFormModal";
import { PaymentFormModal } from "@/components/business/PaymentFormModal";
import { DeliveryModal } from "@/components/business/DeliveryModal";

export default function OrderDetailPage() {
  const { id } = useParams();
  const router = useRouter();
  const { settings } = useSettings();
  const { data, biz, loading, today, clientById } = useData();
  const cur = settings.currency;
  const [edit, setEdit] = useState(false);
  const [pay, setPay] = useState(false);
  const [delivery, setDelivery] = useState(false);
  const [confirm, setConfirm] = useState(null); // "cancel" | "delete" | "reopen"
  const [busy, setBusy] = useState(false);

  const order = useMemo(() => data.sales_orders.find((o) => o.id === id), [data.sales_orders, id]);
  const row = biz.orderRowById.get(id); // undefined for cancelled orders
  const client = order ? clientById.get(order.client_id) : null;
  const linkedPayments = useMemo(() => data.payments.filter((p) => p.order_id === id), [data.payments, id]);

  if (loading) return <p className="text-sm text-steel-400">Loading order…</p>;
  if (!order) {
    return (
      <div className="space-y-4">
        <Button variant="secondary" onClick={() => router.push("/orders")}><ArrowLeft className="h-4 w-4" /> Back</Button>
        <p className="text-sm text-steel-400">Order not found. It may have been deleted.</p>
      </div>
    );
  }

  const n = normalizeOrder(order);
  const cancelled = order.status === "cancelled";
  const status = effectiveStatus(order);
  const total = orderTotal(order);
  const progress = deliveryProgress(order);
  const paid = row?.paid ?? 0;
  const due = row?.due ?? 0;
  const subtotal = n.items.reduce((s, i) => s + i.qty * i.unit_price, 0);

  async function changeStatus(next) {
    if (next === status) return;
    try {
      notifySaved(await updateDocById("sales_orders", order.id, { ...statusPatch(order, next, today), updated_at: Date.now() }), `Status set to ${next.replace("_", " ")}`);
    } catch (e) {
      toast.error(errorMessage(e, "Could not change the status"));
    }
  }

  async function runConfirm() {
    setBusy(true);
    try {
      if (confirm === "cancel") notifySaved(await updateDocById("sales_orders", order.id, { status: "cancelled", cancelled_at: Date.now(), updated_at: Date.now() }), "Order cancelled");
      if (confirm === "cancel") logActivity("cancelled", "order", `${order.order_no} (${formatCurrency(total, cur)})`);
      if (confirm === "reopen") notifySaved(await updateDocById("sales_orders", order.id, { status: "pending", updated_at: Date.now() }), "Order reopened");
      if (confirm === "reopen") logActivity("reopened", "order", order.order_no);
      if (confirm === "delete") {
        await deleteDocById("sales_orders", order.id);
        logActivity("deleted", "order", `${order.order_no} (${formatCurrency(total, cur)})`);
        toast.success("Order deleted");
        router.replace("/orders");
        return;
      }
      setConfirm(null);
    } catch (e) {
      toast.error(errorMessage(e, "That didn't work"));
    } finally {
      setBusy(false);
    }
  }

  const canDelete = linkedPayments.length === 0;

  return (
    <div className="space-y-6">
      <div className="no-print flex flex-wrap items-center gap-3">
        <Button variant="secondary" size="sm" onClick={() => router.push("/orders")} aria-label="Back"><ArrowLeft className="h-4 w-4" /></Button>
        <div>
          <h1 className="font-display text-2xl font-bold text-steel-800 dark:text-steel-50">{order.order_no ?? "Order"}</h1>
          <p className="text-sm text-steel-500">
            {client ? <Link href={`/clients/${client.id}`} className="text-instrument-600 hover:underline dark:text-gauge-300">{client.name}</Link> : "(deleted client)"} · placed {formatDate(order.order_date)}
          </p>
        </div>
        <StatusBadge status={status} />
        {row && <PayBadge state={row.payment_state} overdue={row.overdue} />}
        <div className="ml-auto flex flex-wrap gap-2">
          <Button variant="secondary" size="sm" onClick={() => window.print()}><Printer className="h-4 w-4" /> Invoice</Button>
          {!cancelled && <Button variant="secondary" size="sm" onClick={() => setEdit(true)}><Pencil className="h-4 w-4" /> Edit</Button>}
          {!cancelled && <Button variant="secondary" size="sm" onClick={() => setDelivery(true)}><Truck className="h-4 w-4" /> Delivery</Button>}
          {!cancelled && <Button size="sm" onClick={() => setPay(true)} disabled={due <= 0.004}><Wallet className="h-4 w-4" /> Record payment</Button>}
        </div>
      </div>

      {cancelled && <div className="no-print rounded-lg bg-danger/10 px-4 py-3 text-sm text-danger">This order is cancelled and isn't counted in sales, receivables or profit. Any payment already received stays recorded and is kept as client credit.</div>}

      <div className="no-print grid grid-cols-2 gap-3 lg:grid-cols-5">
        <StatCard label="Order total" value={formatCurrency(total, cur)} tone="blue" />
        <StatCard label="Paid" value={formatCurrency(paid, cur)} tone="green" valueTone="green" progress={total > 0 ? (paid / total) * 100 : 100} />
        <StatCard label="Due" value={formatCurrency(due, cur)} tone="red" valueTone={due > 0.004 ? "red" : "default"} sub={row?.due_date && due > 0.004 ? `${row.overdue ? "Was due" : "Due by"} ${formatDate(row.due_date)}` : undefined} />
        <StatCard label="Delivered" value={`${progress.delivered}/${progress.ordered}`} tone="amber" sub={progress.pending ? `${progress.pending} still to deliver` : "Complete"} />
        <StatCard label="Profit (est.)" value={formatCurrency(orderProfit(order), cur)} tone="green" valueTone={orderProfit(order) < 0 ? "red" : "default"} hint="Total − product cost − delivery cost" />
      </div>

      <div id="print-area" className="space-y-6">
        <div className="hidden print:block">
          <h2 className="text-xl font-bold">{settings.factory_name}</h2>
          <p className="text-sm">{settings.business_phone} {settings.business_address}</p>
          <p className="mt-2 text-lg font-semibold">Invoice {order.order_no}</p>
          <p className="text-sm">Client: {client?.name} {client?.phone} · Date: {formatDate(order.order_date)}</p>
        </div>

        <Card>
          <CardHeader><CardTitle>Products</CardTitle></CardHeader>
          <CardBody className="overflow-x-auto p-0">
            <table className="w-full text-sm">
              <thead className="bg-steel-50 text-left text-xs uppercase tracking-wide text-steel-400 dark:bg-steel-900">
                <tr><th className="px-4 py-3">Item</th><th className="px-4 py-3 text-right">Qty</th><th className="px-4 py-3 text-right">Delivered</th><th className="px-4 py-3 text-right">Price</th><th className="no-print px-4 py-3 text-right">Cost</th><th className="px-4 py-3 text-right">Total</th></tr>
              </thead>
              <tbody>
                {n.items.map((i, k) => (
                  <tr key={k} className="border-t border-steel-100 dark:border-steel-700">
                    <td className="px-4 py-3"><p className="font-medium">{i.name}</p>{i.customization && <p className="text-xs text-steel-400">{i.customization}</p>}</td>
                    <td className="px-4 py-3 text-right font-mono">{i.qty}</td>
                    <td className="px-4 py-3 text-right font-mono">{i.delivered_qty}</td>
                    <td className="px-4 py-3 text-right font-mono">{formatCurrency(i.unit_price, cur)}</td>
                    <td className="no-print px-4 py-3 text-right font-mono text-steel-400">{formatCurrency(i.unit_cost, cur)}</td>
                    <td className="px-4 py-3 text-right font-mono">{formatCurrency(i.qty * i.unit_price, cur)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="text-sm">
                <tr className="border-t border-steel-200 dark:border-steel-700"><td colSpan={5} className="px-4 py-2 text-right text-steel-500">Products</td><td className="px-4 py-2 text-right font-mono">{formatCurrency(subtotal, cur)}</td></tr>
                {n.discount > 0 && <tr><td colSpan={5} className="px-4 py-2 text-right text-steel-500">Discount</td><td className="px-4 py-2 text-right font-mono">−{formatCurrency(n.discount, cur)}</td></tr>}
                {n.delivery_charge > 0 && <tr><td colSpan={5} className="px-4 py-2 text-right text-steel-500">Delivery charge</td><td className="px-4 py-2 text-right font-mono">{formatCurrency(n.delivery_charge, cur)}</td></tr>}
                <tr className="font-bold"><td colSpan={5} className="px-4 py-2 text-right">Total</td><td className="px-4 py-2 text-right font-mono">{formatCurrency(total, cur)}</td></tr>
                <tr><td colSpan={5} className="px-4 py-2 text-right text-steel-500">Paid</td><td className="px-4 py-2 text-right font-mono text-ok">{formatCurrency(paid, cur)}</td></tr>
                <tr className="font-bold"><td colSpan={5} className="px-4 py-2 text-right">Balance due</td><td className="px-4 py-2 text-right font-mono">{formatCurrency(due, cur)}</td></tr>
              </tfoot>
            </table>
          </CardBody>
        </Card>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <Card>
            <CardHeader><CardTitle>Payments on this order</CardTitle></CardHeader>
            <CardBody className="p-0">
              {(row?.applied ?? []).length === 0 && <p className="px-5 py-8 text-center text-sm text-steel-400">No payments yet.</p>}
              <ul className="divide-y divide-steel-100 dark:divide-steel-700">
                {(row?.applied ?? []).map((a, k) => (
                  <li key={k} className="flex items-center justify-between gap-3 px-5 py-3 text-sm">
                    <div className="flex items-center gap-2"><span>{formatDate(a.date)}</span><MethodBadge method={a.method} />{!a.direct && <span className="text-xs text-steel-400">from on-account payment</span>}</div>
                    <span className="font-mono font-semibold text-ok">{formatCurrency(a.amount, cur)}</span>
                  </li>
                ))}
              </ul>
            </CardBody>
          </Card>

          <Card>
            <CardHeader><CardTitle>Delivery</CardTitle></CardHeader>
            <CardBody className="space-y-2 text-sm">
              <Detail k="Status"><StatusBadge status={status} /></Detail>
              <Detail k="Expected">{formatDate(order.expected_delivery_date)}</Detail>
              <Detail k="Delivered on">{formatDate(order.delivery_date)}</Detail>
              <Detail k="Courier">{order.courier || "—"}</Detail>
              <Detail k="Tracking ID"><span className="font-mono">{order.tracking_id || "—"}</span></Detail>
              <Detail k="Delivery cost (you pay)">{formatCurrency(n.delivery_cost, cur)}</Detail>
              <Detail k="Address">{order.delivery_address || "—"}</Detail>
              {order.notes && <Detail k="Notes">{order.notes}</Detail>}
              {!cancelled && (
                <div className="no-print pt-2">
                  <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-steel-400">Change status</p>
                  <Select value={status} onChange={(e) => changeStatus(e.target.value)}>
                    {ORDER_STATUSES.filter((s) => s.value !== "cancelled").map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
                  </Select>
                </div>
              )}
            </CardBody>
          </Card>
        </div>
      </div>

      <div className="no-print flex flex-wrap gap-2 border-t border-steel-200 pt-4 dark:border-steel-700">
        {cancelled ? (
          <Button variant="secondary" size="sm" onClick={() => setConfirm("reopen")}><RotateCcw className="h-4 w-4" /> Reopen order</Button>
        ) : (
          <Button variant="secondary" size="sm" onClick={() => setConfirm("cancel")}><Ban className="h-4 w-4" /> Cancel order</Button>
        )}
        <Button variant="danger" size="sm" onClick={() => (canDelete ? setConfirm("delete") : toast.error("This order has payments recorded, so it can't be deleted. Cancel it instead."))}><Trash2 className="h-4 w-4" /> Delete</Button>
      </div>

      <OrderFormModal open={edit} order={order} onClose={() => setEdit(false)} />
      <PaymentFormModal open={pay} clientId={order.client_id} orderId={order.id} onClose={() => setPay(false)} />
      <DeliveryModal open={delivery} order={order} onClose={() => setDelivery(false)} />
      <ConfirmDialog target={confirm} title={confirm === "cancel" ? "Cancel this order?" : confirm === "reopen" ? "Reopen this order?" : "Delete this order?"} confirmLabel={confirm === "cancel" ? "Cancel order" : confirm === "reopen" ? "Reopen" : "Delete"} variant={confirm === "reopen" ? "primary" : "danger"} busy={busy} onCancel={() => setConfirm(null)} onConfirm={runConfirm}>
        {confirm === "cancel" && "It will stop counting in sales, receivables and profit. Payments already received are kept as client credit."}
        {confirm === "reopen" && "The order will count again as a pending order."}
        {confirm === "delete" && "The order is removed permanently. This can't be undone."}
      </ConfirmDialog>
    </div>
  );
}

function Detail({ k, children }) {
  return (
    <div className="flex justify-between gap-4">
      <span className="text-steel-400">{k}</span>
      <span className="text-right">{children}</span>
    </div>
  );
}
