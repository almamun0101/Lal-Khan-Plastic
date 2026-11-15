"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { useFieldArray, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Plus, Trash2, UserPlus } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";
import { useSettings } from "@/contexts/SettingsContext";
import { useData } from "@/contexts/DataContext";
import { salesOrderSchema } from "@/lib/schemas";
import { PAYMENT_METHODS } from "@/lib/constants";
import { createDoc, createSalesOrder, errorMessage, newId, notifySaved, updateDocById } from "@/lib/firestore-service";
import { deliveryPatch } from "@/lib/finance";
import { addDays, formatCurrency, round2 } from "@/lib/utils";
import { Modal } from "@/components/ui/Modal";
import { Input, Label, Textarea } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Button } from "@/components/ui/Button";
import { ClientFormModal } from "./ClientFormModal";

const blankItem = () => ({ product_id: "", name: "", qty: 1, unit_price: 0, unit_cost: 0, customization: "", delivered_qty: 0 });
const n = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);

/**
 * Create or edit a customer order: one client, any number of products, each with
 * its own quantity, price, cost and customisation, plus delivery details.
 * An optional "advance received" is saved as a real payment linked to the order.
 */
export function OrderFormModal({ open, onClose, order, clientId = "", onSaved }) {
  const { user } = useAuth();
  const { settings } = useSettings();
  const { data, today } = useData();
  const idRef = useRef("");
  const payIdRef = useRef("");
  const [clientModal, setClientModal] = useState(false);

  const { register, control, handleSubmit, reset, watch, setValue, setError, formState: { errors, isSubmitting } } = useForm({
    resolver: zodResolver(salesOrderSchema),
    defaultValues: { client_id: "", order_date: "", due_date: "", expected_delivery_date: "", items: [blankItem()], discount: 0, delivery_charge: 0, delivery_cost: 0, delivery_address: "", courier: "", tracking_id: "", notes: "", advance: 0, advance_method: "cash" },
  });
  const { fields, append, remove } = useFieldArray({ control, name: "items" });

  useEffect(() => {
    if (!open) return;
    idRef.current = order?.id ?? newId("sales_orders");
    payIdRef.current = newId("payments");
    if (order) {
      reset({
        client_id: order.client_id ?? "",
        order_date: order.order_date ?? "",
        due_date: order.due_date ?? "",
        expected_delivery_date: order.expected_delivery_date ?? "",
        items: (order.items?.length ? order.items : [blankItem()]).map((i) => ({ ...blankItem(), ...i })),
        discount: order.discount ?? 0,
        delivery_charge: order.delivery_charge ?? 0,
        delivery_cost: order.delivery_cost ?? 0,
        delivery_address: order.delivery_address ?? "",
        courier: order.courier ?? "",
        tracking_id: order.tracking_id ?? "",
        notes: order.notes ?? "",
        advance: 0,
        advance_method: "cash",
      });
    } else {
      const t = today ?? "";
      reset({
        client_id: clientId, order_date: t, due_date: t ? addDays(t, settings.credit_days) : "", expected_delivery_date: "",
        items: [blankItem()], discount: 0, delivery_charge: 0, delivery_cost: 0, delivery_address: data.clients.find((c) => c.id === clientId)?.address ?? "",
        courier: "", tracking_id: "", notes: "", advance: 0, advance_method: "cash",
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, order, clientId]);

  const items = watch("items");
  const discount = n(watch("discount"));
  const deliveryCharge = n(watch("delivery_charge"));
  const deliveryCost = n(watch("delivery_cost"));
  const advance = n(watch("advance"));
  const orderDate = watch("order_date");

  const totals = useMemo(() => {
    const subtotal = (items ?? []).reduce((s, i) => s + n(i.qty) * n(i.unit_price), 0);
    const productCost = (items ?? []).reduce((s, i) => s + n(i.qty) * n(i.unit_cost), 0);
    const total = Math.max(0, subtotal - discount) + deliveryCharge;
    return { subtotal: round2(subtotal), total: round2(total), productCost: round2(productCost), profit: round2(total - productCost - deliveryCost) };
  }, [items, discount, deliveryCharge, deliveryCost]);

  function pickProduct(index, productId) {
    const p = data.products.find((x) => x.id === productId);
    if (!p) return;
    setValue(`items.${index}.name`, p.name, { shouldValidate: true });
    setValue(`items.${index}.unit_price`, p.price_per_piece ?? 0);
    setValue(`items.${index}.unit_cost`, p.cost_per_piece ?? 0);
  }

  async function onSubmit(v) {
    // Guard: quantity can't drop below what has already been delivered.
    const bad = v.items.findIndex((i) => i.qty < i.delivered_qty);
    if (bad !== -1) {
      setError(`items.${bad}.qty`, { message: `${v.items[bad].delivered_qty} already delivered` });
      return;
    }
    const cleanItems = v.items.map((i) => ({
      product_id: i.product_id || "",
      name: i.name.trim(),
      qty: n(i.qty),
      unit_price: round2(i.unit_price),
      unit_cost: round2(i.unit_cost),
      customization: (i.customization ?? "").trim(),
      delivered_qty: Math.min(n(i.qty), n(i.delivered_qty)),
    }));
    const base = {
      client_id: v.client_id,
      order_date: v.order_date,
      due_date: v.due_date ?? "",
      expected_delivery_date: v.expected_delivery_date ?? "",
      items: cleanItems,
      discount: round2(v.discount),
      delivery_charge: round2(v.delivery_charge),
      delivery_cost: round2(v.delivery_cost),
      delivery_address: v.delivery_address ?? "",
      courier: (v.courier ?? "").trim(),
      tracking_id: (v.tracking_id ?? "").trim(),
      notes: v.notes ?? "",
      total: totals.total, // convenience copy for the Firebase console; the app always recomputes it
      updated_at: Date.now(),
    };

    try {
      if (order) {
        let patch = base;
        if (order.status !== "cancelled") {
          const d = deliveryPatch({ ...order, items: cleanItems }, cleanItems.map((i) => i.delivered_qty), {});
          patch = { ...base, status: d.status, items: d.items };
        }
        notifySaved(await updateDocById("sales_orders", order.id, patch), "Order updated");
        onSaved?.(order.id);
      } else {
        const nums = data.sales_orders.map((o) => parseInt(String(o.order_no ?? "").replace(/\D/g, ""), 10)).filter(Number.isFinite);
        const floor = nums.length ? Math.max(...nums) : 0;
        const res = await createSalesOrder(
          { ...base, status: "pending", created_at: Date.now(), created_by: user?.email ?? "" },
          { id: idRef.current, floor }
        );
        if (n(v.advance) > 0) {
          try {
            await createDoc(
              "payments",
              { client_id: v.client_id, order_id: res.id, amount: round2(v.advance), date: today && v.order_date > today ? today : v.order_date, method: v.advance_method, reference: "", notes: "Advance received with order", created_at: Date.now(), updated_at: Date.now(), created_by: user?.email ?? "" },
              payIdRef.current
            );
          } catch (err) {
            toast.error(`Order saved, but the advance payment wasn't: ${errorMessage(err)} Record it from the order page.`);
          }
        }
        notifySaved(res, `Order ${res.order_no || ""} created`.trim());
        onSaved?.(res.id);
      }
      onClose();
    } catch (err) {
      toast.error(errorMessage(err, "Could not save the order"));
    }
  }

  const activeClients = data.clients.filter((c) => c.status !== "inactive" || c.id === watch("client_id"));
  const cur = settings.currency;

  return (
    <>
      <Modal open={open} onClose={onClose} title={order ? `Edit Order ${order.order_no ?? ""}` : "New Order"} size="xl">
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
            <div className="md:col-span-2">
              <Label>Client *</Label>
              <div className="flex gap-2">
                <Select {...register("client_id")} error={errors.client_id?.message}>
                  <option value="">Select client</option>
                  {activeClients.map((c) => <option key={c.id} value={c.id}>{c.name}{c.phone ? ` · ${c.phone}` : ""}</option>)}
                </Select>
                <Button type="button" variant="secondary" onClick={() => setClientModal(true)} aria-label="Add a new client" title="Add a new client"><UserPlus className="h-4 w-4" /></Button>
              </div>
            </div>
            <div>
              <Label>Order date *</Label>
              <Input
                type="date"
                {...register("order_date", { onChange: (e) => { if (!order && e.target.value) setValue("due_date", addDays(e.target.value, settings.credit_days)); } })}
                error={errors.order_date?.message}
              />
            </div>
            <div>
              <Label>Payment due by</Label>
              <Input type="date" {...register("due_date")} error={errors.due_date?.message} min={orderDate || undefined} />
            </div>
          </div>

          <div>
            <div className="mb-2 flex items-center justify-between">
              <Label className="mb-0">Products *</Label>
              <Button type="button" size="sm" variant="secondary" onClick={() => append(blankItem())}><Plus className="h-3.5 w-3.5" /> Add product</Button>
            </div>
            {errors.items?.message && <p className="mb-2 text-xs text-danger">{errors.items.message}</p>}
            <div className="space-y-3">
              {fields.map((field, index) => {
                const row = items?.[index] ?? {};
                const line = n(row.qty) * n(row.unit_price);
                const locked = n(row.delivered_qty) > 0;
                const e = errors.items?.[index];
                return (
                  <div key={field.id} className="rounded-lg border border-steel-100 p-3 dark:border-steel-700">
                    <div className="grid grid-cols-2 gap-3 md:grid-cols-12">
                      <div className="col-span-2 md:col-span-3">
                        <Label>Product</Label>
                        <Select {...register(`items.${index}.product_id`, { onChange: (ev) => pickProduct(index, ev.target.value) })}>
                          <option value="">Custom item</option>
                          {data.products.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                        </Select>
                      </div>
                      <div className="col-span-2 md:col-span-3">
                        <Label>Item name *</Label>
                        <Input {...register(`items.${index}.name`)} error={e?.name?.message} placeholder="What is being sold" />
                      </div>
                      <div className="md:col-span-1">
                        <Label>Qty *</Label>
                        <Input type="number" min="0" step="any" inputMode="decimal" {...register(`items.${index}.qty`)} error={e?.qty?.message} />
                      </div>
                      <div className="md:col-span-2">
                        <Label>Price / unit</Label>
                        <Input type="number" min="0" step="0.01" inputMode="decimal" {...register(`items.${index}.unit_price`)} error={e?.unit_price?.message} />
                      </div>
                      <div className="md:col-span-2">
                        <Label>Cost / unit</Label>
                        <Input type="number" min="0" step="0.01" inputMode="decimal" {...register(`items.${index}.unit_cost`)} error={e?.unit_cost?.message} />
                      </div>
                      <div className="flex items-end justify-between gap-2 md:col-span-1">
                        <div className="min-w-0">
                          <Label>Total</Label>
                          <p className="truncate rounded-lg bg-steel-50 px-2 py-2.5 font-mono text-sm dark:bg-steel-900">{formatCurrency(line, cur)}</p>
                        </div>
                      </div>
                      <div className="col-span-2 md:col-span-11">
                        <Label>Customization / notes</Label>
                        <Input {...register(`items.${index}.customization`)} placeholder="Size, colour, design, text to print…" />
                      </div>
                      <div className="col-span-2 flex items-end justify-end md:col-span-1">
                        <Button
                          type="button" variant="ghost" size="sm"
                          onClick={() => fields.length > 1 && remove(index)}
                          disabled={fields.length === 1 || locked}
                          title={locked ? "Already partly delivered, can't remove" : "Remove this product"}
                          aria-label="Remove product"
                        >
                          <Trash2 className="h-4 w-4 text-danger" />
                        </Button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <div className="space-y-4">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <Label>Expected delivery</Label>
                  <Input type="date" {...register("expected_delivery_date")} />
                </div>
                <div>
                  <Label>Courier</Label>
                  <Input {...register("courier")} placeholder="Steadfast, Pathao…" />
                </div>
                <div>
                  <Label>Tracking ID</Label>
                  <Input {...register("tracking_id")} />
                </div>
                <div>
                  <Label>Delivery cost (you pay)</Label>
                  <Input type="number" min="0" step="0.01" inputMode="decimal" {...register("delivery_cost")} error={errors.delivery_cost?.message} />
                </div>
              </div>
              <div>
                <Label>Delivery address</Label>
                <Textarea rows={2} {...register("delivery_address")} />
              </div>
              <div>
                <Label>Order notes</Label>
                <Textarea rows={2} {...register("notes")} />
              </div>
            </div>

            <div className="space-y-3 rounded-lg bg-steel-50 p-4 dark:bg-steel-900">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Discount</Label>
                  <Input type="number" min="0" step="0.01" inputMode="decimal" {...register("discount")} error={errors.discount?.message} />
                </div>
                <div>
                  <Label>Delivery charge (client pays)</Label>
                  <Input type="number" min="0" step="0.01" inputMode="decimal" {...register("delivery_charge")} error={errors.delivery_charge?.message} />
                </div>
              </div>
              <dl className="space-y-1.5 border-t border-steel-200 pt-3 text-sm dark:border-steel-700">
                <div className="flex justify-between"><dt className="text-steel-500">Products</dt><dd className="font-mono">{formatCurrency(totals.subtotal, cur)}</dd></div>
                {discount > 0 && <div className="flex justify-between"><dt className="text-steel-500">Discount</dt><dd className="font-mono">−{formatCurrency(discount, cur)}</dd></div>}
                {deliveryCharge > 0 && <div className="flex justify-between"><dt className="text-steel-500">Delivery charge</dt><dd className="font-mono">{formatCurrency(deliveryCharge, cur)}</dd></div>}
                <div className="flex justify-between border-t border-steel-200 pt-2 text-base font-bold dark:border-steel-700"><dt>Order total</dt><dd className="font-mono text-instrument-600 dark:text-gauge-300">{formatCurrency(totals.total, cur)}</dd></div>
                <div className="flex justify-between text-xs text-steel-400"><dt>Estimated profit (after product + delivery cost)</dt><dd className={`font-mono ${totals.profit < 0 ? "text-danger" : ""}`}>{formatCurrency(totals.profit, cur)}</dd></div>
              </dl>

              {!order && (
                <div className="border-t border-steel-200 pt-3 dark:border-steel-700">
                  <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-steel-500">Advance received now (optional)</p>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Input type="number" min="0" step="0.01" inputMode="decimal" {...register("advance")} error={errors.advance?.message} placeholder="0" />
                    </div>
                    <Select {...register("advance_method")}>
                      {PAYMENT_METHODS.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
                    </Select>
                  </div>
                  {advance > 0 && <p className="mt-1.5 text-xs text-steel-500">Due after advance: <strong className="font-mono">{formatCurrency(Math.max(0, totals.total - advance), cur)}</strong></p>}
                </div>
              )}
            </div>
          </div>

          <div className="flex justify-end gap-2 border-t border-steel-100 pt-4 dark:border-steel-700">
            <Button type="button" variant="secondary" onClick={onClose}>Cancel</Button>
            <Button type="submit" loading={isSubmitting}>{order ? "Save Changes" : "Create Order"}</Button>
          </div>
        </form>
      </Modal>
      <ClientFormModal open={clientModal} onClose={() => setClientModal(false)} onSaved={(id) => setValue("client_id", id, { shouldValidate: true })} />
    </>
  );
}
