"use client";
import { useMemo, useState } from "react";
import Link from "next/link";
import { FileSpreadsheet } from "lucide-react";
import * as XLSX from "xlsx";
import { ResponsiveContainer, ComposedChart, LineChart, Bar, Line, XAxis, YAxis, Tooltip, CartesianGrid, Legend } from "recharts";
import { useData } from "@/contexts/DataContext";
import { useSettings } from "@/contexts/SettingsContext";
import { PERIODS, buildSeries } from "@/lib/finance";
import { formatCompact, formatCurrency } from "@/lib/utils";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { PageHeader } from "@/components/ui/PageHeader";
import { Segmented } from "@/components/ui/Segmented";
import { StatCard } from "@/components/ui/StatCard";

const axis = { fontSize: 12, stroke: "currentColor", className: "text-steel-400" };

export default function AnalyticsPage() {
  const { settings } = useSettings();
  const { data, biz, today } = useData();
  const cur = settings.currency;
  const fmt = (v) => formatCurrency(v, cur);
  const [period, setPeriod] = useState("monthly");

  const series = useMemo(
    () => (today ? buildSeries({ orders: data.sales_orders, payments: data.payments, expenses: data.expenses, workers: data.workers, logs: data.production_logs, staffPayments: data.staff_payments, settings, today, period, weekStart: settings.week_starts_on }) : []),
    [data, today, period, settings.week_starts_on]
  );
  const sum = (k) => series.reduce((s, r) => s + r[k], 0);
  const label = PERIODS.find((p) => p.value === period)?.label;

  const topClients = [...biz.clientStats].filter((c) => !c.client.missing).sort((a, b) => b.billed - a.billed).slice(0, 8);
  const topProducts = [...biz.productStats].filter((p) => p.revenue > 0).sort((a, b) => b.revenue - a.revenue).slice(0, 8);

  function exportExcel() {
    const rows = series.map((r) => ({ Period: r.key, Sales: r.sales, Received: r.received, Expenses: r.expenses, "Delivery cost": r.deliveryCost, "Staff cost": r.staffEarned, "Product cost": r.productCost, Profit: r.profit, "Net cash flow": r.net, Outstanding: r.outstanding, Orders: r.orders }));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), label);
    XLSX.writeFile(wb, `analytics_${period}.xlsx`);
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Analytics"
        description="Sales, collections, spending and profit over time."
        actions={<><Segmented options={PERIODS} value={period} onChange={setPeriod} /><Button variant="secondary" onClick={exportExcel}><FileSpreadsheet className="h-4 w-4" /> Excel</Button></>}
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <StatCard label="Sales (billed)" value={fmt(sum("sales"))} tone="blue" sub={`${sum("orders")} orders`} />
        <StatCard label="Received" value={fmt(sum("received"))} tone="green" valueTone="green" />
        <StatCard label="Spent" value={fmt(sum("spent"))} tone="red" sub="Expenses + delivery + staff paid" />
        <StatCard label="Profit" value={fmt(sum("profit"))} tone="green" valueTone={sum("profit") < 0 ? "red" : "default"} hint="Sales − product cost − delivery − expenses − staff cost" />
        <StatCard label="Outstanding now" value={fmt(series.at(-1)?.outstanding ?? 0)} tone="amber" hint="Billed − received, up to the end of the latest period" />
      </div>

      <Card>
        <CardHeader><CardTitle>{label}: sales, received and spent</CardTitle></CardHeader>
        <CardBody className="h-80">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={series}>
              <CartesianGrid strokeDasharray="3 3" stroke="currentColor" className="text-steel-100 dark:text-steel-700" />
              <XAxis dataKey="label" {...axis} interval="preserveStartEnd" />
              <YAxis {...axis} tickFormatter={formatCompact} />
              <Tooltip contentStyle={{ borderRadius: 10, fontSize: 12 }} formatter={(v) => fmt(v)} />
              <Legend />
              <Bar dataKey="sales" name="Sales" fill="#2A5486" radius={[4, 4, 0, 0]} />
              <Bar dataKey="received" name="Received" fill="#4C9A6A" radius={[4, 4, 0, 0]} />
              <Bar dataKey="spent" name="Spent" fill="#C24444" radius={[4, 4, 0, 0]} />
            </ComposedChart>
          </ResponsiveContainer>
        </CardBody>
      </Card>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader><CardTitle>Profit trend</CardTitle></CardHeader>
          <CardBody className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={series}>
                <CartesianGrid strokeDasharray="3 3" stroke="currentColor" className="text-steel-100 dark:text-steel-700" />
                <XAxis dataKey="label" {...axis} interval="preserveStartEnd" />
                <YAxis {...axis} />
                <Tooltip contentStyle={{ borderRadius: 10, fontSize: 12 }} formatter={(v) => fmt(v)} />
                <Line type="monotone" dataKey="profit" name="Profit" stroke="#4C9A6A" strokeWidth={2.5} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </CardBody>
        </Card>
        <Card>
          <CardHeader><CardTitle>Outstanding payments</CardTitle></CardHeader>
          <CardBody className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={series}>
                <CartesianGrid strokeDasharray="3 3" stroke="currentColor" className="text-steel-100 dark:text-steel-700" />
                <XAxis dataKey="label" {...axis} interval="preserveStartEnd" />
                <YAxis {...axis} />
                <Tooltip contentStyle={{ borderRadius: 10, fontSize: 12 }} formatter={(v) => fmt(v)} />
                <Line type="monotone" dataKey="outstanding" name="Outstanding" stroke="#E08A00" strokeWidth={2.5} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </CardBody>
        </Card>
      </div>

      <Card>
        <CardHeader><CardTitle>{label} report</CardTitle></CardHeader>
        <CardBody className="overflow-x-auto p-0">
          <table className="w-full text-sm">
            <thead className="bg-steel-50 text-left text-xs uppercase tracking-wide text-steel-400 dark:bg-steel-900">
              <tr><th className="px-4 py-3">Period</th><th className="px-4 py-3 text-right">Orders</th><th className="px-4 py-3 text-right">Sales</th><th className="px-4 py-3 text-right">Received</th><th className="px-4 py-3 text-right">Expenses</th><th className="px-4 py-3 text-right">Delivery</th><th className="px-4 py-3 text-right">Staff cost</th><th className="px-4 py-3 text-right">Profit</th><th className="px-4 py-3 text-right">Outstanding</th></tr>
            </thead>
            <tbody>
              {[...series].reverse().map((r) => (
                <tr key={r.key} className="border-t border-steel-100 dark:border-steel-700">
                  <td className="px-4 py-2.5 font-medium">{period === "weekly" ? `Week of ${r.key}` : r.key}</td>
                  <td className="px-4 py-2.5 text-right font-mono">{r.orders}</td>
                  <td className="px-4 py-2.5 text-right font-mono">{fmt(r.sales)}</td>
                  <td className="px-4 py-2.5 text-right font-mono text-ok">{fmt(r.received)}</td>
                  <td className="px-4 py-2.5 text-right font-mono text-danger">{fmt(r.expenses)}</td>
                  <td className="px-4 py-2.5 text-right font-mono text-danger">{fmt(r.deliveryCost)}</td>
                  <td className="px-4 py-2.5 text-right font-mono text-danger">{fmt(r.staffEarned)}</td>
                  <td className={`px-4 py-2.5 text-right font-mono font-semibold ${r.profit < 0 ? "text-danger" : ""}`}>{fmt(r.profit)}</td>
                  <td className="px-4 py-2.5 text-right font-mono">{fmt(r.outstanding)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardBody>
      </Card>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader><CardTitle>Top clients (all time)</CardTitle></CardHeader>
          <CardBody className="p-0">
            <table className="w-full text-sm"><tbody>
              {topClients.map((c) => (
                <tr key={c.id} className="border-t border-steel-100 first:border-t-0 dark:border-steel-700">
                  <td className="px-4 py-2.5"><Link href={`/clients/${c.id}`} className="hover:underline">{c.client.name}</Link></td>
                  <td className="px-4 py-2.5 text-right font-mono">{fmt(c.billed)}</td>
                  <td className={`px-4 py-2.5 text-right font-mono text-xs ${c.due > 0.004 ? "text-danger" : "text-steel-400"}`}>owes {fmt(c.due)}</td>
                </tr>
              ))}
              {topClients.length === 0 && <tr><td className="px-4 py-8 text-center text-steel-400">No data yet.</td></tr>}
            </tbody></table>
          </CardBody>
        </Card>
        <Card>
          <CardHeader><CardTitle>Top products (all time)</CardTitle></CardHeader>
          <CardBody className="p-0">
            <table className="w-full text-sm"><tbody>
              {topProducts.map((p) => (
                <tr key={p.product_id} className="border-t border-steel-100 first:border-t-0 dark:border-steel-700">
                  <td className="px-4 py-2.5">{p.name}<span className="ml-2 text-xs text-steel-400">{p.ordered} sold</span></td>
                  <td className="px-4 py-2.5 text-right font-mono">{fmt(p.revenue)}</td>
                  <td className={`px-4 py-2.5 text-right font-mono text-xs ${p.profit < 0 ? "text-danger" : "text-ok"}`}>profit {fmt(p.profit)}</td>
                </tr>
              ))}
              {topProducts.length === 0 && <tr><td className="px-4 py-8 text-center text-steel-400">No data yet.</td></tr>}
            </tbody></table>
          </CardBody>
        </Card>
      </div>
    </div>
  );
}
