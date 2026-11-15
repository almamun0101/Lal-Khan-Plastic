"use client";
import { useMemo, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Plus, Trash2, Pencil, FileSpreadsheet } from "lucide-react";
import * as XLSX from "xlsx";
import { toast } from "sonner";
import { useData } from "@/contexts/DataContext";
import { useSettings } from "@/contexts/SettingsContext";
import { useAuth } from "@/contexts/AuthContext";
import { createDoc, updateDocById, deleteDocById, newId, notifySaved, errorMessage } from "@/lib/firestore-service";
import { expenseSchema } from "@/lib/schemas";
import { EXPENSE_CATEGORIES, PAYMENT_METHODS } from "@/lib/constants";
import { formatCurrency, formatDate, round2 } from "@/lib/utils";
import { Card, CardBody } from "@/components/ui/Card";
import { Input, Label } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { PageHeader } from "@/components/ui/PageHeader";
import { StatCard } from "@/components/ui/StatCard";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { MethodBadge } from "@/components/business/badges";
import { SkeletonRow } from "@/components/ui/Skeleton";

const blank = (date) => ({ name: "", category: "Raw Material", amount: "", date, method: "cash", notes: "" });

export default function ExpensesPage() {
  const { settings } = useSettings();
  const { user } = useAuth();
  const { data, biz, today, loaded } = useData();
  const cur = settings.currency;
  const expenses = data.expenses;
  const [modal, setModal] = useState(false);
  const [editing, setEditing] = useState(null);
  const [deleting, setDeleting] = useState(null);
  const [busy, setBusy] = useState(false);
  const [cat, setCat] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const idRef = useRef("");

  const { register, handleSubmit, reset, setError, formState: { errors, isSubmitting } } = useForm({ resolver: zodResolver(expenseSchema), defaultValues: blank("") });

  function openCreate() {
    setEditing(null);
    idRef.current = newId("expenses");
    reset(blank(today ?? ""));
    setModal(true);
  }
  function openEdit(e) {
    setEditing(e);
    reset({ name: e.name, category: EXPENSE_CATEGORIES.includes(e.category) ? e.category : "Other", amount: e.amount, date: e.date, method: e.method ?? "cash", notes: e.notes ?? "" });
    setModal(true);
  }

  async function onSubmit(v) {
    if (today && v.date > today) {
      setError("date", { message: "Date can't be in the future" });
      return;
    }
    try {
      const fields = { ...v, name: v.name.trim(), amount: round2(v.amount), notes: v.notes ?? "", updated_at: Date.now() };
      if (editing) notifySaved(await updateDocById("expenses", editing.id, fields), "Expense updated");
      else notifySaved(await createDoc("expenses", { ...fields, created_at: Date.now(), created_by: user?.email ?? "" }, idRef.current), "Expense added");
      setModal(false);
    } catch (err) {
      toast.error(errorMessage(err, "Could not save expense"));
    }
  }
  async function handleDelete() {
    setBusy(true);
    try { notifySaved(await deleteDocById("expenses", deleting.id), "Expense removed"); setDeleting(null); }
    catch (err) { toast.error(errorMessage(err, "Failed to remove expense")); }
    finally { setBusy(false); }
  }

  const filtered = useMemo(() => expenses.filter((e) => (!cat || e.category === cat) && (!from || e.date >= from) && (!to || e.date <= to)), [expenses, cat, from, to]);
  const total = round2(filtered.reduce((s, e) => s + Number(e.amount || 0), 0));
  const thisMonth = round2(expenses.filter((e) => (e.date ?? "").startsWith((today ?? "").slice(0, 7))).reduce((s, e) => s + Number(e.amount || 0), 0));

  function exportExcel() {
    const rows = filtered.map((e) => ({ Date: e.date, Name: e.name, Category: e.category, Method: e.method ?? "", Amount: e.amount, Notes: e.notes ?? "" }));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), "Expenses");
    XLSX.writeFile(wb, "expenses.xlsx");
  }

  return (
    <div className="space-y-4">
      <PageHeader title="Expenses" description="Money you spend running the business. Delivery costs are entered on each order." actions={<><Button variant="secondary" onClick={exportExcel}><FileSpreadsheet className="h-4 w-4" /> Excel</Button><Button onClick={openCreate}><Plus className="h-4 w-4" /> Add Expense</Button></>} />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label={cat || from || to ? "Expenses (filtered)" : "Total expenses"} value={formatCurrency(total, cur)} tone="red" valueTone="red" sub={`${filtered.length} entries`} />
        <StatCard label="This month" value={formatCurrency(thisMonth, cur)} tone="red" />
        <StatCard label="Delivery costs (orders)" value={formatCurrency(biz.deliveryCosts, cur)} tone="gray" hint="From orders; already counted in money spent." />
        <StatCard label="Total money spent" value={formatCurrency(biz.moneySpent, cur)} tone="red" hint="Expenses + delivery costs." />
      </div>

      <Card>
        <CardBody className="grid grid-cols-1 gap-3 sm:grid-cols-4">
          <div><Label>Category</Label><Select value={cat} onChange={(e) => setCat(e.target.value)}><option value="">All categories</option>{EXPENSE_CATEGORIES.map((c) => <option key={c}>{c}</option>)}</Select></div>
          <div><Label>From</Label><Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></div>
          <div><Label>To</Label><Input type="date" value={to} onChange={(e) => setTo(e.target.value)} /></div>
          <div className="flex items-end"><Button variant="ghost" onClick={() => { setCat(""); setFrom(""); setTo(""); }}>Clear filters</Button></div>
        </CardBody>
      </Card>

      <Card>
        <CardBody className="overflow-x-auto p-0">
          <table className="w-full text-sm">
            <thead className="bg-steel-50 text-left text-xs uppercase tracking-wide text-steel-400 dark:bg-steel-900">
              <tr><th className="px-4 py-3">Date</th><th className="px-4 py-3">Name</th><th className="px-4 py-3">Category</th><th className="px-4 py-3">Paid by</th><th className="px-4 py-3 text-right">Amount</th><th className="px-4 py-3">Notes</th><th className="px-4 py-3 text-right">Actions</th></tr>
            </thead>
            <tbody>
              {!loaded.expenses && Array.from({ length: 4 }).map((_, i) => <SkeletonRow key={i} cols={7} />)}
              {loaded.expenses && filtered.map((e) => (
                <tr key={e.id} className="border-t border-steel-100 dark:border-steel-700">
                  <td className="px-4 py-3 whitespace-nowrap">{formatDate(e.date)}</td>
                  <td className="px-4 py-3 font-medium text-steel-700 dark:text-steel-200">{e.name}</td>
                  <td className="px-4 py-3"><span className="rounded-full bg-steel-100 px-2 py-0.5 text-xs font-semibold text-steel-600 dark:bg-steel-700 dark:text-steel-300">{e.category}</span></td>
                  <td className="px-4 py-3">{e.method ? <MethodBadge method={e.method} /> : <span className="text-steel-400">—</span>}</td>
                  <td className="px-4 py-3 text-right font-mono text-danger">{formatCurrency(e.amount, cur)}</td>
                  <td className="px-4 py-3 text-steel-400">{e.notes || "—"}</td>
                  <td className="px-4 py-3"><div className="flex justify-end gap-1">
                    <button onClick={() => openEdit(e)} className="rounded-md p-1.5 text-steel-400 hover:bg-steel-100 hover:text-instrument-600 dark:hover:bg-steel-700" aria-label="Edit"><Pencil className="h-4 w-4" /></button>
                    <button onClick={() => setDeleting(e)} className="rounded-md p-1.5 text-steel-400 hover:bg-danger/10 hover:text-danger" aria-label="Delete"><Trash2 className="h-4 w-4" /></button>
                  </div></td>
                </tr>
              ))}
              {loaded.expenses && filtered.length === 0 && <tr><td colSpan={7} className="px-4 py-10 text-center text-steel-400">No expenses found.</td></tr>}
            </tbody>
          </table>
        </CardBody>
      </Card>

      <Modal open={modal} onClose={() => setModal(false)} title={editing ? "Edit Expense" : "Add Expense"} size="sm">
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div><Label>Name</Label><Input {...register("name")} error={errors.name?.message} placeholder="e.g. Ink and plates" /></div>
          <div className="grid grid-cols-2 gap-3">
            <div><Label>Category</Label><Select {...register("category")}>{EXPENSE_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}</Select></div>
            <div><Label>Paid by</Label><Select {...register("method")}>{PAYMENT_METHODS.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}</Select></div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div><Label>Amount</Label><Input type="number" step="0.01" min="0" inputMode="decimal" {...register("amount")} error={errors.amount?.message} /></div>
            <div><Label>Date</Label><Input type="date" {...register("date")} error={errors.date?.message} max={today ?? undefined} /></div>
          </div>
          <div><Label>Notes (optional)</Label><Input {...register("notes")} /></div>
          <p className="text-xs text-steel-400">If a product's unit cost on orders already includes raw material, don't also enter that material here, or it will be counted twice in profit.</p>
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="secondary" onClick={() => setModal(false)}>Cancel</Button>
            <Button type="submit" loading={isSubmitting}>{editing ? "Save Changes" : "Add Expense"}</Button>
          </div>
        </form>
      </Modal>
      <ConfirmDialog target={deleting} title="Remove expense?" busy={busy} onCancel={() => setDeleting(null)} onConfirm={handleDelete} confirmLabel="Remove">
        This permanently removes "{deleting?.name}" and raises your available cash by {deleting ? formatCurrency(deleting.amount, cur) : ""}.
      </ConfirmDialog>
    </div>
  );
}
