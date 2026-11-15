"use client";
import { Suspense, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Plus, Search, ShoppingCart, FileSpreadsheet } from "lucide-react";
import * as XLSX from "xlsx";
import { useData } from "@/contexts/DataContext";
import { useSettings } from "@/contexts/SettingsContext";
import { ORDER_STATUSES } from "@/lib/constants";
import { formatCurrency } from "@/lib/utils";
import { Card, CardBody } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Button } from "@/components/ui/Button";
import { PageHeader } from "@/components/ui/PageHeader";
import { StatCard } from "@/components/ui/StatCard";
import { EmptyState } from "@/components/ui/EmptyState";
import { OrdersTable } from "@/components/business/Tables";
import { OrderFormModal } from "@/components/business/OrderFormModal";

const PAGE = 25;

function OrdersInner() {
  const { settings } = useSettings();
  const { biz, data, loading } = useData();
  const params = useSearchParams();
  const cur = settings.currency;
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState(params.get("filter") ?? "all");
  const [client, setClient] = useState("");
  const [page, setPage] = useState(1);
  const [modal, setModal] = useState(false);

  const rows = useMemo(() => {
    const s = search.trim().toLowerCase();
    return biz.orderRows.filter((r) => {
      if (client && r.client.id !== client) return false;
      switch (filter) {
        case "open": if (r.status === "delivered") return false; break;
        case "unpaid": if (r.due <= 0.004) return false; break;
        case "overdue": if (!r.overdue) return false; break;
        case "late": break; // handled below
        default: if (filter !== "all" && r.status !== filter) return false;
      }
      if (filter === "late" && !biz.pendingDeliveries.some((p) => p.id === r.id && p.late)) return false;
      if (s && ![r.order.order_no, r.client.name, r.order.tracking_id, r.order.items?.map((i) => i.name).join(" ")].join(" ").toLowerCase().includes(s)) return false;
      return true;
    });
  }, [biz, data, search, filter, client]);

  const totalPages = Math.max(1, Math.ceil(rows.length / PAGE));
  const paged = rows.slice((page - 1) * PAGE, page * PAGE);

  function exportExcel() {
    const out = rows.map((r) => ({ Order: r.order.order_no, Date: r.order.order_date, Client: r.client.name, Items: r.order.items.map((i) => `${i.name} x${i.qty}`).join(", "), Total: r.total, Paid: r.paid, Due: r.due, Status: r.status, "Due date": r.due_date, Tracking: r.order.tracking_id ?? "" }));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(out), "Orders");
    XLSX.writeFile(wb, "orders.xlsx");
  }

  return (
    <div className="space-y-4">
      <PageHeader title="Orders" description="Customer orders from placement to delivery and payment." actions={<><Button variant="secondary" onClick={exportExcel}><FileSpreadsheet className="h-4 w-4" /> Excel</Button><Button onClick={() => setModal(true)}><Plus className="h-4 w-4" /> New Order</Button></>} />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Orders" value={biz.counts.orders} sub={`${biz.counts.cancelled} cancelled`} icon={ShoppingCart} tone="blue" />
        <StatCard label="Open / pending" value={biz.counts.pending} sub={`${biz.unitsPending.toLocaleString()} units to deliver`} tone="amber" />
        <StatCard label="Total sales" value={formatCurrency(biz.salesTotal, cur)} tone="blue" />
        <StatCard label="Still to collect" value={formatCurrency(biz.receivables, cur)} tone="red" valueTone={biz.receivables > 0 ? "red" : "default"} />
      </div>
      <Card>
        <CardBody className="flex flex-col gap-3 lg:flex-row">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-steel-400" />
            <Input className="pl-9" placeholder="Search order no., client, product, tracking ID…" value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} />
          </div>
          <Select className="lg:w-52" value={filter} onChange={(e) => { setFilter(e.target.value); setPage(1); }}>
            <option value="all">All orders</option>
            <option value="open">Not yet delivered</option>
            <option value="unpaid">Unpaid / partly paid</option>
            <option value="overdue">Overdue payment</option>
            <option value="late">Late delivery</option>
            {ORDER_STATUSES.map((s) => <option key={s.value} value={s.value}>Status: {s.label}</option>)}
          </Select>
          <Select className="lg:w-52" value={client} onChange={(e) => { setClient(e.target.value); setPage(1); }}>
            <option value="">All clients</option>
            {data.clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </Select>
        </CardBody>
      </Card>
      <Card>
        <CardBody className="overflow-x-auto p-0">
          <OrdersTable rows={paged} loading={loading} empty="No orders match." />
          {!loading && biz.orderRows.length === 0 && <EmptyState icon={ShoppingCart} title="No orders yet" action={<Button onClick={() => setModal(true)}><Plus className="h-4 w-4" /> Create the first order</Button>}>{data.clients.length === 0 ? "You'll be able to add a client right from the order form." : ""}</EmptyState>}
        </CardBody>
      </Card>
      {totalPages > 1 && (
        <div className="flex items-center justify-between text-sm text-steel-500">
          <span>Page {page} of {totalPages} · {rows.length} orders</span>
          <div className="flex gap-2">
            <Button variant="secondary" size="sm" disabled={page === 1} onClick={() => setPage((p) => p - 1)}>Previous</Button>
            <Button variant="secondary" size="sm" disabled={page === totalPages} onClick={() => setPage((p) => p + 1)}>Next</Button>
          </div>
        </div>
      )}
      <OrderFormModal open={modal} onClose={() => setModal(false)} />
    </div>
  );
}

// useSearchParams needs a Suspense boundary for the production build.
export default function OrdersPage() {
  return <Suspense fallback={<p className="text-sm text-steel-400">Loading orders…</p>}><OrdersInner /></Suspense>;
}
