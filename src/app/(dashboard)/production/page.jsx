"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useForm, useFieldArray, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Plus, Trash2, Save, Sparkles, Gauge } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";
import { useSettings } from "@/contexts/SettingsContext";
import { useCollection } from "@/hooks/useCollection";
import { createDoc, errorMessage, newId, notifySaved } from "@/lib/firestore-service";
import { productionEntrySchema } from "@/lib/schemas";
import { todayISO, detectShift, formatCurrency } from "@/lib/utils";
import { getLastCountForMachineProduct, getMachineCurrentState, getOpenOrder, getOrderProgress, getLastCrew, orderLabel } from "@/lib/production-helpers";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/Card";
import { Input, Label } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Button } from "@/components/ui/Button";

const EMPTY_ITEMS = [{ product_id: "", count: 0 }];

// Shows which order this counter reading goes toward and how far along it is.
function OrderBox({ order, hasSelection, produced, logs, productMap, className = "" }) {
  if (!hasSelection) return null;
  if (!order) {
    return <p className={`rounded-lg bg-steel-50 px-3 py-2 text-xs text-steel-400 dark:bg-steel-900 ${className}`}>No open order in the Production Queue for this machine and product. The count is still saved.</p>;
  }
  const done = getOrderProgress(order, logs);
  const after = done + produced;
  const target = Number(order.target_quantity) || 0;
  const remaining = Math.max(0, target - after);
  const pct = target > 0 ? Math.min(100, (after / target) * 100) : 0;
  const over = after > target ? after - target : 0;
  return (
    <div className={`rounded-lg border border-instrument-500/20 bg-instrument-500/5 px-3 py-2 text-xs ${className}`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="font-semibold text-instrument-700 dark:text-instrument-400">{orderLabel(order, productMap)}</span>
        <span className="font-mono text-steel-600 dark:text-steel-300">
          target {target.toLocaleString()} · done before {done.toLocaleString()} · after this entry <strong>{after.toLocaleString()}</strong> ·{" "}
          {over > 0 ? <span className="text-gauge-700">{over.toLocaleString()} over target</span> : <>remaining <strong>{remaining.toLocaleString()}</strong></>}
        </span>
      </div>
      <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-steel-200 dark:bg-steel-700"><div className="h-full rounded-full bg-instrument-500" style={{ width: `${pct}%` }} /></div>
    </div>
  );
}

export default function ProductionEntryPage() {
  const { user } = useAuth();
  const idRef = useRef("");
  const { settings } = useSettings();
  // Only sorted by name in the query; "active only" is filtered below in the
  // browser. Combining where("status") + orderBy("name") in Firestore needs a
  // composite index you'd have to create by hand, and with ~12 workers
  // filtering client-side is instant.
  const { data: allWorkers } = useCollection("workers");
  const workers = useMemo(() => allWorkers.filter((w) => w.status === "active"), [allWorkers]);
  const { data: machines } = useCollection("machines");
  const { data: products } = useCollection("products");
  // Newest-first: getLastCountForMachineProduct and getMachineCurrentState
  // both expect this ordering so they can just take the first match.
  const { data: logs } = useCollection("production_logs");
  const { data: orders } = useCollection("orders");
  const crewTouched = useRef(false);
  const [crewAuto, setCrewAuto] = useState(false);

  const {
    register,
    control,
    handleSubmit,
    watch,
    reset,
    setValue,
    setError,
    formState: { errors, isSubmitting },
  } = useForm({
    resolver: zodResolver(productionEntrySchema),
    // NOTE: date/shift start neutral here, not todayISO()/detectShift().
    // This page can get pre-rendered to static HTML at build time; if the
    // defaults were computed here, the server's frozen build-time date would
    // mismatch the browser's actual date on every visit after build day,
    // causing a React hydration error that can silently break the Save
    // button. The real values get filled in by the effect below, which only
    // ever runs in the browser after the page has already mounted.
    defaultValues: {
      date: "",
      shift: "day",
      machine_id: "",
      worker1_id: "",
      worker2_id: "",
      items: EMPTY_ITEMS,
    },
  });

  const { fields, append, remove, replace } = useFieldArray({ control, name: "items" });
  const machineId = watch("machine_id");
  const items = watch("items");
  const shift = watch("shift");

  // Pre-fill the crew with whoever was on this machine last time (same shift if
  // possible). Stops as soon as the operator picks someone themselves.
  useEffect(() => {
    if (!machineId || crewTouched.current) return;
    const crew = getLastCrew(logs, machineId, shift);
    if (!crew) return;
    const ok = (id) => (workers.some((w) => w.id === id) ? id : "");
    setValue("worker1_id", ok(crew.worker1_id));
    setValue("worker2_id", ok(crew.worker2_id));
    setCrewAuto(true);
  }, [machineId, shift, logs, workers, setValue]);

  // Runs once after mount to fill in today's date (only if still blank, so
  // it never clobbers a date the operator has already changed), and on every
  // settings change to keep the shift accurate.
  useEffect(() => {
    if (!watch("date")) setValue("date", todayISO());
    setValue("shift", detectShift(settings.day_shift_start, settings.night_shift_start));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settings.day_shift_start, settings.night_shift_start]);

  const priceMap = useMemo(() => new Map(products.map((p) => [p.id, p.price_per_piece])), [products]);
  const machineMap = useMemo(() => new Map(machines.map((m) => [m.id, m])), [machines]);
  const productMap = useMemo(() => new Map(products.map((p) => [p.id, p])), [products]);

  // What this machine is running right now, per the most recent log — shown
  // as a hint so the operator knows what to expect before they type anything.
  const currentState = useMemo(() => {
    if (!machineId) return null;
    return getMachineCurrentState(logs, machineId);
  }, [logs, machineId]);

  // When the machine changes, start a fresh single row prefilled with
  // whatever it was last running (if anything), so the counter carries over
  // instead of the operator having to remember and re-enter it.
  function handleMachineChange(newMachineId) {
    setValue("machine_id", newMachineId);
    if (!newMachineId) {
      replace(EMPTY_ITEMS);
      return;
    }
    const state = getMachineCurrentState(logs, newMachineId);
    if (state) {
      replace([{ product_id: state.productId, count: state.lastCount }]);
    } else {
      replace(EMPTY_ITEMS);
    }
  }

  // Starting count per row = last saved counter for that machine+product
  // combo (0 if it's never been run on this machine before). This is what
  // "produced this session" gets measured against.
  const startCounts = (items ?? []).map((item) =>
    item.product_id && machineId ? getLastCountForMachineProduct(logs, machineId, item.product_id) : 0
  );

  const producedPerRow = (items ?? []).map((item, idx) => Number(item.count || 0) - startCounts[idx]);
  const lineTotals = producedPerRow.map(
    (produced, idx) => (priceMap.get(items?.[idx]?.product_id) ?? 0) * Math.max(0, produced)
  );
  const grandTotal = lineTotals.reduce((sum, v) => sum + v, 0);
  const totalProduced = producedPerRow.reduce((sum, v) => sum + Math.max(0, v), 0);
  const hasNegativeRow = producedPerRow.some((v) => v < 0);

  async function onSubmit(values) {
    if (!user) return;

    // The count a person types has to be >= where the counter already was —
    // it's a cumulative reading, not an increment. Catch that here since the
    // start count is derived data, not something Zod can validate on its own.
    const invalidIndex = values.items.findIndex((item, idx) => Number(item.count) < startCounts[idx]);
    if (invalidIndex !== -1) {
      setError(`items.${invalidIndex}.count`, {
        message: `Can't be less than the starting count (${startCounts[invalidIndex]})`,
      });
      return;
    }

    try {
      const now = Date.now();
      const log = {
        date: values.date,
        shift: values.shift,
        machine_id: values.machine_id,
        worker1_id: values.worker1_id,
        worker2_id: values.worker2_id,
        operator_uid: user.uid,
        operator_name: user.email ?? "Operator",
        items: values.items.map((item, idx) => {
          const start = startCounts[idx];
          const end = Number(item.count);
          return {
            product_id: item.product_id,
            order_id: getOpenOrder(orders, values.machine_id, item.product_id)?.id ?? "",
            start_count: start,
            end_count: end,
            quantity: end - start,
            unit_price: priceMap.get(item.product_id) ?? 0, // price at the time, so old bills never change when prices do
          };
        }),
        total_quantity: totalProduced,
        total_bill: grandTotal,
        created_at: now,
        updated_at: now,
      };
      if (!idRef.current) idRef.current = newId("production_logs");
      notifySaved(await createDoc("production_logs", log, idRef.current), "Production count saved");
      idRef.current = "";
      crewTouched.current = false;
      setCrewAuto(false);
      reset({
        date: todayISO(),
        shift: detectShift(settings.day_shift_start, settings.night_shift_start),
        machine_id: "",
        worker1_id: "",
        worker2_id: "",
        items: EMPTY_ITEMS,
      });
    } catch (err) {
      console.error(err);
      toast.error(errorMessage(err, "Could not save the production count. Try again."));
    }
  }

  return (
    <div className="mx-auto max-w-3xl">
      <div className="mb-6">
        <h1 className="font-display text-2xl font-bold text-steel-800 dark:text-steel-50">Production Count</h1>
        <p className="mt-1 text-sm text-steel-500 dark:text-steel-400">
          Enter the machine's current counter reading — the amount produced this session is calculated automatically.
        </p>
      </div>

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>Shift Details</CardTitle>
            <span className="flex items-center gap-1.5 rounded-full bg-gauge-50 px-2.5 py-1 text-xs font-medium text-gauge-700 dark:bg-gauge-900/30 dark:text-gauge-300">
              <Sparkles className="h-3.5 w-3.5" /> Auto-detected
            </span>
          </CardHeader>
          <CardBody className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div>
              <Label>Date</Label>
              <Input type="date" {...register("date")} error={errors.date?.message} />
            </div>
            <div>
              <Label>Shift</Label>
              <Controller
                control={control}
                name="shift"
                render={({ field }) => (
                  <Select {...field}>
                    <option value="day">Day Shift ({settings.day_shift_start} – {settings.night_shift_start})</option>
                    <option value="night">Night Shift ({settings.night_shift_start} – {settings.day_shift_start})</option>
                  </Select>
                )}
              />
            </div>
            <div>
              <Label>Machine</Label>
              <Select value={machineId} onChange={(e) => handleMachineChange(e.target.value)} error={errors.machine_id?.message}>
                <option value="">Select machine</option>
                {machines.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
              </Select>
            </div>
          </CardBody>
        </Card>

        {currentState && (
          <div className="flex items-center gap-2 rounded-lg border border-instrument-500/20 bg-instrument-500/5 px-4 py-3 text-sm text-instrument-700 dark:text-instrument-400">
            <Gauge className="h-4 w-4 shrink-0" />
            <span>
              {machineMap.get(machineId)?.name} was last running{" "}
              <strong>{productMap.get(currentState.productId)?.name ?? "an unknown product"}</strong> at count{" "}
              <strong className="font-mono">{currentState.lastCount}</strong> ({currentState.shift} shift, {currentState.date}).
              Continuing from there below.
            </span>
          </div>
        )}

        <Card>
          <CardHeader>
            <CardTitle>Crew</CardTitle>
          </CardHeader>
          <CardBody className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div>
              <Label>Worker 1</Label>
              <Select {...register("worker1_id", { onChange: () => { crewTouched.current = true; setCrewAuto(false); } })} error={errors.worker1_id?.message}>
                <option value="">Select worker</option>
                {workers.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
              </Select>
            </div>
            <div>
              <Label>Worker 2</Label>
              <Select {...register("worker2_id", { onChange: () => { crewTouched.current = true; setCrewAuto(false); } })} error={errors.worker2_id?.message}>
                <option value="">Select worker</option>
                {workers.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
              </Select>
            </div>
            <div>
              <Label>Operator</Label>
              <Input value={user?.email ?? ""} disabled className="opacity-70" />
            </div>
            {crewAuto && <p className="text-xs text-steel-400 sm:col-span-3">Filled in from the last entry on this machine. Change it if someone else is on duty today. Anyone named here is counted present for salary, and covering a second shift on the same date is counted as overtime.</p>}
          </CardBody>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Products &amp; Counter Readings</CardTitle>
          </CardHeader>
          <CardBody className="space-y-3">
            {errors.items?.message && <p className="text-xs text-danger">{errors.items.message}</p>}
            {fields.map((field, index) => (
              <div key={field.id} className="flex flex-col gap-3 rounded-lg border border-steel-100 p-3 dark:border-steel-700 sm:flex-row sm:items-end">
                <div className="flex-1">
                  <Label>Product</Label>
                  <Select {...register(`items.${index}.product_id`)} error={errors.items?.[index]?.product_id?.message}>
                    <option value="">Select product</option>
                    {products.map((p) => (
                      <option key={p.id} value={p.id}>{p.name} — {formatCurrency(p.price_per_piece, settings.currency)}/pc</option>
                    ))}
                  </Select>
                </div>
                <div className="w-full sm:w-28">
                  <Label>Starting Count</Label>
                  <p className="rounded-lg bg-steel-50 px-3 py-2.5 font-mono text-sm text-steel-500 dark:bg-steel-900 dark:text-steel-400">
                    {startCounts[index] ?? 0}
                  </p>
                </div>
                <div className="w-full sm:w-32">
                  <Label>Current Count</Label>
                  <Input
                    type="number"
                    min={0}
                    step="1"
                    {...register(`items.${index}.count`)}
                    error={errors.items?.[index]?.count?.message}
                  />
                </div>
                <div className="w-full sm:w-32">
                  <Label>Difference (produced)</Label>
                  <p className={`rounded-lg px-3 py-2.5 font-mono text-sm ${producedPerRow[index] < 0 ? "bg-danger/10 text-danger" : "bg-steel-50 text-steel-700 dark:bg-steel-900 dark:text-steel-200"}`}>
                    {producedPerRow[index] ?? 0} pcs
                  </p>
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => fields.length > 1 && remove(index)}
                  disabled={fields.length === 1}
                  aria-label="Remove product row"
                >
                  <Trash2 className="h-4 w-4 text-danger" />
                </Button>
                <OrderBox
                  className="w-full sm:basis-full"
                  order={machineId && items?.[index]?.product_id ? getOpenOrder(orders, machineId, items[index].product_id) : null}
                  hasSelection={!!(machineId && items?.[index]?.product_id)}
                  produced={Math.max(0, producedPerRow[index] ?? 0)}
                  logs={logs}
                  productMap={productMap}
                />
              </div>
            ))}

            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => append({ product_id: "", count: 0 })}
            >
              <Plus className="h-4 w-4" /> Add Product (this shift's product finished)
            </Button>

            {hasNegativeRow && (
              <p className="text-xs text-danger">
                One or more counts are lower than the starting count for that product — double check before saving.
              </p>
            )}
          </CardBody>
        </Card>

        <Card>
          <CardBody className="flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-center">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-steel-400">Produced This Session</p>
              <p className="mt-1 font-mono text-sm text-steel-600 dark:text-steel-300">
                {totalProduced} pcs
              </p>
            </div>
            <div className="text-right">
              <p className="text-xs font-semibold uppercase tracking-wide text-steel-400">Total Bill</p>
              <p className="font-display text-2xl font-bold text-instrument-600 dark:text-gauge-300">
                {formatCurrency(grandTotal, settings.currency)}
              </p>
            </div>
          </CardBody>
        </Card>

        <Button type="submit" size="lg" loading={isSubmitting} disabled={hasNegativeRow} className="w-full justify-center sm:w-auto">
          <Save className="h-4 w-4" /> Save Production Count
        </Button>
      </form>
    </div>
  );
}
