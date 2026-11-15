"use client";
import { useEffect, useMemo, useRef } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";
import { useSettings } from "@/contexts/SettingsContext";
import { useData } from "@/contexts/DataContext";
import { paymentSchema } from "@/lib/schemas";
import { PAYMENT_METHODS } from "@/lib/constants";
import { createDoc, errorMessage, newId, notifySaved, updateDocById } from "@/lib/firestore-service";
import { formatCurrency, formatDate, round2 } from "@/lib/utils";
import { Modal } from "@/components/ui/Modal";
import { Input, Label, Textarea } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Button } from "@/components/ui/Button";

/**
 * Record (or edit) a payment.
 *  - Tie it to an order, or leave it "on account": on-account money automatically
 *    settles the client's oldest unpaid order first, and anything beyond that is
 *    kept as the client's advance.
 *  - Partial payments are normal: record as many as you like against one order.
 */
export function PaymentFormModal({ open, onClose, payment, clientId = "", orderId = "" }) {
  const { user } = useAuth();
  const { settings } = useSettings();
  const { data, biz, today } = useData();
  const idRef = useRef("");

  const { register, handleSubmit, reset, watch, setValue, setError, formState: { errors, isSubmitting } } = useForm({
    resolver: zodResolver(paymentSchema),
    defaultValues: { client_id: "", order_id: "", amount: "", date: "", method: "cash", reference: "", notes: "" },
  });

  useEffect(() => {
    if (!open) return;
    idRef.current = payment?.id ?? newId("payments");
    reset(
      payment
        ? { client_id: payment.client_id, order_id: payment.order_id ?? "", amount: payment.amount, date: payment.date, method: payment.method ?? "cash", reference: payment.reference ?? "", notes: payment.notes ?? "" }
        : { client_id: clientId, order_id: orderId, amount: "", date: today ?? "", method: "cash", reference: "", notes: "" }
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, payment, clientId, orderId]);

  const selectedClient = watch("client_id");
  const selectedOrder = watch("order_id");

  // Orders of the chosen client that can still receive money.
  const orderOptions = useMemo(() => {
    if (!selectedClient) return [];
    return biz.orderRows.filter((r) => r.client.id === selectedClient && (r.due > 0.004 || r.id === payment?.order_id));
  }, [biz.orderRows, selectedClient, payment]);

  const selectedRow = selectedOrder ? biz.orderRowById.get(selectedOrder) : null;
  // How much the chosen order can still take. When editing, this payment's own
  // contribution is added back first.
  const room = useMemo(() => {
    if (!selectedRow) return null;
    const own = payment ? selectedRow.applied.filter((a) => a.payment_id === payment.id).reduce((s, a) => s + a.amount, 0) : 0;
    return round2(selectedRow.total - (selectedRow.paid - own));
  }, [selectedRow, payment]);

  const clientStat = biz.clientStats.find((c) => c.id === selectedClient);

  async function onSubmit(v) {
    if (today && v.date > today) {
      setError("date", { message: "Payment date can't be in the future" });
      return;
    }
    if (v.order_id && room != null && v.amount > room + 0.005) {
      setError("amount", { message: `More than this order still owes (${formatCurrency(room, settings.currency)}). Choose "On account" to keep the extra as an advance.` });
      return;
    }
    try {
      const fields = {
        client_id: v.client_id,
        order_id: v.order_id || "",
        amount: round2(v.amount),
        date: v.date,
        method: v.method,
        reference: (v.reference ?? "").trim(),
        notes: v.notes ?? "",
        updated_at: Date.now(),
      };
      if (payment) {
        notifySaved(await updateDocById("payments", payment.id, fields), "Payment updated");
      } else {
        notifySaved(await createDoc("payments", { ...fields, created_at: Date.now(), created_by: user?.email ?? "" }, idRef.current), "Payment recorded");
      }
      onClose();
    } catch (err) {
      toast.error(errorMessage(err, "Could not save the payment"));
    }
  }

  const activeClients = data.clients.filter((c) => c.status !== "inactive" || c.id === selectedClient);

  return (
    <Modal open={open} onClose={onClose} title={payment ? "Edit Payment" : "Record Payment"} size="md">
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        <div>
          <Label>Client *</Label>
          <Select
            {...register("client_id", { onChange: () => setValue("order_id", "") })}
            error={errors.client_id?.message}
          >
            <option value="">Select client</option>
            {activeClients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </Select>
          {clientStat && (
            <p className="mt-1 text-xs text-steel-500 dark:text-steel-400">
              Currently owes <strong className="font-mono">{formatCurrency(clientStat.due, settings.currency)}</strong>
              {clientStat.credit > 0 && <> · advance held {formatCurrency(clientStat.credit, settings.currency)}</>}
            </p>
          )}
        </div>

        <div>
          <Label>Apply to</Label>
          <Select {...register("order_id")} disabled={!selectedClient}>
            <option value="">On account (settles oldest unpaid order first)</option>
            {orderOptions.map((r) => (
              <option key={r.id} value={r.id}>{r.order.order_no} · {formatDate(r.order.order_date)} · due {formatCurrency(r.due, settings.currency)}</option>
            ))}
            {payment?.order_id && !orderOptions.some((r) => r.id === payment.order_id) && <option value={payment.order_id}>Linked order (no longer open)</option>}
          </Select>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <Label>Amount *</Label>
            <Input type="number" step="0.01" min="0" inputMode="decimal" {...register("amount")} error={errors.amount?.message} placeholder="0.00" />
            {selectedRow && room > 0 && (
              <button type="button" onClick={() => setValue("amount", room, { shouldValidate: true })} className="mt-1 text-xs font-medium text-instrument-600 hover:underline dark:text-gauge-300">
                Pay full remaining {formatCurrency(room, settings.currency)}
              </button>
            )}
          </div>
          <div>
            <Label>Date *</Label>
            <Input type="date" {...register("date")} error={errors.date?.message} max={today ?? undefined} />
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <Label>Payment method *</Label>
            <Select {...register("method")}>
              {PAYMENT_METHODS.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
            </Select>
          </div>
          <div>
            <Label>Reference (optional)</Label>
            <Input {...register("reference")} placeholder="bKash TrxID, cheque no…" />
          </div>
        </div>

        <div>
          <Label>Notes (optional)</Label>
          <Textarea rows={2} {...register("notes")} />
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="secondary" onClick={onClose}>Cancel</Button>
          <Button type="submit" loading={isSubmitting}>{payment ? "Save Changes" : "Record Payment"}</Button>
        </div>
      </form>
    </Modal>
  );
}
