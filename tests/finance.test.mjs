// Run with:  npm test
// Verifies the money maths the whole app depends on.
import test from "node:test";
import assert from "node:assert/strict";
import {
  allocateClient, buildAlerts, buildSeries, bucketKeys, clientLedger, computeBusiness,
  deliveryPatch, deliveryProgress, effectiveStatus, orderTotal, statusPatch,
} from "../src/lib/finance.js";
import { addDays, startOfWeek, toISODate, todayISO, formatCurrency, daysBetween } from "../src/lib/utils.js";

const item = (qty, unit_price, unit_cost = 0, delivered_qty = 0) => ({ product_id: "p1", name: "Plate", qty, unit_price, unit_cost, delivered_qty });
const order = (id, client_id, date, items, extra = {}) => ({ id, order_no: id, client_id, order_date: date, status: "pending", items, discount: 0, delivery_charge: 0, delivery_cost: 0, created_at: Date.parse(date), ...extra });
const pay = (id, client_id, date, amount, extra = {}) => ({ id, client_id, date, amount, method: "cash", created_at: Date.parse(date), ...extra });

test("order total = items − discount + delivery charge, never negative", () => {
  assert.equal(orderTotal(order("o", "c", "2026-01-01", [item(10, 250)], { discount: 100, delivery_charge: 70 })), 2470);
  assert.equal(orderTotal(order("o", "c", "2026-01-01", [item(1, 50)], { discount: 500, delivery_charge: 70 })), 70);
});

test("partial + multiple payments reduce due correctly", () => {
  const o = order("o1", "c1", "2026-01-01", [item(10, 100)]); // 1000
  const { rows, credit } = allocateClient([o], [pay("a", "c1", "2026-01-02", 300, { order_id: "o1" }), pay("b", "c1", "2026-01-05", 200, { order_id: "o1" })]);
  assert.equal(rows[0].paid, 500);
  assert.equal(rows[0].total - rows[0].paid, 500);
  assert.equal(credit, 0);
});

test("on-account payment settles oldest order first", () => {
  const o1 = order("o1", "c1", "2026-01-01", [item(1, 1000)]);
  const o2 = order("o2", "c1", "2026-01-10", [item(1, 1000)]);
  const { rows } = allocateClient([o2, o1], [pay("a", "c1", "2026-01-12", 1500)]);
  const r1 = rows.find((r) => r.order.id === "o1");
  const r2 = rows.find((r) => r.order.id === "o2");
  assert.equal(r1.paid, 1000);
  assert.equal(r2.paid, 500);
});

test("overpayment becomes client credit and billed − received = due − credit", () => {
  const cl = [{ id: "c1", name: "A" }];
  const orders = [order("o1", "c1", "2026-01-01", [item(1, 1000)])];
  const payments = [pay("a", "c1", "2026-01-02", 1000, { order_id: "o1" }), pay("b", "c1", "2026-01-03", 250)];
  const biz = computeBusiness({ clients: cl, orders, payments, today: "2026-02-01" });
  const c = biz.clientStats[0];
  assert.equal(c.billed, 1000);
  assert.equal(c.received, 1250);
  assert.equal(c.due, 0);
  assert.equal(c.credit, 250);
  assert.equal(c.billed - c.received, c.due - c.credit);
});

test("cancelled orders are ignored; payments to them stay as credit", () => {
  const cl = [{ id: "c1", name: "A" }];
  const orders = [order("o1", "c1", "2026-01-01", [item(1, 1000)], { status: "cancelled" }), order("o2", "c1", "2026-01-02", [item(1, 500)])];
  const payments = [pay("a", "c1", "2026-01-03", 400, { order_id: "o1" })];
  const biz = computeBusiness({ clients: cl, orders, payments, today: "2026-02-01" });
  assert.equal(biz.salesTotal, 500);
  assert.equal(biz.receivedTotal, 400);
  // The 400 paid to the cancelled order is re-applied to the live order.
  assert.equal(biz.receivables, 100);
  assert.equal(biz.clientCredit, 0);
});

test("sales, received, receivables and available cash stay separate", () => {
  const cl = [{ id: "c1", name: "A" }, { id: "c2", name: "B" }];
  const orders = [
    order("o1", "c1", "2026-03-01", [item(10, 250, 100)], { delivery_charge: 70, delivery_cost: 60 }), // total 2570
    order("o2", "c2", "2026-03-02", [item(4, 250, 100)]), // total 1000
  ];
  const payments = [pay("a", "c1", "2026-03-03", 1000, { order_id: "o1" }), pay("b", "c2", "2026-03-04", 1000, { order_id: "o2" })];
  const expenses = [{ id: "e1", amount: 300, date: "2026-03-05", name: "Ink", category: "Raw Material" }];
  const biz = computeBusiness({ clients: cl, orders, payments, expenses, settings: { opening_balance: 500 }, today: "2026-03-10" });
  assert.equal(biz.salesTotal, 3570);
  assert.equal(biz.receivedTotal, 2000);
  assert.equal(biz.receivables, 1570);
  assert.equal(biz.moneySpent, 360); // 300 expense + 60 delivery cost
  assert.equal(biz.availableCash, 500 + 2000 - 360);
  assert.equal(biz.productCost, 1400);
  assert.equal(biz.netProfit, 3570 - 1400 - 60 - 300);
});

test("overdue uses explicit due date, else order date + credit days", () => {
  const cl = [{ id: "c1", name: "A" }];
  const orders = [
    order("o1", "c1", "2026-01-01", [item(1, 100)], { due_date: "2026-01-10" }),
    order("o2", "c1", "2026-01-01", [item(1, 100)]), // default 15 days → 2026-01-16
    order("o3", "c1", "2026-02-20", [item(1, 100)]),
  ];
  const biz = computeBusiness({ clients: cl, orders, payments: [], settings: { credit_days: 15 }, today: "2026-02-01" });
  const overdue = biz.orderRows.filter((r) => r.overdue).map((r) => r.id).sort();
  assert.deepEqual(overdue, ["o1", "o2"]);
  assert.equal(biz.collections.overdue, 200);
  assert.equal(buildAlerts(biz, {}, "2026-02-01").some((a) => a.id === "overdue"), true);
});

test("delivery quantities drive status; partial delivery is not 'delivered'", () => {
  const o = order("o1", "c1", "2026-01-01", [item(10, 100), item(5, 50)]);
  const part = { ...o, ...deliveryPatch(o, [10, 2]) };
  assert.equal(deliveryProgress(part).state, "partial");
  assert.equal(effectiveStatus(part), "shipped");
  const full = { ...o, ...deliveryPatch(o, [10, 5]) };
  assert.equal(effectiveStatus(full), "delivered");
  const reset = { ...full, ...statusPatch(full, "ready", "2026-01-09") };
  assert.equal(deliveryProgress(reset).delivered, 0);
  const forced = { ...o, ...statusPatch(o, "delivered", "2026-01-09") };
  assert.equal(effectiveStatus(forced), "delivered");
  assert.equal(forced.delivery_date, "2026-01-09");
  // A stale stored "delivered" with missing quantities is not trusted.
  assert.equal(effectiveStatus({ ...o, status: "delivered" }), "shipped");
});

test("series: totals match, outstanding = billed − received", () => {
  const orders = [order("o1", "c1", "2026-03-01", [item(1, 1000, 400)]), order("o2", "c1", "2026-02-10", [item(1, 500)])];
  const payments = [pay("a", "c1", "2026-03-05", 700), pay("b", "c1", "2026-02-12", 100)];
  const expenses = [{ id: "e", amount: 50, date: "2026-03-06" }];
  const s = buildSeries({ orders, payments, expenses, today: "2026-03-20", period: "monthly", count: 3 });
  assert.equal(s.length, 3);
  assert.equal(s.reduce((a, r) => a + r.sales, 0), 1500);
  assert.equal(s.reduce((a, r) => a + r.received, 0), 800);
  assert.equal(s.at(-1).outstanding, 700);
  assert.equal(s.at(-1).profit, 1000 - 400 - 50);
});

test("dates are timezone-safe and weeks can start on Saturday", () => {
  assert.equal(addDays("2026-01-31", 1), "2026-02-01");
  assert.equal(toISODate(new Date(2026, 0, 1, 0, 30)), "2026-01-01"); // 00:30 local must stay Jan 1
  assert.equal(startOfWeek("2026-11-14", 6), "2026-11-14"); // 14 Nov 2026 is a Saturday
  assert.equal(startOfWeek("2026-11-18", 6), "2026-11-14");
  assert.equal(daysBetween("2026-02-27", "2026-03-02").length, 4);
  const keys = bucketKeys("2026-03-15", "monthly", 4);
  assert.deepEqual(keys, ["2025-12", "2026-01", "2026-02", "2026-03"]);
  assert.equal(formatCurrency(1234567.5, "BDT"), "\u09F31,234,567.5".replace("1,234,567.5", "12,34,567.5"));
  assert.equal(typeof todayISO(), "string");
});

test("ledger running balance is positive when client owes", () => {
  const orders = [order("o1", "c1", "2026-01-01", [item(1, 1000)])];
  const l = clientLedger(orders, [pay("a", "c1", "2026-01-02", 400)]);
  assert.deepEqual(l.map((e) => e.balance), [1000, 600]);
});

test("staff pay: cash uses what was paid, profit uses what was earned", () => {
  const cl = [{ id: "c1", name: "A" }];
  const orders = [order("o1", "c1", "2026-03-01", [item(1, 5000, 0)])];
  const payments = [pay("a", "c1", "2026-03-02", 5000, { order_id: "o1" })];
  const workers = [{ id: "w1", name: "Karim", salary_type: "monthly", salary_amount: 12000, joining_date: "2026-01-01" }];
  const logs = [{ date: "2026-03-05", shift: "day", worker1_id: "w1" }, { date: "2026-03-05", shift: "night", worker1_id: "w1" }, { date: "2026-03-06", shift: "day", worker1_id: "w1" }];
  const staffPayments = [{ id: "s1", worker_id: "w1", type: "advance", amount: 300, date: "2026-03-07" }];
  const settings = { overtime_rate: 300, salary_days_per_month: 30, opening_balance: 0 };
  const biz = computeBusiness({ clients: cl, orders, payments, workers, logs, staffPayments, settings, today: "2026-03-10" });
  assert.equal(biz.staffEarned, 400 + 300 + 400); // 2 present days + 1 overtime shift
  assert.equal(biz.staffPaid, 300);
  assert.equal(biz.moneySpent, 300);
  assert.equal(biz.availableCash, 5000 - 300);
  assert.equal(biz.netProfit, 5000 - 1100);
  assert.equal(biz.staffOwed, 800);
  const s = buildSeries({ orders, payments, expenses: [], workers, logs, staffPayments, settings, today: "2026-03-10", period: "monthly", count: 1 });
  assert.equal(s[0].profit, 5000 - 1100);
  assert.equal(s[0].spent, 300);
});
