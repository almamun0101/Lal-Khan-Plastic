"use client";
import { useEffect, useRef } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";
import { useSettings } from "@/contexts/SettingsContext";
import { useData } from "@/contexts/DataContext";
import { staffPaymentSchema } from "@/lib/schemas";
import { PAYMENT_METHODS } from "@/lib/constants";
import { createDoc, errorMessage, newId, notifySaved, updateDocById } from "@/lib/firestore-service";
import { formatCurrency, round2 } from "@/lib/utils";
import { Modal } from "@/components/ui/Modal";
import { Input, Label, Textarea } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Button } from "@/components/ui/Button";

/** Give a worker an advance, or pay (part of) their salary. Both are deducted from what they've earned. */
export function StaffPaymentModal({ open, onClose, payment, workerId = "", type = "advance" }) {
  const { user } = useAuth();
  const { settings } = useSettings();
  const { data, biz, today } = useData();
  const idRef = useRef("");
  const cur = settings.currency;

  const { register, handleSubmit, reset, watch, setValue, setError, formState: { errors, isSubmitting } } = useForm({
    resolver: zodResolver(staffPaymentSchema),
    defaultValues: { worker_id: "", type: "advance", amount: "", date: "", method: "cash", note: "" },
  });

  useEffect(() => {
    if (!open) return;
    idRef.current = payment?.id ?? newId("staff_payments");
    reset(
      payment
        ? { worker_id: payment.worker_id, type: payment.type, amount: payment.amount, date: payment.date, method: payment.method ?? "cash", note: payment.note ?? "" }
        : { worker_id: workerId, type, amount: "", date: today ?? "", method: "cash", note: "" }
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, payment, workerId, type]);

  const selectedWorker = watch("worker_id");
  const kind = watch("type");
  const amount = Number(watch("amount")) || 0;
  const bal = biz.staffBalances.find((b) => b.worker.id === selectedWorker);
  // When editing, add this payment's own amount back before judging the balance.
  const available = bal ? round2(bal.balance + (payment && payment.worker_id === selectedWorker ? Number(payment.amount) : 0)) : 0;
  const tooMuch = bal && amount > Math.max(0, available) + 0.005;

  async function onSubmit(v) {
    if (today && v.date > today) {
      setError("date", { message: "Date can't be in the future" });
      return;
    }
    try {
      const fields = { worker_id: v.worker_id, type: v.type, amount: round2(v.amount), date: v.date, method: v.method, note: v.note ?? "", updated_at: Date.now() };
      if (payment) notifySaved(await updateDocById("staff_payments", payment.id, fields), "Updated");
      else notifySaved(await createDoc("staff_payments", { ...fields, created_at: Date.now(), created_by: user?.email ?? "" }, idRef.current), v.type === "advance" ? "Advance recorded" : "Salary payment recorded");
      onClose();
    } catch (err) {
      toast.error(errorMessage(err, "Could not save"));
    }
  }

  const workers = data.workers.filter((w) => w.status !== "inactive" || w.id === selectedWorker);

  return (
    <Modal open={open} onClose={onClose} title={payment ? "Edit staff payment" : kind === "advance" ? "Give advance" : "Pay salary"} size="md">
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <div className="col-span-2 sm:col-span-1">
            <Label>Worker *</Label>
            <Select {...register("worker_id")} error={errors.worker_id?.message}>
              <option value="">Select worker</option>
              {workers.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
            </Select>
          </div>
          <div className="col-span-2 sm:col-span-1">
            <Label>Type</Label>
            <Select {...register("type")}>
              <option value="advance">Advance (taken early)</option>
              <option value="salary">Salary payment</option>
            </Select>
          </div>
        </div>

        {bal && (
          <p className="rounded-lg bg-steel-50 px-3 py-2 text-xs text-steel-500 dark:bg-steel-900 dark:text-steel-400">
            Earned so far {formatCurrency(bal.earned, cur)} · already taken {formatCurrency(bal.paid, cur)} ·{" "}
            {bal.balance >= 0 ? <>payable now <strong className="font-mono">{formatCurrency(bal.balance, cur)}</strong></> : <span className="text-danger">over-advance {formatCurrency(-bal.balance, cur)}</span>}
          </p>
        )}

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <Label>Amount *</Label>
            <Input type="number" step="0.01" min="0" inputMode="decimal" {...register("amount")} error={errors.amount?.message} />
            {kind === "salary" && bal && bal.balance > 0 && (
              <button type="button" onClick={() => setValue("amount", bal.balance, { shouldValidate: true })} className="mt-1 text-xs font-medium text-instrument-600 hover:underline dark:text-gauge-300">
                Pay full {formatCurrency(bal.balance, cur)}
              </button>
            )}
          </div>
          <div>
            <Label>Date *</Label>
            <Input type="date" {...register("date")} error={errors.date?.message} max={today ?? undefined} />
          </div>
        </div>
        {tooMuch && (
          <p className="rounded-lg bg-gauge-50 px-3 py-2 text-xs text-gauge-700 dark:bg-gauge-900/20 dark:text-gauge-300">
            This is more than {kind === "advance" ? "they've earned so far" : "they are owed"}. It will be recorded as an over-advance and deducted from their coming salary.
          </p>
        )}
        <div>
          <Label>Paid by</Label>
          <Select {...register("method")}>{PAYMENT_METHODS.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}</Select>
        </div>
        <div>
          <Label>Note (optional)</Label>
          <Textarea rows={2} {...register("note")} placeholder="Reason, e.g. medical, Eid" />
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="secondary" onClick={onClose}>Cancel</Button>
          <Button type="submit" loading={isSubmitting}>{payment ? "Save Changes" : kind === "advance" ? "Give Advance" : "Record Salary Payment"}</Button>
        </div>
      </form>
    </Modal>
  );
}
