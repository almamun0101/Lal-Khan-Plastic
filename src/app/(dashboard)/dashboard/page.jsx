"use client";
import { useMemo, useState } from "react";
import Link from "next/link";
import {
  AlertTriangle, AlertCircle, Info, ArrowDownToLine, ArrowUpFromLine, Banknote, Hourglass, TrendingUp, ShoppingCart,
  Wallet, Plus, Boxes, Truck, Package, Factory, CheckCircle2, Receipt,
} from "lucide-react";
import { ResponsiveContainer, ComposedChart, Bar, Line, XAxis, YAxis, Tooltip, CartesianGrid, Legend } from "recharts";
import { useData } from "@/contexts/DataContext";
import { useSettings } from "@/contexts/SettingsContext";
import { buildAlerts, buildSeries, buildTransactions } from "@/lib/finance";
import { formatCompact, formatCurrency, formatDate, plural } from "@/lib/utils";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { PageHeader } from "@/components/ui/PageHeader";
import { StatCard } from "@/components/ui/StatCard";
import { SkeletonCard } from "@/components/ui/Skeleton";
import { StatusBadge, MethodBadge } from "@/components/business/badges";
import { OrderFormModal } from "@/components/business/OrderFormModal";
import { PaymentFormModal } from "@/components/business/PaymentFormModal";

const LEVEL = {
  danger: { icon: AlertTriangle, cls: "border-danger/30 bg-danger/5 text-danger" },
  warn: { icon: AlertCircle, cls: "border-gauge-400/40 bg-gauge-50 text-gauge-700 dark:bg-gauge-900/20 dark:text-gauge-300" },
  info: { icon: Info, cls: "border-instrument-500/30 bg-instrument-500/5 text-instrument-600 dark:text-instrument-400" },
};

export default function DashboardPage() {
  const { settings } = useSettings();
  const { data, biz, today, loading, clientById, workerById } = useData();
  const cur = settings.currency;
  const fmt = (v) => formatCurrency(v, cur);
  const [orderModal, setOrderModal] = useState(false);
  const [payModal, setPayModal] = useState(false);

  const alerts = useMemo(() => buildAlerts(biz, settings, today ?? ""), [biz, settings, today]);
  const series = useMemo(
    () => (today ? buildSeries({ orders: data.sales_orders, payments: data.payments, expenses: data.expenses, workers: data.workers, logs: data.production_logs, staffPayments: data.staff_payments, settings, today, period: "daily", count: 14, weekStart: settings.week_starts_on }) : []),
    [data, today, settings.week_starts_on]
  );
  const feed = useMemo(() => buildTransactions({ payments: data.payments, expenses: data.expenses, orders: data.sales_orders, staffPayments: data.staff_payments, workerById, clientById }).slice(0, 8), [data, clientById, workerById]);
  const overdue = useMemo(() => biz.openDue.filter((r) => r.overdue).sort((a, b) => b.days_overdue - a.days_overdue).slice(0, 6), [biz.openDue]);
  const deliveries = useMemo(() => [...biz.pendingDeliveries].sort((a, b) => (b.late - a.late) || ((a.order.expected_delivery_date || "9999") < (b.order.expected_delivery_date || "9999") ? -1 : 1)).slice(0, 6), [biz.pendingDeliveries]);

  const monthPrefix = today ? today.slice(0, 7) : "";
  const monthSales = biz.orderRows.filter((r) => (r.order.order_date ?? "").startsWith(monthPrefix)).reduce((s, r) => s + r.total, 0);
  const monthReceived = data.payments.filter((p) => (p.date ?? "").startsWith(monthPrefix)).reduce((s, p) => s + Number(p.amount || 0), 0);
  const todayPieces = data.production_logs.filter((l) => l.date === today).reduce((s, l) => s + Number(l.total_quantity || 0), 0);
  const k = biz.kpi;

  if (loading) {
    return <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">{Array.from({ length: 8 }).map((_, i) => <SkeletonCard key={i} />)}</div>;
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Dashboard"
        description={`${today ? formatDate(today) : ""} · ${settings.factory_name}`}
        actions={
          <>
            <Button variant="secondary" onClick={() => setPayModal(true)}><Wallet className="h-4 w-4" /> Record payment</Button>
            <Link href="/expenses"><Button variant="secondary"><Receipt className="h-4 w-4" /> Add expense</Button></Link>
            <Button onClick={() => setOrderModal(true)}><Plus className="h-4 w-4" /> New order</Button>
          </>
        }
      />

      {alerts.length > 0 ? (
        <div className="space-y-2">
          {alerts.map((a) => {
            const L = LEVEL[a.level];
            const Icon = L.icon;
            return (
              <Link key={a.id} href={a.href} className={`flex items-start gap-3 rounded-lg border px-4 py-3 text-sm transition-opacity hover:opacity-90 ${L.cls}`}>
                <Icon className="mt-0.5 h-4 w-4 shrink-0" />
                <div><p className="font-semibold">{a.title}</p><p className="text-xs opacity-80">{a.detail}</p></div>
              </Link>
            );
          })}
        </div>
      ) : (
        <div className="flex items-center gap-2 rounded-lg border border-ok/30 bg-ok/5 px-4 py-3 text-sm text-ok"><CheckCircle2 className="h-4 w-4" /> No alerts. Payments and deliveries are on track.</div>
      )}

      {/* The four numbers that must never be confused */}
      <div>
        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-steel-400">Money, kept separate</p>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <StatCard label="Total sales (billed)" value={fmt(biz.salesTotal)} icon={ShoppingCart} tone="blue" sub={`${fmt(monthSales)} this month`} hint="Value of all orders. Not money in hand." href="/orders" />
          <StatCard label="Payments received" value={fmt(biz.receivedTotal)} icon={ArrowDownToLine} tone="green" valueTone="green" sub={`${fmt(monthReceived)} this month`} hint="Money actually collected." href="/payments" progress={k.collection_rate} />
          <StatCard label="Outstanding dues" value={fmt(biz.receivables)} icon={Hourglass} tone="red" valueTone={biz.receivables > 0 ? "red" : "default"} sub={biz.collections.overdue > 0 ? `${fmt(biz.collections.overdue)} overdue` : "None overdue"} hint="Billed but not yet paid." href="/finance" />
          <StatCard label="Available cash" value={fmt(biz.availableCash)} icon={Banknote} tone="green" valueTone={biz.availableCash < 0 ? "red" : "green"} sub={`Spent ${fmt(biz.moneySpent)} (incl. staff ${fmt(biz.staffPaid)})`} hint="Opening balance + received − spent." href="/finance" />
        </div>
        <div className="mt-3 grid grid-cols-2 gap-3 lg:grid-cols-4">
          <StatCard label="Net profit" value={fmt(biz.netProfit)} icon={TrendingUp} tone="green" valueTone={biz.netProfit < 0 ? "red" : "default"} sub={k.profit_margin != null ? `${k.profit_margin}% margin` : undefined} hint="Sales − product cost − delivery − expenses − staff pay earned." href="/analytics" />
          <StatCard label="Expenses" value={fmt(biz.expensesTotal)} icon={ArrowUpFromLine} tone="red" sub={`Delivery costs ${fmt(biz.deliveryCosts)}`} href="/expenses" />
          <StatCard label="Next 7 days" value={fmt(biz.collections.next7)} icon={Hourglass} tone="amber" sub={`${fmt(biz.collections.next30)} in 8 to 30 days`} hint="Expected collections by due date." href="/finance" />
          <StatCard label="Pending orders" value={biz.counts.pending} icon={Truck} tone="amber" sub={`${biz.counts.delivered} delivered · ${plural(biz.counts.clients, "client")}`} href="/orders?filter=open" />
        </div>
      </div>

      <div>
        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-steel-400">Products</p>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <StatCard label="Units produced" value={biz.unitsProduced.toLocaleString("en-IN")} icon={Factory} tone="blue" sub={`${todayPieces.toLocaleString("en-IN")} today`} href="/production/overview" />
          <StatCard label="Units sold (ordered)" value={biz.unitsOrdered.toLocaleString("en-IN")} icon={Boxes} tone="blue" />
          <StatCard label="Units delivered" value={biz.unitsDelivered.toLocaleString("en-IN")} icon={Truck} tone="green" progress={k.delivery_completion} sub={k.delivery_completion != null ? `${k.delivery_completion}% of ordered` : undefined} />
          <StatCard label="Units pending delivery" value={biz.unitsPending.toLocaleString("en-IN")} icon={Package} tone="amber" />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader><CardTitle>Last 14 days</CardTitle><span className="text-xs text-steel-400">Sales vs money received vs spent</span></CardHeader>
          <CardBody className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={series}>
                <CartesianGrid strokeDasharray="3 3" stroke="currentColor" className="text-steel-100 dark:text-steel-700" />
                <XAxis dataKey="label" fontSize={11} stroke="currentColor" className="text-steel-400" interval="preserveStartEnd" />
                <YAxis fontSize={11} stroke="currentColor" className="text-steel-400" tickFormatter={formatCompact} />
                <Tooltip contentStyle={{ borderRadius: 10, fontSize: 12 }} formatter={(v) => fmt(v)} />
                <Legend />
                <Bar dataKey="sales" name="Sales" fill="#2A5486" radius={[3, 3, 0, 0]} />
                <Bar dataKey="received" name="Received" fill="#4C9A6A" radius={[3, 3, 0, 0]} />
                <Line type="monotone" dataKey="spent" name="Spent" stroke="#C24444" strokeWidth={2} dot={false} />
              </ComposedChart>
            </ResponsiveContainer>
          </CardBody>
        </Card>

        <Card>
          <CardHeader><CardTitle>Performance</CardTitle></CardHeader>
          <CardBody className="space-y-3 text-sm">
            <Kpi label="Collection rate" value={k.collection_rate != null ? `${k.collection_rate}%` : "—"} note="of billed amount collected" />
            <Kpi label="Profit margin" value={k.profit_margin != null ? `${k.profit_margin}%` : "—"} note="net profit ÷ sales" bad={k.profit_margin != null && k.profit_margin < 0} />
            <Kpi label="Avg. order value" value={fmt(k.avg_order_value)} />
            <Kpi label="Avg. days to get paid" value={k.avg_days_to_collect != null ? `${k.avg_days_to_collect} days` : "—"} note="on fully paid orders" />
            <Kpi label="On-time delivery" value={k.on_time_delivery != null ? `${k.on_time_delivery}%` : "—"} note="vs promised date" />
            <Kpi label="Clients with open balance" value={k.active_clients} />
          </CardBody>
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader><CardTitle>Overdue payments</CardTitle><Link href="/orders?filter=overdue" className="text-xs text-instrument-600 hover:underline dark:text-gauge-300">View all →</Link></CardHeader>
          <CardBody className="p-0">
            {overdue.length === 0 && <p className="px-5 py-8 text-center text-sm text-steel-400">Nothing overdue. 🎉</p>}
            <ul className="divide-y divide-steel-100 dark:divide-steel-700">
              {overdue.map((r) => (
                <li key={r.id}>
                  <Link href={`/orders/${r.id}`} className="flex items-center justify-between gap-3 px-5 py-3 text-sm hover:bg-steel-50 dark:hover:bg-steel-900/40">
                    <div className="min-w-0"><p className="truncate font-medium">{r.client.name}</p><p className="text-xs text-danger">{r.order.order_no} · {r.days_overdue} days late</p></div>
                    <span className="font-mono font-semibold text-danger">{fmt(r.due)}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </CardBody>
        </Card>

        <Card>
          <CardHeader><CardTitle>Pending deliveries</CardTitle><Link href="/orders?filter=open" className="text-xs text-instrument-600 hover:underline dark:text-gauge-300">View all →</Link></CardHeader>
          <CardBody className="p-0">
            {deliveries.length === 0 && <p className="px-5 py-8 text-center text-sm text-steel-400">No pending deliveries.</p>}
            <ul className="divide-y divide-steel-100 dark:divide-steel-700">
              {deliveries.map((r) => (
                <li key={r.id}>
                  <Link href={`/orders/${r.id}`} className="flex items-center justify-between gap-3 px-5 py-3 text-sm hover:bg-steel-50 dark:hover:bg-steel-900/40">
                    <div className="min-w-0"><p className="truncate font-medium">{r.client.name}</p><p className={`text-xs ${r.late ? "text-danger" : "text-steel-400"}`}>{r.order.order_no} · {r.progress.pending} units left{r.order.expected_delivery_date ? ` · expected ${formatDate(r.order.expected_delivery_date)}` : ""}{r.late ? ` (${r.days_late}d late)` : ""}</p></div>
                    <StatusBadge status={r.status} />
                  </Link>
                </li>
              ))}
            </ul>
          </CardBody>
        </Card>
      </div>

      <Card>
        <CardHeader><CardTitle>Recent transactions</CardTitle></CardHeader>
        <CardBody className="overflow-x-auto p-0">
          <table className="w-full text-sm">
            <tbody>
              {feed.map((t) => (
                <tr key={t.id} className="border-t border-steel-100 first:border-t-0 dark:border-steel-700">
                  <td className="px-4 py-3 whitespace-nowrap text-steel-500">{formatDate(t.date)}</td>
                  <td className="px-4 py-3"><Link href={t.href} className="hover:underline">{t.label}</Link></td>
                  <td className="px-4 py-3">{t.method && <MethodBadge method={t.method} />}</td>
                  <td className={`px-4 py-3 text-right font-mono font-semibold ${t.direction === "in" ? "text-ok" : "text-danger"}`}>{t.direction === "in" ? "+" : "−"}{fmt(t.amount)}</td>
                </tr>
              ))}
              {feed.length === 0 && <tr><td className="px-4 py-8 text-center text-steel-400">No transactions yet. Record a payment or an expense to see it here.</td></tr>}
            </tbody>
          </table>
        </CardBody>
      </Card>

      <OrderFormModal open={orderModal} onClose={() => setOrderModal(false)} />
      <PaymentFormModal open={payModal} onClose={() => setPayModal(false)} />
    </div>
  );
}

function Kpi({ label, value, note, bad }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <div><p>{label}</p>{note && <p className="text-[11px] text-steel-400">{note}</p>}</div>
      <span className={`font-mono font-semibold ${bad ? "text-danger" : ""}`}>{value}</span>
    </div>
  );
}
