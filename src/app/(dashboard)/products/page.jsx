"use client";
import { useMemo, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Plus, Pencil, Trash2, Package } from "lucide-react";
import { toast } from "sonner";
import { useCollection } from "@/hooks/useCollection";
import { useSettings } from "@/contexts/SettingsContext";
import { createDoc, updateDocById, deleteDocById, newId, notifySaved, errorMessage } from "@/lib/firestore-service";
import { useData } from "@/contexts/DataContext";
import { logItemValue } from "@/lib/finance";
import { productSchema } from "@/lib/schemas";
import { formatCurrency } from "@/lib/utils";
import { Card, CardBody } from "@/components/ui/Card";
import { Input, Label } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { SkeletonCard } from "@/components/ui/Skeleton";
function ProductsPage() {
  const { settings } = useSettings();
  const { data: products, loading } = useCollection("products");
  const { data: logs } = useCollection("production_logs");
  const { biz } = useData();
  const idRef = useRef("");
  const statById = useMemo(() => new Map(biz.productStats.map((s) => [s.product_id, s])), [biz.productStats]);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState(null);
  const [deleting, setDeleting] = useState(null);
  const [busy, setBusy] = useState(false);
  const { register, handleSubmit, reset, formState: { errors, isSubmitting } } = useForm({
    resolver: zodResolver(productSchema),
    defaultValues: { name: "", price_per_piece: 0, cost_per_piece: 0, rate_per_minute: 1 }
  });
  const productStats = useMemo(() => {
    const productById = new Map(products.map((p) => [p.id, p]));
    const map = /* @__PURE__ */ new Map();
    logs.forEach((log) => {
      log.items.forEach((item) => {
        const entry = map.get(item.product_id) ?? { qty: 0, revenue: 0 };
        entry.qty += item.quantity;
        entry.revenue += logItemValue(item, productById);
        map.set(item.product_id, entry);
      });
    });
    return map;
  }, [logs, products]);
  function openCreate() {
    idRef.current = newId("products");
    setEditingProduct(null);
    reset({ name: "", price_per_piece: 0, cost_per_piece: 0, rate_per_minute: 1 });
    setModalOpen(true);
  }
  function openEdit(p) {
    setEditingProduct(p);
    reset({ name: p.name, price_per_piece: p.price_per_piece, cost_per_piece: p.cost_per_piece ?? 0, rate_per_minute: p.rate_per_minute ?? 1 });
    setModalOpen(true);
  }
  async function onSubmit(values) {
    try {
      if (editingProduct) {
        notifySaved(await updateDocById("products", editingProduct.id, values), "Product updated");
      } else {
        notifySaved(await createDoc("products", { ...values, created_at: Date.now() }, idRef.current), "Product added");
      }
      setModalOpen(false);
    } catch (err) {
      toast.error(errorMessage(err, "Could not save product"));
    }
  }
  async function handleDelete() {
    if (!deleting) return;
    setBusy(true);
    try {
      notifySaved(await deleteDocById("products", deleting.id), "Product removed");
      setDeleting(null);
    } catch (err) {
      toast.error(errorMessage(err, "Failed to remove product"));
    } finally {
      setBusy(false);
    }
  }
  return <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="font-display text-2xl font-bold text-steel-800 dark:text-steel-50">Products</h1>
          <p className="mt-1 text-sm text-steel-500 dark:text-steel-400">{products.length} products in the catalog</p>
        </div>
        <Button onClick={openCreate}><Plus className="h-4 w-4" /> Add Product</Button>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {loading && Array.from({ length: 3 }).map((_, i) => <SkeletonCard key={i} />)}
        {!loading && products.map((p) => {
    const stat = productStats.get(p.id) ?? { qty: 0, revenue: 0 };
    return <Card key={p.id}>
              <CardBody>
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-2.5">
                    <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-gauge-50 text-gauge-600 dark:bg-gauge-900/30 dark:text-gauge-300">
                      <Package className="h-5 w-5" />
                    </div>
                    <div>
                      <p className="font-display font-semibold text-steel-800 dark:text-steel-50">{p.name}</p>
                      <p className="font-mono text-xs text-steel-400">Sell {formatCurrency(p.price_per_piece, settings.currency)} · cost {formatCurrency(p.cost_per_piece ?? 0, settings.currency)} · {p.rate_per_minute ?? "?"}/min</p>
                    </div>
                  </div>
                  <div className="flex gap-1">
                    <button onClick={() => openEdit(p)} className="rounded-md p-1.5 text-steel-400 hover:bg-steel-100 hover:text-instrument-600 dark:hover:bg-steel-700" aria-label="Edit">
                      <Pencil className="h-4 w-4" />
                    </button>
                    <button onClick={() => setDeleting(p)} className="rounded-md p-1.5 text-steel-400 hover:bg-danger/10 hover:text-danger" aria-label="Delete">
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>
                <div className="mt-4 grid grid-cols-2 gap-3 border-t border-steel-100 pt-3 dark:border-steel-700">
                  <div>
                    <p className="text-[11px] uppercase tracking-wide text-steel-400">Produced</p>
                    <p className="font-mono text-sm font-semibold text-steel-700 dark:text-steel-200">{stat.qty.toLocaleString()} pcs</p>
                  </div>
                  <div>
                    <p className="text-[11px] uppercase tracking-wide text-steel-400">Production value</p>
                    <p className="font-mono text-sm font-semibold text-steel-500">{formatCurrency(stat.revenue, settings.currency)}</p>
                  </div>
                  <div>
                    <p className="text-[11px] uppercase tracking-wide text-steel-400">Sold / delivered</p>
                    <p className="font-mono text-sm font-semibold">{(statById.get(p.id)?.ordered ?? 0).toLocaleString()} / {(statById.get(p.id)?.delivered ?? 0).toLocaleString()}</p>
                  </div>
                  <div>
                    <p className="text-[11px] uppercase tracking-wide text-steel-400">Est. stock</p>
                    <p className={`font-mono text-sm font-semibold ${(statById.get(p.id)?.stock ?? 0) < 0 ? "text-danger" : "text-ok"}`}>{(statById.get(p.id)?.stock ?? 0).toLocaleString()} pcs</p>
                  </div>
                  <div className="col-span-2">
                    <p className="text-[11px] uppercase tracking-wide text-steel-400">Sales revenue / profit</p>
                    <p className="font-mono text-sm font-semibold text-instrument-600 dark:text-gauge-300">{formatCurrency(statById.get(p.id)?.revenue ?? 0, settings.currency)} <span className="text-ok">/ {formatCurrency(statById.get(p.id)?.profit ?? 0, settings.currency)}</span></p>
                  </div>
                </div>
              </CardBody>
            </Card>;
  })}
        {!loading && products.length === 0 && <p className="text-sm text-steel-400">No products yet. Add your first one.</p>}
      </div>

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title={editingProduct ? "Edit Product" : "Add Product"} size="sm">
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div>
            <Label>Product Name</Label>
            <Input {...register("name")} error={errors.name?.message} placeholder="e.g. Cotton Yarn 40s" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Selling price / piece</Label>
              <Input type="number" step="0.01" {...register("price_per_piece")} error={errors.price_per_piece?.message} />
            </div>
            <div>
              <Label>Cost / piece</Label>
              <Input type="number" step="0.01" {...register("cost_per_piece")} error={errors.cost_per_piece?.message} />
            </div>
          </div>
          <p className="-mt-2 text-xs text-steel-400">Both pre-fill new order lines, so profit is calculated automatically. You can still change them per order.</p>
          <div>
            <Label>Rate (pieces / minute)</Label>
            <Input type="number" step="0.1" {...register("rate_per_minute")} error={errors.rate_per_minute?.message} />
            <p className="mt-1 text-xs text-steel-400">Used to suggest order completion times on the Orders page.</p>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="secondary" onClick={() => setModalOpen(false)}>Cancel</Button>
            <Button type="submit" loading={isSubmitting}>{editingProduct ? "Save Changes" : "Add Product"}</Button>
          </div>
        </form>
      </Modal>

      <Modal open={!!deleting} onClose={() => setDeleting(null)} title="Remove Product?" size="sm">
        <p className="text-sm text-steel-500 dark:text-steel-400">
          {deleting?.name} will be removed from the catalog. Past production logs referencing it are kept.
        </p>
        <div className="mt-5 flex justify-end gap-2">
          <Button variant="secondary" onClick={() => setDeleting(null)}>Cancel</Button>
          <Button variant="danger" loading={busy} onClick={handleDelete}>Remove</Button>
        </div>
      </Modal>
    </div>;
}
export {
  ProductsPage as default
};
