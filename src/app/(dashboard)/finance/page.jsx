"use client";
import { useMemo } from "react";
import Link from "next/link";
import { Banknote, ArrowDownToLine, ArrowUpFromLine, Hourglass, TrendingUp, Landmark } from "lucide-react";
import { ResponsiveContainer, ComposedChart, Bar, Line, XAxis, YAxis, Tooltip, CartesianGrid, Legend } from "recharts";
import { useData } from "@/contexts/DataContext";
import { useSettings } from "@/contexts/SettingsContext";
import { buildSeries } from "@/lib/finance";
import { METHOD_LABEL, PAYMENT_METHODS } from "@/lib/constants";
import { formatCurrency, formatDate } from "@/lib/utils";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/Card";
import { PageHeader } from "@/components/ui/PageHeader";
import { StatCard } from "@/components/ui/StatCard";
import { PayBadge } from "@/components/business/badges";

export default function FinancePage() {
  const { settings } = useSettings();
  const { data, biz, today } = useData();
  const cur = settings.currency;
  const fmt = (v) => formatCurrency(v, cur);

  const series = useMemo(
    () => (today ? buildSeries({ orders: data.sales_orders, payments: data.payments, expenses: data.expenses, today, period: "monthly", count: 12, weekStart: settings.week_starts_on }) : []),
    [data, today, settings.week_starts_on]
  );
  const byCategory = useMemo(() => {
    const m = new Map();
    data.expenses.forEach((e) => m.set(e.category, (m.get(e.category) ?? 0) + Number(e.amount || 0)));
    if (biz.deliveryCosts > 0) m.set("Delivery (orders)", biz.deliveryCosts);
    return Array.from(m.entries()).sort((a, b) => b[1] - a[1]);
  }, [data.expenses, biz.deliveryCosts]);
  const dueList = [...biz.openDue].sort((a, b) => (a.due_date || "9999") < (b.due_date || "9999") ? -1 : 1);
  const c = biz.collections;

  return (
    <div className="space-y-6">
      <PageHeader title="Finance" description="Where the money actually is: received, spent, still to collect, and what you really have." />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Available cash" icon={Landmark} tone="green" value={fmt(biz.availableCash)} valueTone={biz.availableCash < 0 ? "red" : "green"} hint="Opening balance + money received − money spent. Real money you hold, not sales." />
        <StatCard label="Money received" icon={ArrowDownToLine} tone="green" value={fmt(biz.receivedTotal)} sub={`${data.payments.length} payments`} />
        <StatCard label="Money spent" icon={ArrowUpFromLine} tone="red" value={fmt(biz.moneySpent)} sub={`Expenses ${fmt(biz.expensesTotal)} · delivery ${fmt(biz.deliveryCosts)}`} />
        <StatCard label="Total receivables" icon={Hourglass} tone="amber" value={fmt(biz.receivables)} valueTone={biz.receivables > 0 ? "red" : "default"} hint="Billed but not yet paid. Not in your cash yet." />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader><CardTitle>How your balance is made up</CardTitle></CardHeader>
          <CardBody>
            <dl className="space-y-2 text-sm">
              <Row k="Opening balance" v={fmt(biz.openingBalance)} note={<Link href="/settings" className="text-instrument-600 hover:underline dark:text-gauge-300">change in Settings</Link>} />
              <Row k="+ Money received" v={fmt(biz.receivedTotal)} tone="text-ok" />
              <Row k="− Expenses" v={fmt(biz.expensesTotal)} tone="text-danger" />
              <Row k="− Delivery costs" v={fmt(biz.deliveryCosts)} tone="text-danger" />
              <div className="border-t border-steel-200 pt-2 dark:border-steel-700"><Row k="= Available cash" v={fmt(biz.availableCash)} bold /></div>
            </dl>
            <div className="mt-4 rounded-lg bg-steel-50 p-3 text-xs text-steel-500 dark:bg-steel-900 dark:text-steel-400">
              <p className="mb-1 font-semibold text-steel-600 dark:text-steel-300">Not the same thing:</p>
              Total sales <strong className="font-mono">{fmt(biz.salesTotal)}</strong> = received <strong className="font-mono">{fmt(biz.receivedTotal)}</strong> + still owed <strong className="font-mono">{fmt(biz.receivables)}</strong>
              {biz.clientCredit > 0 ? <> − advance held <strong className="font-mono">{fmt(biz.clientCredit)}</strong></> : null}.
            </div>
          </CardBody>
        </Card>

        <Card>
          <CardHeader><CardTitle>Expected collections</CardTitle><span className="text-xs text-steel-400">Total {fmt(biz.expectedCollections)}</span></CardHeader>
          <CardBody className="space-y-3">
            <Bucket label="Overdue" value={c.overdue} total={biz.receivables} bar="bg-danger" cur={cur} />
            <Bucket label="Due in the next 7 days" value={c.next7} total={biz.receivables} bar="bg-gauge-400" cur={cur} />
            <Bucket label="Due in 8 to 30 days" value={c.next30} total={biz.receivables} bar="bg-instrument-500" cur={cur} />
            <Bucket label="Later / no date" value={c.later} total={biz.receivables} bar="bg-steel-400" cur={cur} />
          </CardBody>
        </Card>
      </div>

      <Card>
        <CardHeader><CardTitle>Cash flow, last 12 months</CardTitle><span className="text-xs text-steel-400">Received vs spent</span></CardHeader>
        <CardBody className="h-72">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={series}>
              <CartesianGrid strokeDasharray="3 3" stroke="currentColor" className="text-steel-100 dark:text-steel-700" />
              <XAxis dataKey="label" fontSize={12} stroke="currentColor" className="text-steel-400" />
              <YAxis fontSize={12} stroke="currentColor" className="text-steel-400" tickFormatter={(v) => (Math.abs(v) >= 1000 ? `${Math.round(v / 1000)}k` : v)} />
              <Tooltip contentStyle={{ borderRadius: 10, fontSize: 12 }} formatter={(v) => fmt(v)} />
              <Legend />
              <Bar dataKey="received" name="Received" fill="#4C9A6A" radius={[4, 4, 0, 0]} />
              <Bar dataKey="spent" name="Spent" fill="#C24444" radius={[4, 4, 0, 0]} />
              <Line type="monotone" dataKey="net" name="Net cash flow" stroke="#2A5486" strokeWidth={2.5} dot={false} />
            </ComposedChart>
          </ResponsiveContainer>
        </CardBody>
      </Card>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader><CardTitle>Received by method</CardTitle></CardHeader>
          <CardBody className="space-y-2 text-sm">
            {PAYMENT_METHODS.map((m) => (
              <div key={m.value} className="flex items-center justify-between">
                <span>{m.label}</span>
                <span className="font-mono">{fmt(biz.receivedByMethod[m.value])}</span>
              </div>
            ))}
          </CardBody>
        </Card>
        <Card>
          <CardHeader><CardTitle>Where the money went</CardTitle><Link href="/expenses" className="text-xs text-instrument-600 hover:underline dark:text-gauge-300">Expenses →</Link></CardHeader>
          <CardBody className="space-y-2 text-sm">
            {byCategory.length === 0 && <p className="text-steel-400">No spending recorded yet.</p>}
            {byCategory.map(([cat, amt]) => (
              <div key={cat} className="flex items-center justify-between"><span>{cat}</span><span className="font-mono text-danger">{fmt(amt)}</span></div>
            ))}
          </CardBody>
        </Card>
      </div>

      <Card>
        <CardHeader><CardTitle>Money still to collect</CardTitle><span className="text-xs text-steel-400">{dueList.length} orders</span></CardHeader>
        <CardBody className="overflow-x-auto p-0">
          <table className="w-full text-sm">
            <thead className="bg-steel-50 text-left text-xs uppercase tracking-wide text-steel-400 dark:bg-steel-900">
              <tr><th className="px-4 py-3">Due date</th><th className="px-4 py-3">Order</th><th className="px-4 py-3">Client</th><th className="px-4 py-3">Status</th><th className="px-4 py-3 text-right">Due</th></tr>
            </thead>
            <tbody>
              {dueList.map((r) => (
                <tr key={r.id} className="border-t border-steel-100 dark:border-steel-700">
                  <td className={`px-4 py-3 whitespace-nowrap ${r.overdue ? "font-semibold text-danger" : ""}`}>{formatDate(r.due_date)}{r.overdue && ` (${r.days_overdue}d late)`}</td>
                  <td className="px-4 py-3 font-mono text-xs"><Link href={`/orders/${r.id}`} className="text-instrument-600 hover:underline dark:text-gauge-300">{r.order.order_no}</Link></td>
                  <td className="px-4 py-3"><Link href={`/clients/${r.client.id}`} className="hover:underline">{r.client.name}</Link></td>
                  <td className="px-4 py-3"><PayBadge state={r.payment_state} overdue={r.overdue} /></td>
                  <td className="px-4 py-3 text-right font-mono font-semibold">{fmt(r.due)}</td>
                </tr>
              ))}
              {dueList.length === 0 && <tr><td colSpan={5} className="px-4 py-8 text-center text-steel-400">Nothing to collect. Every order is paid.</td></tr>}
            </tbody>
          </table>
        </CardBody>
      </Card>
    </div>
  );
}

function Row({ k, v, tone = "", bold, note }) {
  return (
    <div className={`flex items-center justify-between ${bold ? "text-base font-bold" : ""}`}>
      <span className="text-steel-500 dark:text-steel-400">{k} {note && <span className="text-xs">({note})</span>}</span>
      <span className={`font-mono ${tone}`}>{v}</span>
    </div>
  );
}
function Bucket({ label, value, total, bar, cur }) {
  const pct = total > 0 ? (value / total) * 100 : 0;
  return (
    <div>
      <div className="flex justify-between text-sm"><span>{label}</span><span className="font-mono">{formatCurrency(value, cur)}</span></div>
      <div className="mt-1 h-2 overflow-hidden rounded-full bg-steel-100 dark:bg-steel-700"><div className={`h-full rounded-full ${bar}`} style={{ width: `${pct}%` }} /></div>
    </div>
  );
}
