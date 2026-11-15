"use client";
import Link from "next/link";
import { Pencil, Trash2 } from "lucide-react";
import { useSettings } from "@/contexts/SettingsContext";
import { formatCurrency, formatDate } from "@/lib/utils";
import { StatusBadge, PayBadge, MethodBadge, DeliveryBadge } from "./badges";
import { Skeleton } from "@/components/ui/Skeleton";

const th = "px-4 py-3";

/** rows = biz.orderRows entries (order + computed paid/due/status). */
export function OrdersTable({ rows, showClient = true, loading, empty = "No orders found." }) {
  const { settings } = useSettings();
  const cur = settings.currency;
  return (
    <table className="w-full text-sm">
      <thead className="bg-steel-50 text-left text-xs uppercase tracking-wide text-steel-400 dark:bg-steel-900">
        <tr>
          <th className={th}>Order</th>
          <th className={th}>Date</th>
          {showClient && <th className={th}>Client</th>}
          <th className={th}>Items</th>
          <th className={`${th} text-right`}>Total</th>
          <th className={`${th} text-right`}>Paid</th>
          <th className={`${th} text-right`}>Due</th>
          <th className={th}>Payment</th>
          <th className={th}>Status</th>
          <th className={th}>Delivered</th>
          <th className={th}>Due date</th>
        </tr>
      </thead>
      <tbody>
        {loading && <tr><td colSpan={11} className="px-4 py-6"><Skeleton className="h-5 w-full" /></td></tr>}
        {!loading && rows.map((r) => (
          <tr key={r.id} className="border-t border-steel-100 hover:bg-steel-50/60 dark:border-steel-700 dark:hover:bg-steel-900/40">
            <td className={`${th} font-mono text-xs font-semibold`}><Link href={`/orders/${r.id}`} className="text-instrument-600 hover:underline dark:text-gauge-300">{r.order.order_no ?? "—"}</Link></td>
            <td className={`${th} whitespace-nowrap`}>{formatDate(r.order.order_date)}</td>
            {showClient && <td className={th}><Link href={`/clients/${r.client.id}`} className="hover:underline">{r.client.name}</Link></td>}
            <td className={`${th} max-w-[220px] truncate text-steel-500`} title={r.order.items?.map((i) => `${i.name} ×${i.qty}`).join(", ")}>{r.order.items?.map((i) => `${i.name} ×${i.qty}`).join(", ")}</td>
            <td className={`${th} text-right font-mono`}>{formatCurrency(r.total, cur)}</td>
            <td className={`${th} text-right font-mono text-ok`}>{formatCurrency(r.paid, cur)}</td>
            <td className={`${th} text-right font-mono ${r.due > 0.004 ? "font-semibold text-danger" : "text-steel-400"}`}>{formatCurrency(r.due, cur)}</td>
            <td className={th}><PayBadge state={r.payment_state} overdue={r.overdue} /></td>
            <td className={th}><StatusBadge status={r.status} /></td>
            <td className={th}><DeliveryBadge progress={r.progress} status={r.status} /></td>
            <td className={`${th} whitespace-nowrap ${r.overdue ? "font-semibold text-danger" : ""}`}>
              {r.due > 0.004 ? formatDate(r.due_date) : "—"}
              {r.overdue && <span className="ml-1 text-[11px]">({r.days_overdue}d late)</span>}
            </td>
          </tr>
        ))}
        {!loading && rows.length === 0 && <tr><td colSpan={11} className="px-4 py-10 text-center text-steel-400">{empty}</td></tr>}
      </tbody>
    </table>
  );
}

export function PaymentsTable({ payments, clientById, orderById, showClient = true, onEdit, onDelete, empty = "No payments recorded yet." }) {
  const { settings } = useSettings();
  return (
    <table className="w-full text-sm">
      <thead className="bg-steel-50 text-left text-xs uppercase tracking-wide text-steel-400 dark:bg-steel-900">
        <tr>
          <th className={th}>Date</th>
          {showClient && <th className={th}>Client</th>}
          <th className={th}>Order</th>
          <th className={th}>Method</th>
          <th className={th}>Reference</th>
          <th className={`${th} text-right`}>Amount</th>
          {(onEdit || onDelete) && <th className={`${th} text-right`}>Actions</th>}
        </tr>
      </thead>
      <tbody>
        {payments.map((p) => {
          const order = p.order_id ? orderById?.get(p.order_id) : null;
          return (
            <tr key={p.id} className="border-t border-steel-100 dark:border-steel-700">
              <td className={`${th} whitespace-nowrap`}>{formatDate(p.date)}</td>
              {showClient && <td className={th}>{clientById.get(p.client_id)?.name ? <Link href={`/clients/${p.client_id}`} className="hover:underline">{clientById.get(p.client_id).name}</Link> : <span className="text-steel-400">(deleted client)</span>}</td>}
              <td className={th}>{order ? <Link href={`/orders/${order.id}`} className="font-mono text-xs text-instrument-600 hover:underline dark:text-gauge-300">{order.order_no}</Link> : <span className="text-xs text-steel-400">{p.order_id ? "(order removed)" : "On account"}</span>}</td>
              <td className={th}><MethodBadge method={p.method} /></td>
              <td className={`${th} text-steel-500`}>{p.reference || p.notes || "—"}</td>
              <td className={`${th} text-right font-mono font-semibold text-ok`}>{formatCurrency(p.amount, settings.currency)}</td>
              {(onEdit || onDelete) && (
                <td className={th}>
                  <div className="flex justify-end gap-1">
                    {onEdit && <button onClick={() => onEdit(p)} className="rounded-md p-1.5 text-steel-400 hover:bg-steel-100 hover:text-instrument-600 dark:hover:bg-steel-700" aria-label="Edit payment"><Pencil className="h-4 w-4" /></button>}
                    {onDelete && <button onClick={() => onDelete(p)} className="rounded-md p-1.5 text-steel-400 hover:bg-danger/10 hover:text-danger" aria-label="Delete payment"><Trash2 className="h-4 w-4" /></button>}
                  </div>
                </td>
              )}
            </tr>
          );
        })}
        {payments.length === 0 && <tr><td colSpan={7} className="px-4 py-10 text-center text-steel-400">{empty}</td></tr>}
      </tbody>
    </table>
  );
}
