import test from "node:test";
import assert from "node:assert/strict";
import { computePayroll, dailyRate, overtimeRate, staffSummary } from "../src/lib/payroll.js";

const settings = { overtime_rate: 300, salary_days_per_month: 30 };
const w = (id, extra = {}) => ({ id, name: id, salary_type: "monthly", salary_amount: 12000, joining_date: "2026-01-01", ...extra });
const log = (date, shift, w1, w2 = "") => ({ date, shift, worker1_id: w1, worker2_id: w2 });

test("daily rate: monthly ÷ 30, or per-day amount", () => {
  assert.equal(dailyRate(w("a"), settings), 400);
  assert.equal(dailyRate(w("a", { salary_type: "daily", salary_amount: 450 }), settings), 450);
  assert.equal(overtimeRate({}), 300);
  assert.equal(overtimeRate({ overtime_rate: 250 }), 250);
});

test("each date a worker is on duty = one present day", () => {
  const logs = [log("2026-03-01", "day", "a", "b"), log("2026-03-02", "night", "a"), log("2026-03-02", "night", "a", "a")];
  const p = computePayroll({ workers: [w("a"), w("b")], logs, settings, month: "2026-03" });
  const a = p.rows[0], b = p.rows[1];
  assert.equal(a.daysPresent, 2);
  assert.equal(a.otShifts, 0);
  assert.equal(a.earned, 800);
  assert.equal(b.daysPresent, 1);
});

test("covering both shifts on one date = 1 day + 1 overtime", () => {
  const logs = [log("2026-03-05", "day", "a"), log("2026-03-05", "night", "a")];
  const a = computePayroll({ workers: [w("a")], logs, settings, month: "2026-03" }).rows[0];
  assert.equal(a.daysPresent, 1);
  assert.equal(a.otShifts, 1);
  assert.equal(a.basic, 400);
  assert.equal(a.otPay, 300);
  assert.equal(a.earned, 700);
});

test("days before the joining date are ignored", () => {
  const logs = [log("2026-02-27", "day", "a"), log("2026-03-02", "day", "a")];
  const a = computePayroll({ workers: [w("a", { joining_date: "2026-03-01" })], logs, settings, month: "2026-03" }).rows[0];
  assert.equal(a.daysPresent, 1);
});

test("advances reduce what is payable; salary payments too", () => {
  const logs = ["01", "02", "03", "04", "05"].map((d) => log(`2026-03-${d}`, "day", "a")); // 5 × 400 = 2000
  const pays = [{ worker_id: "a", type: "advance", amount: 500, date: "2026-03-03" }, { worker_id: "a", type: "salary", amount: 700, date: "2026-03-31" }];
  const a = computePayroll({ workers: [w("a")], logs, staffPayments: pays, settings, month: "2026-03" }).rows[0];
  assert.equal(a.earned, 2000);
  assert.equal(a.advances, 500);
  assert.equal(a.salaryPaid, 700);
  assert.equal(a.closing, 800);
});

test("over-advance is flagged and carries into the next month", () => {
  const logs = [log("2026-03-01", "day", "a"), log("2026-04-01", "day", "a")];
  const pays = [{ worker_id: "a", type: "advance", amount: 1000, date: "2026-03-02" }];
  const mar = computePayroll({ workers: [w("a")], logs, staffPayments: pays, settings, month: "2026-03" }).rows[0];
  assert.equal(mar.closing, -600);
  assert.equal(mar.overAdvance, 600);
  const apr = computePayroll({ workers: [w("a")], logs, staffPayments: pays, settings, month: "2026-04" }).rows[0];
  assert.equal(apr.opening, -600);
  assert.equal(apr.closing, -200);
});

test("staff summary: earned (profit) vs paid (cash)", () => {
  const logs = [log("2026-03-01", "day", "a"), log("2026-03-01", "night", "a")];
  const s = staffSummary({ workers: [w("a")], logs, staffPayments: [{ worker_id: "a", type: "advance", amount: 100, date: "2026-03-02" }], settings });
  assert.equal(s.earned, 700);
  assert.equal(s.paid, 100);
  assert.equal(s.balances[0].balance, 600);
  assert.deepEqual(s.earningsByDate, [{ date: "2026-03-01", amount: 700 }]);
});
