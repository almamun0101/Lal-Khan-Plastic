// =============================================================================
// payroll.js — attendance, salary, overtime and advances. Pure functions.
//
// RULES (as used by the factory):
//   * A worker is PRESENT on a date when they are named (Worker 1 or Worker 2)
//     on at least one production entry that date. Present = one day of pay.
//   * Each date has two shifts: day (9am–9pm) and night (9pm–9am, belongs to the
//     date it started). If the same worker covers BOTH shifts on one date (e.g.
//     because a colleague didn't come), the extra shift is OVERTIME, paid at the
//     overtime rate (Settings, default 300 per extra shift).
//   * Daily rate = monthly salary ÷ days-per-month (Settings, default 30), or the
//     per-day amount if the worker is set up as "per day".
//   * Days before the worker's joining date are ignored.
//   * Advances and salary payments are subtracted from what the worker has
//     earned. If they took more than they earned, the balance goes negative
//     ("over-advance") and carries forward into the next month automatically.
// =============================================================================
import { round2 } from "./utils.js";

const num = (v) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

export function dailyRate(worker, settings = {}) {
  const amount = Math.max(0, num(worker?.salary_amount));
  if (worker?.salary_type === "daily") return round2(amount);
  const days = num(settings.salary_days_per_month) > 0 ? num(settings.salary_days_per_month) : 30;
  return round2(amount / days);
}

export function overtimeRate(settings = {}) {
  const v = settings.overtime_rate;
  return v === undefined || v === null || v === "" || !Number.isFinite(Number(v)) ? 300 : Math.max(0, Number(v));
}

// workerId -> Map(date -> Set(shift))
export function buildDuty(logs = []) {
  const duty = new Map();
  for (const l of logs) {
    if (!l?.date) continue;
    const shift = l.shift === "night" ? "night" : "day";
    for (const id of new Set([l.worker1_id, l.worker2_id])) {
      if (!id) continue;
      if (!duty.has(id)) duty.set(id, new Map());
      const byDate = duty.get(id);
      if (!byDate.has(l.date)) byDate.set(l.date, new Set());
      byDate.get(l.date).add(shift);
    }
  }
  return duty;
}

// One entry per date the worker was present.
export function workerDays(worker, dutyByDate = new Map(), settings = {}) {
  const rate = dailyRate(worker, settings);
  const ot = overtimeRate(settings);
  const join = worker?.joining_date || "";
  const out = [];
  for (const [date, shifts] of dutyByDate) {
    if (join && date < join) continue;
    const extra = Math.max(0, shifts.size - 1);
    out.push({
      date,
      shifts: [...shifts].sort(),
      ot: extra,
      basic: rate,
      otPay: round2(extra * ot),
      total: round2(rate + extra * ot),
    });
  }
  return out.sort((a, b) => (a.date < b.date ? -1 : 1));
}

const monthOf = (d) => String(d ?? "").slice(0, 7);
const sum = (arr, f) => round2(arr.reduce((s, x) => s + f(x), 0));

/**
 * Salary sheet for one month (month = "YYYY-MM"). Balances are cumulative, so a
 * worker's unpaid salary, or an advance they still owe, rolls over by itself.
 */
export function computePayroll({ workers = [], logs = [], staffPayments = [], settings = {}, month }) {
  const duty = buildDuty(logs);
  const paysByWorker = new Map();
  staffPayments.forEach((p) => {
    if (!paysByWorker.has(p.worker_id)) paysByWorker.set(p.worker_id, []);
    paysByWorker.get(p.worker_id).push(p);
  });

  const rows = workers.map((worker) => {
    const days = workerDays(worker, duty.get(worker.id), settings);
    const pays = paysByWorker.get(worker.id) ?? [];
    const before = days.filter((d) => monthOf(d.date) < month);
    const inMonth = days.filter((d) => monthOf(d.date) === month);
    const paysBefore = pays.filter((p) => monthOf(p.date) < month);
    const paysMonth = pays.filter((p) => monthOf(p.date) === month);
    const advMonth = paysMonth.filter((p) => p.type === "advance");
    const salMonth = paysMonth.filter((p) => p.type !== "advance");

    const opening = round2(sum(before, (d) => d.total) - sum(paysBefore, (p) => num(p.amount)));
    const basic = sum(inMonth, (d) => d.basic);
    const otPay = sum(inMonth, (d) => d.otPay);
    const earned = round2(basic + otPay);
    const advances = sum(advMonth, (p) => num(p.amount));
    const salaryPaid = sum(salMonth, (p) => num(p.amount));
    const closing = round2(opening + earned - advances - salaryPaid);

    return {
      worker,
      rate: dailyRate(worker, settings),
      daysPresent: inMonth.length,
      otShifts: inMonth.reduce((s, d) => s + d.ot, 0),
      days: inMonth,
      basic,
      otPay,
      earned,
      advances,
      salaryPaid,
      advanceList: advMonth,
      salaryList: salMonth,
      opening,
      closing, // > 0 : we owe the worker.  < 0 : worker owes us (took too much advance).
      overAdvance: closing < -0.004 ? round2(-closing) : 0,
      active: inMonth.length > 0 || pays.some((p) => monthOf(p.date) === month) || Math.abs(opening) > 0.004,
    };
  });

  return {
    month,
    rows,
    totals: {
      earned: sum(rows, (r) => r.earned),
      advances: sum(rows, (r) => r.advances),
      salaryPaid: sum(rows, (r) => r.salaryPaid),
      payable: sum(rows, (r) => Math.max(0, r.closing)),
      overAdvance: sum(rows, (r) => r.overAdvance),
    },
  };
}

/** All-time staff figures used by the finance engine (profit uses earned, cash uses paid). */
export function staffSummary({ workers = [], logs = [], staffPayments = [], settings = {} }) {
  const duty = buildDuty(logs);
  const earningsByDate = new Map();
  const balances = workers.map((worker) => {
    const days = workerDays(worker, duty.get(worker.id), settings);
    days.forEach((d) => earningsByDate.set(d.date, round2((earningsByDate.get(d.date) ?? 0) + d.total)));
    const earned = sum(days, (d) => d.total);
    const paid = sum(
      staffPayments.filter((p) => p.worker_id === worker.id),
      (p) => num(p.amount)
    );
    return { worker, earned, paid, balance: round2(earned - paid) };
  });
  return {
    earned: sum(balances, (b) => b.earned),
    paid: sum(staffPayments, (p) => Math.max(0, num(p.amount))),
    balances,
    earningsByDate: Array.from(earningsByDate, ([date, amount]) => ({ date, amount })),
  };
}
