import { clsx } from "clsx";
import { twMerge } from "tailwind-merge";

function cn(...inputs) {
  return twMerge(clsx(inputs));
}

const pad = (n) => String(n).padStart(2, "0");

// Formats a Date as YYYY-MM-DD using the LOCAL calendar (never toISOString,
// which converts to UTC and shifts the date by a day in timezones like
// Bangladesh, UTC+6, between midnight and 6 AM).
function toISODate(d) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

// Parses YYYY-MM-DD as a local date (noon, to stay clear of DST edges).
function parseISODate(iso) {
  const [y, m, d] = String(iso).split("-").map(Number);
  return new Date(y, (m || 1) - 1, d || 1, 12, 0, 0, 0);
}

function todayISO() {
  return toISODate(new Date());
}

function addDays(iso, n) {
  const d = parseISODate(iso);
  d.setDate(d.getDate() + n);
  return toISODate(d);
}

function diffDays(aISO, bISO) {
  return Math.round((parseISODate(bISO) - parseISODate(aISO)) / 86400000);
}

// First day of the week containing `iso`. weekStart: 0=Sun … 6=Sat.
function startOfWeek(iso, weekStart = 6) {
  const d = parseISODate(iso);
  const diff = (d.getDay() - weekStart + 7) % 7;
  d.setDate(d.getDate() - diff);
  return toISODate(d);
}

function daysBetween(startISO, endISO) {
  const out = [];
  const end = parseISODate(endISO);
  for (let d = parseISODate(startISO); d <= end; d.setDate(d.getDate() + 1)) {
    out.push(toISODate(d));
  }
  return out;
}

// Detects which shift a moment falls into, from the "HH:MM" shift start times.
function detectShift(dayStart = "09:00", nightStart = "21:00", at = new Date()) {
  const minutesNow = at.getHours() * 60 + at.getMinutes();
  const toMinutes = (t) => {
    const [h, m] = t.split(":").map(Number);
    return h * 60 + m;
  };
  const dayStartM = toMinutes(dayStart);
  const nightStartM = toMinutes(nightStart);
  if (dayStartM < nightStartM) {
    return minutesNow >= dayStartM && minutesNow < nightStartM ? "day" : "night";
  }
  return minutesNow >= dayStartM || minutesNow < nightStartM ? "day" : "night";
}

const CURRENCY_SYMBOLS = { BDT: "\u09F3", USD: "$", EUR: "\u20AC", GBP: "\xA3", INR: "\u20B9" };

// Deterministic formatting (explicit locale) so server and browser always agree.
// BDT/INR use lakh/crore digit grouping, which is how amounts are read locally.
function formatCurrency(amount, currency = "BDT") {
  const n = Number(amount);
  const safe = Number.isFinite(n) ? n : 0;
  const symbol = CURRENCY_SYMBOLS[currency] ?? `${currency} `;
  const locale = currency === "BDT" || currency === "INR" ? "en-IN" : "en-US";
  const sign = safe < 0 ? "-" : "";
  return `${sign}${symbol}${Math.abs(safe).toLocaleString(locale, { maximumFractionDigits: 2 })}`;
}

function formatNumber(n) {
  const v = Number(n);
  return (Number.isFinite(v) ? v : 0).toLocaleString("en-IN", { maximumFractionDigits: 2 });
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function formatDate(iso) {
  if (!iso) return "\u2014";
  const [y, m, d] = String(iso).split("-").map(Number);
  if (!y || !m || !d) return String(iso);
  return `${d} ${MONTHS[m - 1]} ${y}`;
}

function formatMinutes(minutes) {
  if (minutes == null || !isFinite(minutes) || minutes < 0) return "\u2014";
  const totalMin = Math.round(minutes);
  const days = Math.floor(totalMin / (60 * 24));
  const hours = Math.floor((totalMin % (60 * 24)) / 60);
  const mins = totalMin % 60;
  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${mins}m`;
  return `${mins}m`;
}

function formatDateTime(date) {
  if (!date) return "\u2014";
  return `${date.getDate()} ${MONTHS[date.getMonth()]}, ${date.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}`;
}

function genId(prefix = "id") {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

// Rounds to 2 decimals, which keeps long sums of money free of
// floating-point drift (0.1 + 0.2 style errors).
function round2(n) {
  const v = Number(n);
  if (!Number.isFinite(v)) return 0;
  return Math.round((v + Number.EPSILON) * 100) / 100;
}

export {
  addDays,
  cn,
  daysBetween,
  detectShift,
  diffDays,
  formatCurrency,
  formatDate,
  formatDateTime,
  formatMinutes,
  formatNumber,
  genId,
  parseISODate,
  round2,
  startOfWeek,
  toISODate,
  todayISO,
};
