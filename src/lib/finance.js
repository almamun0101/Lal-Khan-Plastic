// =============================================================================
// finance.js — the single source of truth for every money and stock number.
//
// Nothing here talks to Firebase. Pages pass in the raw collections and get back
// fully-derived figures, so the dashboard, client page, order page, finance page
// and analytics can never disagree with each other.
//
// KEY DEFINITIONS (these never get mixed up anywhere in the app):
//   Total sales (billed)  = sum of every non-cancelled order's total
//                           (items − discount + delivery charge billed to client)
//   Money received        = sum of every payment actually recorded
//   Outstanding / due     = billed − what has been paid against it (per order)
//   Available cash        = opening balance + money received − money spent
//   Money spent           = expenses + delivery costs + staff payments (advances and salaries paid)
//   Net profit            = total sales − product cost − delivery cost − expenses − staff pay earned
//                           (staff pay is counted when EARNED, cash when PAID)
//
// Cancelled orders are ignored by every calculation. A payment is never lost:
// money paid against an order that is later cancelled stays in "received" and
// becomes client credit.
// =============================================================================

import { addDays, diffDays, parseISODate, round2, startOfWeek, toISODate } from "./utils.js";
import { staffSummary } from "./payroll.js";

const num = (v) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

// ---------- normalising raw documents ----------------------------------------

export function normalizeItem(item = {}) {
  const qty = Math.max(0, num(item.qty));
  return {
    product_id: item.product_id ?? "",
    name: item.name ?? "",
    qty,
    unit_price: Math.max(0, num(item.unit_price)),
    unit_cost: Math.max(0, num(item.unit_cost)),
    delivered_qty: Math.min(qty, Math.max(0, num(item.delivered_qty))),
    customization: item.customization ?? "",
  };
}

export function normalizeOrder(o = {}) {
  return {
    ...o,
    items: (Array.isArray(o.items) ? o.items : []).map(normalizeItem),
    discount: Math.max(0, num(o.discount)),
    delivery_charge: Math.max(0, num(o.delivery_charge)),
    delivery_cost: Math.max(0, num(o.delivery_cost)),
  };
}

export const isCancelled = (o) => o.status === "cancelled";

// ---------- single order maths ------------------------------------------------

export function orderSubtotal(o) {
  return round2(normalizeOrder(o).items.reduce((s, i) => s + i.qty * i.unit_price, 0));
}

export function orderProductCost(o) {
  return round2(normalizeOrder(o).items.reduce((s, i) => s + i.qty * i.unit_cost, 0));
}

// Discount can never push the product value below zero.
export function orderTotal(o) {
  const n = normalizeOrder(o);
  const subtotal = n.items.reduce((s, i) => s + i.qty * i.unit_price, 0);
  return round2(Math.max(0, subtotal - n.discount) + n.delivery_charge);
}

export function orderProfit(o) {
  const n = normalizeOrder(o);
  return round2(orderTotal(n) - orderProductCost(n) - n.delivery_cost);
}

export function deliveryProgress(o) {
  const items = normalizeOrder(o).items;
  const ordered = items.reduce((s, i) => s + i.qty, 0);
  const delivered = items.reduce((s, i) => s + i.delivered_qty, 0);
  let state = "none";
  if (ordered > 0 && delivered >= ordered) state = "full";
  else if (delivered > 0) state = "partial";
  return { ordered, delivered, pending: Math.max(0, ordered - delivered), state };
}

// Status shown everywhere. Delivery quantities are the truth: an order is only
// "delivered" when every unit has been delivered, whatever the stored label says.
export function effectiveStatus(o) {
  if (o.status === "cancelled") return "cancelled";
  const { state } = deliveryProgress(o);
  if (state === "full") return "delivered";
  if (o.status === "delivered") return "shipped";
  return o.status || "pending";
}

// Patch to apply when the user sets a status by hand.
export function statusPatch(order, status, todayISO) {
  const n = normalizeOrder(order);
  if (status === "delivered") {
    return {
      status,
      items: n.items.map((i) => ({ ...i, delivered_qty: i.qty })),
      delivery_date: order.delivery_date || todayISO,
    };
  }
  if (status === "cancelled") return { status };
  // Moving back from delivered/shipped to an earlier stage clears delivery quantities.
  const wasDelivered = deliveryProgress(n).delivered > 0;
  if (wasDelivered && ["pending", "in_production", "ready"].includes(status)) {
    return { status, items: n.items.map((i) => ({ ...i, delivered_qty: 0 })), delivery_date: "" };
  }
  return { status };
}

// Patch to apply from the delivery form. `delivered` is an array of delivered
// quantities in item order.
export function deliveryPatch(order, delivered, fields = {}) {
  const n = normalizeOrder(order);
  const items = n.items.map((i, idx) => ({
    ...i,
    delivered_qty: Math.min(i.qty, Math.max(0, num(delivered[idx]))),
  }));
  const done = items.length > 0 && items.every((i) => i.delivered_qty >= i.qty);
  const any = items.some((i) => i.delivered_qty > 0);
  let status = order.status;
  if (done) status = "delivered";
  else if (any || fields.tracking_id) status = "shipped";
  else if (status === "delivered") status = "shipped";
  return { ...fields, items, status };
}

// ---------- per-client allocation of payments ---------------------------------

const byDateThenCreated = (a, b) => {
  const da = a.date || a.order_date || "";
  const db = b.date || b.order_date || "";
  if (da !== db) return da < db ? -1 : 1;
  return num(a.created_at) - num(b.created_at);
};

/**
 * Spreads a client's payments over their orders.
 *   1. A payment tied to an order pays that order first.
 *   2. Anything left over, and every payment not tied to an order ("on account"),
 *      goes to the client's oldest unpaid order first (FIFO).
 *   3. Whatever is still left is client credit (advance).
 * So  billed − received  ==  due − credit  always holds.
 */
export function allocateClient(orders, payments) {
  const active = orders.filter((o) => !isCancelled(o)).map(normalizeOrder).sort(byDateThenCreated);
  const rows = active.map((order) => ({
    order,
    total: orderTotal(order),
    paid: 0,
    applied: [], // [{ payment_id, amount, date, method, direct }]
    last_paid_date: "",
  }));
  const byId = new Map(rows.map((r) => [r.order.id, r]));
  const pool = [];

  const apply = (row, p, amount, direct) => {
    row.paid = round2(row.paid + amount);
    row.applied.push({ payment_id: p.id, amount, date: p.date, method: p.method, direct });
    if (!row.last_paid_date || p.date > row.last_paid_date) row.last_paid_date = p.date;
  };

  const sorted = [...payments].sort(byDateThenCreated);
  for (const p of sorted) {
    const amount = round2(p.amount);
    if (!(amount > 0)) continue;
    const row = p.order_id ? byId.get(p.order_id) : null;
    if (row) {
      const room = Math.max(0, round2(row.total - row.paid));
      const used = Math.min(amount, room);
      if (used > 0) apply(row, p, used, true);
      const rest = round2(amount - used);
      if (rest > 0) pool.push({ p, left: rest });
    } else {
      pool.push({ p, left: amount });
    }
  }

  for (const entry of pool) {
    for (const row of rows) {
      if (entry.left <= 0) break;
      const room = Math.max(0, round2(row.total - row.paid));
      if (room <= 0) continue;
      const used = Math.min(room, entry.left);
      apply(row, entry.p, used, false);
      entry.left = round2(entry.left - used);
    }
  }

  const credit = round2(pool.reduce((s, e) => s + e.left, 0));
  return { rows, credit };
}

export function paymentState(total, paid) {
  if (total <= 0.004) return "paid";
  if (paid >= total - 0.004) return "paid";
  if (paid > 0.004) return "partial";
  return "unpaid";
}

// ---------- the whole business ------------------------------------------------

/**
 * Computes everything the app displays from the raw collections.
 * @param {object} input { clients, orders, payments, expenses, logs, products, settings, today }
 */
export function computeBusiness({
  clients = [],
  orders = [],
  payments = [],
  expenses = [],
  logs = [],
  products = [],
  workers = [],
  staffPayments = [],
  settings = {},
  today = "",
}) {
  const creditDays = Number.isFinite(Number(settings.credit_days)) ? Number(settings.credit_days) : 15;
  const clientById = new Map(clients.map((c) => [c.id, c]));

  // Group by client (including orphans whose client record is missing).
  const ordersByClient = new Map();
  const paymentsByClient = new Map();
  orders.forEach((o) => {
    const k = o.client_id || "_none";
    if (!ordersByClient.has(k)) ordersByClient.set(k, []);
    ordersByClient.get(k).push(o);
  });
  payments.forEach((p) => {
    const k = p.client_id || "_none";
    if (!paymentsByClient.has(k)) paymentsByClient.set(k, []);
    paymentsByClient.get(k).push(p);
  });

  const clientIds = new Set([...clients.map((c) => c.id), ...ordersByClient.keys(), ...paymentsByClient.keys()]);

  const orderRows = []; // every active order with its payment figures
  const orderRowById = new Map();
  const clientStats = [];

  clientIds.forEach((cid) => {
    const client = clientById.get(cid) ?? { id: cid, name: cid === "_none" ? "(no client)" : "(deleted client)", missing: true };
    const cOrders = ordersByClient.get(cid) ?? [];
    const cPays = paymentsByClient.get(cid) ?? [];
    const { rows, credit } = allocateClient(cOrders, cPays);

    let billed = 0;
    let due = 0;
    let overdueAmount = 0;
    let overdueCount = 0;
    let openOrders = 0;
    let lastOrderDate = "";

    rows.forEach((r) => {
      const dueAmt = Math.max(0, round2(r.total - r.paid));
      const dueDate = r.order.due_date || (creditDays >= 0 && r.order.order_date ? addDays(r.order.order_date, creditDays) : "");
      const overdue = dueAmt > 0.004 && !!today && !!dueDate && dueDate < today;
      const row = {
        id: r.order.id,
        order: r.order,
        client,
        status: effectiveStatus(r.order),
        total: r.total,
        paid: r.paid,
        due: dueAmt,
        payment_state: paymentState(r.total, r.paid),
        due_date: dueDate,
        overdue,
        days_overdue: overdue ? diffDays(dueDate, today) : 0,
        applied: r.applied,
        last_paid_date: r.last_paid_date,
        progress: deliveryProgress(r.order),
        product_cost: orderProductCost(r.order),
        profit: orderProfit(r.order),
      };
      orderRows.push(row);
      orderRowById.set(row.id, row);
      billed += r.total;
      due += dueAmt;
      if (overdue) {
        overdueAmount += dueAmt;
        overdueCount += 1;
      }
      if (row.status !== "delivered" || dueAmt > 0.004) openOrders += 1;
      if (!lastOrderDate || (r.order.order_date || "") > lastOrderDate) lastOrderDate = r.order.order_date || "";
    });

    const received = round2(cPays.reduce((s, p) => s + Math.max(0, num(p.amount)), 0));
    const lastPaymentDate = cPays.reduce((m, p) => ((p.date || "") > m ? p.date || "" : m), "");
    clientStats.push({
      client,
      id: cid,
      billed: round2(billed),
      received,
      due: round2(due),
      credit,
      balance: round2(due - credit), // + = client owes us, − = we hold their advance
      orders_count: rows.length,
      cancelled_count: cOrders.filter(isCancelled).length,
      payments_count: cPays.length,
      open_orders: openOrders,
      overdue_amount: round2(overdueAmount),
      overdue_count: overdueCount,
      last_order_date: lastOrderDate,
      last_payment_date: lastPaymentDate,
      over_limit: client.credit_limit > 0 && due > num(client.credit_limit),
    });
  });

  // Order lookups for rows that belong to cancelled orders are not needed.
  const activeOrders = orders.filter((o) => !isCancelled(o)).map(normalizeOrder);

  // ----- money totals
  const productSales = round2(activeOrders.reduce((s, o) => s + Math.max(0, o.items.reduce((a, i) => a + i.qty * i.unit_price, 0) - o.discount), 0));
  const deliveryIncome = round2(activeOrders.reduce((s, o) => s + o.delivery_charge, 0));
  const salesTotal = round2(productSales + deliveryIncome); // == sum of orderTotal
  const productCost = round2(activeOrders.reduce((s, o) => s + orderProductCost(o), 0));
  const deliveryCosts = round2(activeOrders.reduce((s, o) => s + o.delivery_cost, 0));
  const expensesTotal = round2(expenses.reduce((s, e) => s + Math.max(0, num(e.amount)), 0));
  const receivedTotal = round2(payments.reduce((s, p) => s + Math.max(0, num(p.amount)), 0));
  const staff = staffSummary({ workers, logs, staffPayments, settings });
  const staffEarned = staff.earned;
  const staffPaid = staff.paid;
  const salaryExpenseTotal = round2(expenses.filter((e) => e.category === "Salary").reduce((s, e) => s + Math.max(0, num(e.amount)), 0));
  const moneySpent = round2(expensesTotal + deliveryCosts + staffPaid);
  const opening = num(settings.opening_balance);
  const availableCash = round2(opening + receivedTotal - moneySpent);
  const receivables = round2(clientStats.reduce((s, c) => s + c.due, 0));
  const clientCredit = round2(clientStats.reduce((s, c) => s + c.credit, 0));
  const grossProfit = round2(salesTotal - productCost);
  const netProfit = round2(grossProfit - deliveryCosts - expensesTotal - staffEarned);

  const receivedByMethod = { cash: 0, bkash: 0, bank: 0, other: 0 };
  payments.forEach((p) => {
    const m = receivedByMethod[p.method] !== undefined ? p.method : "other";
    receivedByMethod[m] = round2(receivedByMethod[m] + Math.max(0, num(p.amount)));
  });

  // ----- expected collections
  const openDue = orderRows.filter((r) => r.due > 0.004);
  const bucket = { overdue: 0, next7: 0, next30: 0, later: 0 };
  openDue.forEach((r) => {
    if (r.overdue) bucket.overdue += r.due;
    else if (!r.due_date || !today) bucket.later += r.due;
    else {
      const d = diffDays(today, r.due_date);
      if (d <= 7) bucket.next7 += r.due;
      else if (d <= 30) bucket.next30 += r.due;
      else bucket.later += r.due;
    }
  });
  Object.keys(bucket).forEach((k) => (bucket[k] = round2(bucket[k])));

  // ----- units & production
  let unitsOrdered = 0;
  let unitsDelivered = 0;
  activeOrders.forEach((o) =>
    o.items.forEach((i) => {
      unitsOrdered += i.qty;
      unitsDelivered += i.delivered_qty;
    })
  );
  const unitsPending = Math.max(0, unitsOrdered - unitsDelivered);
  const unitsProduced = logs.reduce((s, l) => s + num(l.total_quantity), 0);

  const productMap = new Map(products.map((p) => [p.id, p]));
  const perProduct = new Map();
  const touch = (id, name) => {
    if (!perProduct.has(id)) perProduct.set(id, { product_id: id, name: name || productMap.get(id)?.name || "Unknown product", ordered: 0, delivered: 0, produced: 0, revenue: 0, cost: 0 });
    return perProduct.get(id);
  };
  products.forEach((p) => touch(p.id, p.name));
  activeOrders.forEach((o) => {
    // Discount is spread across items in proportion to their value so product
    // revenue adds up to real sales instead of overstating them.
    const gross = o.items.reduce((a, i) => a + i.qty * i.unit_price, 0);
    const factor = gross > 0 ? Math.max(0, gross - o.discount) / gross : 1;
    o.items.forEach((i) => {
      const e = touch(i.product_id || `custom:${i.name}`, i.name);
      e.ordered += i.qty;
      e.delivered += i.delivered_qty;
      e.revenue += i.qty * i.unit_price * factor;
      e.cost += i.qty * i.unit_cost;
    });
  });
  logs.forEach((l) =>
    (l.items ?? []).forEach((i) => {
      touch(i.product_id).produced += num(i.quantity);
    })
  );
  const productStats = Array.from(perProduct.values()).map((p) => ({
    ...p,
    revenue: round2(p.revenue),
    cost: round2(p.cost),
    profit: round2(p.revenue - p.cost),
    pending: Math.max(0, p.ordered - p.delivered),
    stock: p.produced - p.delivered, // estimate: made minus shipped (can be < 0 if production wasn't logged)
  }));

  // ----- order counts
  const statusCounts = {};
  orderRows.forEach((r) => (statusCounts[r.status] = (statusCounts[r.status] ?? 0) + 1));
  const openOrdersList = orderRows.filter((r) => r.status !== "delivered");
  const pendingDeliveries = openOrdersList.map((r) => ({
    ...r,
    late: !!today && !!r.order.expected_delivery_date && r.order.expected_delivery_date < today,
    days_late: today && r.order.expected_delivery_date && r.order.expected_delivery_date < today ? diffDays(r.order.expected_delivery_date, today) : 0,
  }));

  // ----- performance indicators
  const paidOrders = orderRows.filter((r) => r.payment_state === "paid" && r.total > 0 && r.last_paid_date && r.order.order_date);
  const avgDaysToCollect = paidOrders.length ? paidOrders.reduce((s, r) => s + Math.max(0, diffDays(r.order.order_date, r.last_paid_date)), 0) / paidOrders.length : null;
  const deliveredWithPromise = orderRows.filter((r) => r.status === "delivered" && r.order.expected_delivery_date && r.order.delivery_date);
  const onTimeDelivery = deliveredWithPromise.length ? deliveredWithPromise.filter((r) => r.order.delivery_date <= r.order.expected_delivery_date).length / deliveredWithPromise.length : null;
  const kpi = {
    collection_rate: salesTotal > 0 ? round2(((salesTotal - receivables) / salesTotal) * 100) : null,
    profit_margin: salesTotal > 0 ? round2((netProfit / salesTotal) * 100) : null,
    avg_order_value: orderRows.length ? round2(salesTotal / orderRows.length) : 0,
    delivery_completion: unitsOrdered > 0 ? round2((unitsDelivered / unitsOrdered) * 100) : null,
    avg_days_to_collect: avgDaysToCollect == null ? null : Math.round(avgDaysToCollect * 10) / 10,
    on_time_delivery: onTimeDelivery == null ? null : Math.round(onTimeDelivery * 100),
    active_clients: clientStats.filter((c) => c.open_orders > 0 || c.due > 0).length,
  };

  // ----- data health (so inconsistent records are visible instead of silently wrong)
  const health = {
    orphan_payments: payments.filter((p) => !clientById.has(p.client_id)).length,
    orders_without_client: orders.filter((o) => !clientById.has(o.client_id)).length,
    overpaid_credit: clientCredit,
  };

  return {
    // headline money
    salesTotal,
    productSales,
    deliveryIncome,
    receivedTotal,
    receivables,
    clientCredit,
    expensesTotal,
    deliveryCosts,
    productCost,
    moneySpent,
    staffEarned,
    staffPaid,
    staffOwed: round2(staffEarned - staffPaid),
    staffBalances: staff.balances,
    overAdvance: staff.balances.filter((b) => b.balance < -0.004),
    salaryExpenseTotal,
    openingBalance: opening,
    availableCash,
    grossProfit,
    netProfit,
    receivedByMethod,
    collections: bucket,
    expectedCollections: round2(receivables), // everything still to be collected
    // units
    unitsOrdered,
    unitsDelivered,
    unitsPending,
    unitsProduced,
    // lists
    clientStats,
    orderRows,
    orderRowById,
    openDue,
    pendingDeliveries,
    statusCounts,
    productStats,
    kpi,
    health,
    counts: {
      orders: orderRows.length,
      cancelled: orders.filter(isCancelled).length,
      pending: openOrdersList.length,
      delivered: statusCounts.delivered ?? 0,
      clients: clients.length,
    },
  };
}

// ---------- time series (daily / weekly / monthly / yearly) -------------------

export const PERIODS = [
  { value: "daily", label: "Daily", count: 30 },
  { value: "weekly", label: "Weekly", count: 12 },
  { value: "monthly", label: "Monthly", count: 12 },
  { value: "yearly", label: "Yearly", count: 5 },
];

const MONTH_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export function bucketKey(iso, period, weekStart = 6) {
  if (!iso) return "";
  if (period === "daily") return iso;
  if (period === "weekly") return startOfWeek(iso, weekStart);
  if (period === "monthly") return iso.slice(0, 7);
  return iso.slice(0, 4);
}

function bucketLabel(key, period) {
  if (period === "daily") return `${Number(key.slice(8, 10))} ${MONTH_SHORT[Number(key.slice(5, 7)) - 1]}`;
  if (period === "weekly") return `${Number(key.slice(8, 10))} ${MONTH_SHORT[Number(key.slice(5, 7)) - 1]}`;
  if (period === "monthly") return `${MONTH_SHORT[Number(key.slice(5, 7)) - 1]} ${key.slice(2, 4)}`;
  return key;
}

// Last `count` bucket keys ending at the bucket containing `today`.
export function bucketKeys(today, period, count, weekStart = 6) {
  const keys = [];
  let cursor = today;
  for (let i = 0; i < count; i++) {
    keys.unshift(bucketKey(cursor, period, weekStart));
    if (period === "daily") cursor = addDays(cursor, -1);
    else if (period === "weekly") cursor = addDays(bucketKey(cursor, period, weekStart), -1);
    else if (period === "monthly") {
      const d = parseISODate(`${bucketKey(cursor, period)}-01`);
      d.setDate(0); // last day of previous month
      cursor = toISODate(d);
    } else cursor = `${Number(cursor.slice(0, 4)) - 1}-12-31`;
  }
  return keys;
}

/**
 * Time series of sales / received / expenses / profit / outstanding.
 *  - sales & product cost land on the order date
 *  - delivery cost lands on the delivery date (order date if not delivered yet)
 *  - received lands on the payment date; expenses on the expense date
 *  - outstanding is the running balance (billed − received) at the end of each bucket
 */
export function buildSeries({ orders = [], payments = [], expenses = [], workers = [], logs = [], staffPayments = [], settings = {}, today, period = "monthly", count, weekStart = 6 }) {
  const n = count ?? PERIODS.find((p) => p.value === period)?.count ?? 12;
  const keys = bucketKeys(today, period, n, weekStart);
  const index = new Map(keys.map((k, i) => [k, i]));
  const rows = keys.map((k) => ({ key: k, label: bucketLabel(k, period), sales: 0, received: 0, expenses: 0, deliveryCost: 0, productCost: 0, orders: 0, profit: 0, outstanding: 0, net: 0, staffEarned: 0, staffPaid: 0 }));
  const first = keys[0];

  let billedBefore = 0;
  let receivedBefore = 0;
  const active = orders.filter((o) => !isCancelled(o)).map(normalizeOrder);

  active.forEach((o) => {
    const k = bucketKey(o.order_date, period, weekStart);
    const total = orderTotal(o);
    if (k && index.has(k)) {
      const r = rows[index.get(k)];
      r.sales += total;
      r.productCost += orderProductCost(o);
      r.orders += 1;
    } else if (k && k < first) billedBefore += total;

    const dk = bucketKey(o.delivery_date || o.order_date, period, weekStart);
    if (o.delivery_cost > 0 && dk && index.has(dk)) rows[index.get(dk)].deliveryCost += o.delivery_cost;
  });

  payments.forEach((p) => {
    const k = bucketKey(p.date, period, weekStart);
    const amt = Math.max(0, num(p.amount));
    if (k && index.has(k)) rows[index.get(k)].received += amt;
    else if (k && k < first) receivedBefore += amt;
  });

  expenses.forEach((e) => {
    const k = bucketKey(e.date, period, weekStart);
    if (k && index.has(k)) rows[index.get(k)].expenses += Math.max(0, num(e.amount));
  });

  const staff = staffSummary({ workers, logs, staffPayments, settings });
  staff.earningsByDate.forEach(({ date, amount }) => {
    const k = bucketKey(date, period, weekStart);
    if (k && index.has(k)) rows[index.get(k)].staffEarned += amount;
  });
  staffPayments.forEach((p) => {
    const k = bucketKey(p.date, period, weekStart);
    if (k && index.has(k)) rows[index.get(k)].staffPaid += Math.max(0, num(p.amount));
  });

  let running = billedBefore - receivedBefore;
  rows.forEach((r) => {
    r.sales = round2(r.sales);
    r.received = round2(r.received);
    r.expenses = round2(r.expenses);
    r.deliveryCost = round2(r.deliveryCost);
    r.productCost = round2(r.productCost);
    r.staffEarned = round2(r.staffEarned);
    r.staffPaid = round2(r.staffPaid);
    r.spent = round2(r.expenses + r.deliveryCost + r.staffPaid);
    r.profit = round2(r.sales - r.productCost - r.deliveryCost - r.expenses - r.staffEarned);
    r.net = round2(r.received - r.spent); // cash flow for the bucket
    running = round2(running + r.sales - r.received);
    r.outstanding = running;
  });
  return rows;
}

// ---------- ledgers & feeds ---------------------------------------------------

// Chronological statement for one client with a running balance (+ = client owes).
export function clientLedger(orders, payments) {
  const entries = [];
  orders.filter((o) => !isCancelled(o)).forEach((o) =>
    entries.push({ kind: "order", id: o.id, date: o.order_date || "", created_at: num(o.created_at), ref: o.order_no, debit: orderTotal(o), credit: 0, note: `${normalizeOrder(o).items.length} item(s)` })
  );
  payments.forEach((p) =>
    entries.push({ kind: "payment", id: p.id, date: p.date || "", created_at: num(p.created_at), ref: p.reference || "", method: p.method, debit: 0, credit: Math.max(0, num(p.amount)), order_id: p.order_id, note: p.notes || "" })
  );
  entries.sort((a, b) => (a.date !== b.date ? (a.date < b.date ? -1 : 1) : a.created_at - b.created_at));
  let bal = 0;
  return entries.map((e) => {
    bal = round2(bal + e.debit - e.credit);
    return { ...e, balance: bal };
  });
}

// Newest-first feed of money moving in and out of the business.
export function buildTransactions({ payments = [], expenses = [], orders = [], staffPayments = [], workerById = new Map(), clientById = new Map() }) {
  const feed = [];
  payments.forEach((p) =>
    feed.push({ id: `p-${p.id}`, type: "payment", direction: "in", date: p.date || "", created_at: num(p.created_at), amount: Math.max(0, num(p.amount)), method: p.method, label: `Payment from ${clientById.get(p.client_id)?.name ?? "client"}`, href: `/clients/${p.client_id}` })
  );
  expenses.forEach((e) =>
    feed.push({ id: `e-${e.id}`, type: "expense", direction: "out", date: e.date || "", created_at: num(e.created_at), amount: Math.max(0, num(e.amount)), method: e.method || "", label: `${e.name} · ${e.category}`, href: "/expenses" })
  );
  staffPayments.forEach((p) =>
    feed.push({ id: `s-${p.id}`, type: "staff", direction: "out", date: p.date || "", created_at: num(p.created_at), amount: Math.max(0, num(p.amount)), method: p.method || "", label: `${p.type === "advance" ? "Advance" : "Salary"} · ${workerById.get(p.worker_id)?.name ?? "worker"}`, href: "/salary" })
  );
  orders.filter((o) => !isCancelled(o) && num(o.delivery_cost) > 0).forEach((o) =>
    feed.push({ id: `d-${o.id}`, type: "delivery_cost", direction: "out", date: o.delivery_date || o.order_date || "", created_at: num(o.created_at), amount: num(o.delivery_cost), method: "", label: `Delivery cost · ${o.order_no}`, href: `/orders/${o.id}` })
  );
  feed.sort((a, b) => (a.date !== b.date ? (a.date < b.date ? 1 : -1) : b.created_at - a.created_at));
  return feed;
}

// ---------- alerts ------------------------------------------------------------

export function buildAlerts(biz, settings = {}, today = "") {
  const alerts = [];
  const money = (n) => Number(n).toLocaleString("en-IN", { maximumFractionDigits: 2 });

  const overdue = biz.openDue.filter((r) => r.overdue);
  if (overdue.length) {
    const sum = overdue.reduce((s, r) => s + r.due, 0);
    alerts.push({ id: "overdue", level: "danger", title: `${overdue.length} overdue payment${overdue.length > 1 ? "s" : ""}`, detail: `${money(sum)} is past its due date.`, href: "/orders?filter=overdue" });
  }
  const threshold = num(settings.low_cash_threshold);
  if (biz.availableCash < 0) {
    alerts.push({ id: "cash-negative", level: "danger", title: "Available cash is negative", detail: `Spending is ahead of money received by ${money(Math.abs(biz.availableCash))}. Check the opening balance in Settings if this looks wrong.`, href: "/finance" });
  } else if (threshold > 0 && biz.availableCash < threshold) {
    alerts.push({ id: "cash-low", level: "warn", title: "Cash is below your minimum", detail: `Available ${money(biz.availableCash)}, minimum set to ${money(threshold)}.`, href: "/finance" });
  }
  const lateDeliveries = biz.pendingDeliveries.filter((r) => r.late && r.status !== "cancelled");
  if (lateDeliveries.length) {
    alerts.push({ id: "late-delivery", level: "warn", title: `${lateDeliveries.length} late deliver${lateDeliveries.length > 1 ? "ies" : "y"}`, detail: "Expected delivery date has passed.", href: "/orders?filter=late" });
  }
  const overLimit = biz.clientStats.filter((c) => c.over_limit);
  if (overLimit.length) {
    alerts.push({ id: "limit", level: "warn", title: `${overLimit.length} client${overLimit.length > 1 ? "s" : ""} over credit limit`, detail: overLimit.slice(0, 3).map((c) => c.client.name).join(", "), href: "/clients" });
  }
  const deliveredUnpaid = biz.orderRows.filter((r) => r.status === "delivered" && r.due > 0.004 && !r.overdue);
  if (deliveredUnpaid.length) {
    const sum = deliveredUnpaid.reduce((s, r) => s + r.due, 0);
    alerts.push({ id: "delivered-unpaid", level: "info", title: `${deliveredUnpaid.length} delivered order${deliveredUnpaid.length > 1 ? "s" : ""} not fully paid`, detail: `${money(sum)} still to collect from delivered goods.`, href: "/orders?filter=unpaid" });
  }
  const prepaid = biz.orderRows.filter((r) => r.status !== "delivered" && r.paid > 0.004);
  if (prepaid.length) {
    alerts.push({ id: "prepaid", level: "info", title: `${prepaid.length} order${prepaid.length > 1 ? "s" : ""} paid but not yet delivered`, detail: "Client money received; goods still owed.", href: "/orders?filter=open" });
  }
  if (biz.clientCredit > 0.004) {
    alerts.push({ id: "credit", level: "info", title: "Advance held from clients", detail: `${money(biz.clientCredit)} was paid beyond current bills and will be applied to their next orders.`, href: "/clients" });
  }
  if (biz.health.orphan_payments || biz.health.orders_without_client) {
    alerts.push({ id: "orphans", level: "warn", title: "Records pointing to a missing client", detail: `${biz.health.orphan_payments} payment(s), ${biz.health.orders_without_client} order(s). A client was deleted after they had activity.`, href: "/clients" });
  }
  if (biz.overAdvance?.length) {
    const sum = biz.overAdvance.reduce((s, b) => s - b.balance, 0);
    alerts.push({ id: "over-advance", level: "warn", title: `${biz.overAdvance.length} worker${biz.overAdvance.length > 1 ? "s" : ""} took more advance than earned`, detail: `${money(sum)} will be deducted from their coming salary. ${biz.overAdvance.slice(0, 3).map((b) => b.worker.name).join(", ")}`, href: "/salary" });
  }
  if (biz.salaryExpenseTotal > 0 && biz.staffPaid > 0) {
    alerts.push({ id: "salary-double", level: "info", title: "Salary may be counted twice", detail: `${money(biz.salaryExpenseTotal)} is entered as "Salary" expenses and staff payments are also recorded on the Salary page. Keep only one.`, href: "/expenses" });
  }
  const order = { danger: 0, warn: 1, info: 2 };
  return alerts.sort((a, b) => order[a.level] - order[b.level]);
}

// ---------- production value (estimate only, never real income) ---------------

// Value of one production-log line. New logs store the price used at the time;
// older logs fall back to the product's current price.
export function logItemValue(item, productMap) {
  const price = item.unit_price != null ? num(item.unit_price) : num(productMap.get(item.product_id)?.price_per_piece);
  return round2(num(item.quantity) * price);
}
