import { todayISO } from "./utils";

/**
 * Finds the last saved counter reading for a specific machine + product
 * combination, by scanning production logs (expects `logs` already sorted
 * newest-first by created_at). Returns 0 if that product has never been run
 * on that machine before — this is the "resume from last count" behavior:
 * switching a machine to a product it has produced before continues the
 * same running counter instead of restarting at zero.
 */
export function getLastCountForMachineProduct(logs, machineId, productId) {
  for (const log of logs) {
    if (log.machine_id !== machineId) continue;
    const item = log.items.find((i) => i.product_id === productId);
    if (item) return item.end_count ?? 0;
  }
  return 0;
}

/**
 * Returns what a machine is "currently doing" — the product and count from
 * its most recent log entry — used by the dashboard and the production
 * entry form to show "last shift's count" before the operator starts typing.
 */
export function getMachineCurrentState(logs, machineId) {
  const log = logs.find((l) => l.machine_id === machineId);
  if (!log || log.items.length === 0) return null;
  const item = log.items[log.items.length - 1];
  return {
    productId: item.product_id,
    lastCount: item.end_count ?? 0,
    date: log.date,
    shift: log.shift,
  };
}

/**
 * Total pieces produced toward an order: every logged item for that order's
 * machine + product since the order was created.
 */
export function getOrderProgress(order, logs) {
  let produced = 0;
  for (const log of logs) {
    for (const item of log.items ?? []) {
      if (item.order_id) {
        // New entries record exactly which order they counted toward.
        if (item.order_id === order.id) produced += item.quantity;
        continue;
      }
      // Older entries (no order_id): match by machine + product since the order was created.
      if (log.machine_id !== order.machine_id) continue;
      if (log.created_at < order.created_at) continue;
      if (item.product_id === order.product_id) produced += item.quantity;
    }
  }
  return produced;
}

/**
 * The order a new count on this machine + product counts toward: the first
 * order in the queue that isn't completed. Returns undefined if none is open.
 */
export function getOpenOrder(orders, machineId, productId) {
  return [...orders]
    .filter((o) => o.machine_id === machineId && o.product_id === productId && o.status !== "completed")
    .sort((a, b) => (a.sequence || 0) - (b.sequence || 0))[0];
}

/**
 * The crew (Worker 1 / Worker 2) used the last time this machine was logged,
 * preferring the same shift. Used to pre-fill the crew so it only needs
 * changing when someone different is on duty. Expects logs newest-first.
 */
export function getLastCrew(logs, machineId, shift) {
  const same = logs.find((l) => l.machine_id === machineId && l.shift === shift && (l.worker1_id || l.worker2_id));
  const any = same ?? logs.find((l) => l.machine_id === machineId && (l.worker1_id || l.worker2_id));
  return any ? { worker1_id: any.worker1_id ?? "", worker2_id: any.worker2_id ?? "", sameShift: !!same } : null;
}

export function orderLabel(order, productMap) {
  if (!order) return "";
  const name = productMap?.get(order.product_id)?.name ?? "product";
  return order.reference ? `${order.reference}` : `Order #${order.sequence ?? "?"} · ${name}`;
}

/**
 * Observed real-world pace (pieces/minute) for a machine+product today,
 * derived from the actual counter jumps between logged entries. Returns
 * null when there isn't enough data yet (fewer than ~5 minutes of spread),
 * so callers can fall back to the product's rated pieces/minute.
 */
export function getObservedRate(logs, machineId, productId) {
  const points = [];
  for (const log of logs) {
    if (log.machine_id !== machineId || log.date !== todayISO()) continue;
    for (const item of log.items) {
      if (item.product_id === productId) points.push({ t: log.created_at, produced: item.quantity });
    }
  }
  if (points.length === 0) return null;
  points.sort((a, b) => a.t - b.t);
  const totalProduced = points.reduce((s, p) => s + p.produced, 0);
  const elapsedMs = points[points.length - 1].t - points[0].t;
  const elapsedMin = elapsedMs / 60000;
  if (elapsedMin < 5 || totalProduced <= 0) return null;
  return totalProduced / elapsedMin;
}

/**
 * Blended rate for ETA math: prefers today's observed real pace on that
 * machine+product, falls back to the product's rated pieces/minute.
 * Returns { rate, source } so the UI can be transparent about which one it used.
 */
export function getBlendedRate(logs, machineId, productId, ratedPerMinute) {
  const observed = getObservedRate(logs, machineId, productId);
  if (observed && observed > 0) return { rate: observed, source: "observed" };
  return { rate: ratedPerMinute || 0, source: "rated" };
}

/**
 * Computes a full ETA schedule for every order queued on one machine, in
 * sequence order. The active (first, not-yet-completed) order's ETA starts
 * from "now"; every order behind it in the queue is assumed to start only
 * after the ones ahead of it finish, using the product's rated pace (since
 * there's no real pace data yet for a job that hasn't started).
 *
 * This is explicitly a suggestion, not a guarantee — real shifts get
 * interrupted by power cuts, machine stops, staffing gaps, etc. The UI
 * should always present it as an estimate.
 */
export function computeQueueSchedule(ordersForMachine, productsById, logs) {
  const sorted = [...ordersForMachine]
    .filter((o) => o.status !== "completed")
    .sort((a, b) => a.sequence - b.sequence);

  let cursor = Date.now();
  const results = [];

  sorted.forEach((order, idx) => {
    const product = productsById.get(order.product_id);
    const isActive = idx === 0;
    const produced = getOrderProgress(order, logs);
    const remaining = Math.max(0, order.target_quantity - produced);

    let rate, rateSource;
    if (isActive) {
      const blended = getBlendedRate(logs, order.machine_id, order.product_id, product?.rate_per_minute);
      rate = blended.rate;
      rateSource = blended.source;
    } else {
      // Not started yet — no real pace to observe, so use the rated speed.
      rate = product?.rate_per_minute || 0;
      rateSource = "rated";
    }

    const minutesNeeded = rate > 0 ? remaining / rate : null;
    const estStart = new Date(cursor);
    const estFinish = minutesNeeded != null ? new Date(cursor + minutesNeeded * 60000) : null;

    results.push({
      order,
      product,
      produced,
      remaining,
      rate,
      rateSource,
      minutesNeeded,
      estStart,
      estFinish,
      isActive,
    });

    if (estFinish) cursor = estFinish.getTime();
  });

  return results;
}
