"use client";
import { useRef, useState } from "react";
import Link from "next/link";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Plus, Pencil, Trash2, ArrowRight } from "lucide-react";
import { toast } from "sonner";
import { useCollection } from "@/hooks/useCollection";
import { useData } from "@/contexts/DataContext";
import { useSettings } from "@/contexts/SettingsContext";
import { createDoc, updateDocById, deleteDocById, newId, notifySaved, errorMessage } from "@/lib/firestore-service";
import { workerSchema } from "@/lib/schemas";
import { dailyRate } from "@/lib/payroll";
import { formatCurrency, formatDate } from "@/lib/utils";
import { Card, CardBody } from "@/components/ui/Card";
import { Input, Label } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { SkeletonRow } from "@/components/ui/Skeleton";

const blank = (today) => ({ name: "", phone: "", status: "active", joining_date: today ?? "", salary_type: "monthly", salary_amount: "" });

function WorkersPage() {
  const { settings } = useSettings();
  const { today } = useData();
  const { data: workers, loading } = useCollection("workers");
  const [modalOpen, setModalOpen] = useState(false);
  const [editingWorker, setEditingWorker] = useState(null);
  const [deleting, setDeleting] = useState(null);
  const [busy, setBusy] = useState(false);
  const idRef = useRef("");
  const { register, handleSubmit, reset, watch, formState: { errors, isSubmitting } } = useForm({
    resolver: zodResolver(workerSchema),
    defaultValues: blank(""),
  });
  const salaryType = watch("salary_type");
  const salaryAmount = Number(watch("salary_amount")) || 0;

  function openCreate() {
    setEditingWorker(null);
    idRef.current = newId("workers");
    reset(blank(today));
    setModalOpen(true);
  }
  function openEdit(w) {
    setEditingWorker(w);
    reset({ name: w.name, phone: w.phone ?? "", status: w.status, joining_date: w.joining_date ?? "", salary_type: w.salary_type ?? "monthly", salary_amount: w.salary_amount ?? "" });
    setModalOpen(true);
  }
  async function onSubmit(values) {
    try {
      const fields = { ...values, name: values.name.trim(), phone: (values.phone ?? "").trim(), salary_amount: Number(values.salary_amount) };
      if (editingWorker) notifySaved(await updateDocById("workers", editingWorker.id, { ...fields, updated_at: Date.now() }), "Worker updated");
      else notifySaved(await createDoc("workers", { ...fields, created_at: Date.now() }, idRef.current), "Worker added");
      setModalOpen(false);
    } catch (err) {
      toast.error(errorMessage(err, "Could not save worker"));
    }
  }
  async function handleDelete() {
    if (!deleting) return;
    setBusy(true);
    try {
      notifySaved(await deleteDocById("workers", deleting.id), "Worker removed");
      setDeleting(null);
    } catch (err) {
      toast.error(errorMessage(err, "Failed to remove worker"));
    } finally {
      setBusy(false);
    }
  }

  const preview = dailyRate({ salary_type: salaryType, salary_amount: salaryAmount }, settings);

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="font-display text-2xl font-bold text-steel-800 dark:text-steel-50">Workers</h1>
          <p className="mt-1 text-sm text-steel-500 dark:text-steel-400">{workers.length} workers registered · salary is worked out on the <Link href="/salary" className="text-instrument-600 hover:underline dark:text-gauge-300">Salary page</Link></p>
        </div>
        <Button onClick={openCreate}><Plus className="h-4 w-4" /> Add Worker</Button>
      </div>

      <Card>
        <CardBody className="overflow-x-auto p-0">
          <table className="w-full text-sm">
            <thead className="bg-steel-50 text-left text-xs uppercase tracking-wide text-steel-400 dark:bg-steel-900">
              <tr>
                <th className="px-4 py-3">Name</th>
                <th className="px-4 py-3">Phone</th>
                <th className="px-4 py-3">Joined</th>
                <th className="px-4 py-3 text-right">Salary</th>
                <th className="px-4 py-3 text-right">Per day</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading && Array.from({ length: 4 }).map((_, i) => <SkeletonRow key={i} cols={7} />)}
              {!loading && workers.map((w) => (
                <tr key={w.id} className="border-t border-steel-100 dark:border-steel-700">
                  <td className="px-4 py-3 font-medium text-steel-700 dark:text-steel-200">{w.name}</td>
                  <td className="px-4 py-3">{w.phone || "—"}</td>
                  <td className="px-4 py-3 whitespace-nowrap">{w.joining_date ? formatDate(w.joining_date) : <span className="text-gauge-600">Not set</span>}</td>
                  <td className="px-4 py-3 text-right font-mono">{w.salary_amount ? <>{formatCurrency(w.salary_amount, settings.currency)}<span className="text-xs text-steel-400">{w.salary_type === "daily" ? " /day" : " /month"}</span></> : <span className="text-gauge-600">Not set</span>}</td>
                  <td className="px-4 py-3 text-right font-mono">{formatCurrency(dailyRate(w, settings), settings.currency)}</td>
                  <td className="px-4 py-3">
                    <span className={"rounded-full px-2 py-0.5 text-xs font-semibold " + (w.status === "active" ? "bg-ok/10 text-ok" : "bg-steel-200 text-steel-600 dark:bg-steel-700")}>{w.status}</span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex justify-end gap-1">
                      <Link href={`/workers/${w.id}`} className="rounded-md p-1.5 text-steel-400 hover:bg-steel-100 hover:text-instrument-600 dark:hover:bg-steel-700" aria-label="Open profile"><ArrowRight className="h-4 w-4" /></Link>
                      <button onClick={() => openEdit(w)} className="rounded-md p-1.5 text-steel-400 hover:bg-steel-100 hover:text-instrument-600 dark:hover:bg-steel-700" aria-label="Edit"><Pencil className="h-4 w-4" /></button>
                      <button onClick={() => setDeleting(w)} className="rounded-md p-1.5 text-steel-400 hover:bg-danger/10 hover:text-danger" aria-label="Delete"><Trash2 className="h-4 w-4" /></button>
                    </div>
                  </td>
                </tr>
              ))}
              {!loading && workers.length === 0 && <tr><td colSpan={7} className="px-4 py-10 text-center text-steel-400">No workers yet. Add your first one.</td></tr>}
            </tbody>
          </table>
        </CardBody>
      </Card>

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title={editingWorker ? "Edit Worker" : "Add Worker"} size="md">
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div>
            <Label>Full name *</Label>
            <Input {...register("name")} error={errors.name?.message} autoFocus />
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <Label>Phone</Label>
              <Input {...register("phone")} inputMode="tel" />
            </div>
            <div>
              <Label>Joining date *</Label>
              <Input type="date" {...register("joining_date")} error={errors.joining_date?.message} />
            </div>
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <Label>Salary type</Label>
              <Select {...register("salary_type")}>
                <option value="monthly">Monthly salary</option>
                <option value="daily">Per-day wage</option>
              </Select>
            </div>
            <div>
              <Label>{salaryType === "daily" ? "Wage per day *" : "Monthly salary *"}</Label>
              <Input type="number" min="0" step="0.01" inputMode="decimal" {...register("salary_amount")} error={errors.salary_amount?.message} />
            </div>
          </div>
          <p className="rounded-lg bg-steel-50 px-3 py-2 text-xs text-steel-500 dark:bg-steel-900 dark:text-steel-400">
            Pay per present day: <strong className="font-mono">{formatCurrency(preview, settings.currency)}</strong>
            {salaryType === "monthly" && <> (monthly salary ÷ {settings.salary_days_per_month} days)</>}. A day counts as present when the worker is on a production duty. Covering an extra shift on the same date is overtime at {formatCurrency(settings.overtime_rate, settings.currency)}.
          </p>
          <div>
            <Label>Status</Label>
            <Select {...register("status")}>
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
            </Select>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="secondary" onClick={() => setModalOpen(false)}>Cancel</Button>
            <Button type="submit" loading={isSubmitting}>{editingWorker ? "Save Changes" : "Add Worker"}</Button>
          </div>
        </form>
      </Modal>

      <ConfirmDialog target={deleting} title="Remove worker?" confirmLabel="Remove" busy={busy} onCancel={() => setDeleting(null)} onConfirm={handleDelete}>
        {deleting?.name} will be removed from the worker list. Past production logs and salary payments are kept, but their attendance will no longer count towards salary, so mark them Inactive instead if you only want to hide them.
      </ConfirmDialog>
    </div>
  );
}
export { WorkersPage as default };
