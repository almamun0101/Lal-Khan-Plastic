"use client";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { useData } from "@/contexts/DataContext";
import { useSettings } from "@/contexts/SettingsContext";
import { deliveryPatch, normalizeOrder } from "@/lib/finance";
import { errorMessage, notifySaved, updateDocById } from "@/lib/firestore-service";
import { formatCurrency } from "@/lib/utils";
import { Modal } from "@/components/ui/Modal";
import { Input, Label } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";

/** Record a (full or partial) delivery: quantities per item, courier, tracking ID and delivery cost. */
export function DeliveryModal({ open, onClose, order }) {
  const { today } = useData();
  const { settings } = useSettings();
  const [qtys, setQtys] = useState([]);
  const [f, setF] = useState({ courier: "", tracking_id: "", delivery_date: "", delivery_cost: 0 });
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");

  useEffect(() => {
    if (!open || !order) return;
    const items = normalizeOrder(order).items;
    setQtys(items.map((i) => i.delivered_qty));
    setF({ courier: order.courier ?? "", tracking_id: order.tracking_id ?? "", delivery_date: order.delivery_date || today || "", delivery_cost: order.delivery_cost ?? 0 });
    setErr("");
  }, [open, order, today]);

  if (!order) return null;
  const items = normalizeOrder(order).items;

  async function save() {
    setErr("");
    for (let i = 0; i < items.length; i++) {
      const q = Number(qtys[i]);
      if (!Number.isFinite(q) || q < 0 || q > items[i].qty) {
        setErr(`"${items[i].name}": delivered quantity must be between 0 and ${items[i].qty}.`);
        return;
      }
    }
    const cost = Number(f.delivery_cost);
    if (!Number.isFinite(cost) || cost < 0) {
      setErr("Delivery cost can't be negative.");
      return;
    }
    const any = qtys.some((q) => Number(q) > 0);
    if (any && f.delivery_date && today && f.delivery_date > today) {
      setErr("Delivery date can't be in the future.");
      return;
    }
    setSaving(true);
    try {
      const patch = deliveryPatch(order, qtys, {
        courier: f.courier.trim(),
        tracking_id: f.tracking_id.trim(),
        delivery_date: any ? f.delivery_date || today || "" : "",
        delivery_cost: cost,
        updated_at: Date.now(),
      });
      notifySaved(await updateDocById("sales_orders", order.id, patch), patch.status === "delivered" ? "Order marked delivered" : "Delivery updated");
      onClose();
    } catch (e) {
      toast.error(errorMessage(e, "Could not update the delivery"));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title={`Delivery · ${order.order_no ?? ""}`} size="lg">
      <div className="space-y-4">
        <div className="overflow-x-auto rounded-lg border border-steel-100 dark:border-steel-700">
          <table className="w-full text-sm">
            <thead className="bg-steel-50 text-left text-xs uppercase tracking-wide text-steel-400 dark:bg-steel-900">
              <tr><th className="px-3 py-2">Item</th><th className="px-3 py-2 text-right">Ordered</th><th className="px-3 py-2 text-right">Delivered</th></tr>
            </thead>
            <tbody>
              {items.map((it, i) => (
                <tr key={i} className="border-t border-steel-100 dark:border-steel-700">
                  <td className="px-3 py-2">{it.name}</td>
                  <td className="px-3 py-2 text-right font-mono">{it.qty}</td>
                  <td className="px-3 py-2">
                    <div className="ml-auto flex w-32 items-center gap-1">
                      <Input type="number" min="0" max={it.qty} step="any" value={qtys[i] ?? 0} onChange={(e) => setQtys((q) => q.map((x, j) => (j === i ? e.target.value : x)))} />
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button type="button" size="sm" variant="secondary" onClick={() => setQtys(items.map((i) => i.qty))}>Deliver everything</Button>
          <Button type="button" size="sm" variant="ghost" onClick={() => setQtys(items.map(() => 0))}>Nothing delivered</Button>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div><Label>Courier</Label><Input value={f.courier} onChange={(e) => setF({ ...f, courier: e.target.value })} placeholder="Steadfast, Pathao…" /></div>
          <div><Label>Tracking ID</Label><Input value={f.tracking_id} onChange={(e) => setF({ ...f, tracking_id: e.target.value })} /></div>
          <div><Label>Delivery date</Label><Input type="date" value={f.delivery_date} max={today ?? undefined} onChange={(e) => setF({ ...f, delivery_date: e.target.value })} /></div>
          <div>
            <Label>Delivery cost (you pay)</Label>
            <Input type="number" min="0" step="0.01" inputMode="decimal" value={f.delivery_cost} onChange={(e) => setF({ ...f, delivery_cost: e.target.value })} />
            <p className="mt-1 text-xs text-steel-400">Counted as money spent. Currently {formatCurrency(order.delivery_cost ?? 0, settings.currency)}.</p>
          </div>
        </div>
        {err && <p className="rounded-lg bg-danger/10 px-3 py-2 text-sm text-danger">{err}</p>}
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button loading={saving} onClick={save}>Save Delivery</Button>
        </div>
      </div>
    </Modal>
  );
}
