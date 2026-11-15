// Single place for every fixed list used across the app, so labels, colours
// and Firestore values can never drift apart between pages.

export const PAYMENT_METHODS = [
  { value: "cash", label: "Cash" },
  { value: "bkash", label: "bKash" },
  { value: "bank", label: "Bank" },
  { value: "other", label: "Other" },
];
export const METHOD_LABEL = Object.fromEntries(PAYMENT_METHODS.map((m) => [m.value, m.label]));

// Order lifecycle. "delivered" is only ever reached when every item has been
// fully delivered (see applyDelivery in finance.js), "cancelled" orders are
// ignored by every money calculation.
export const ORDER_STATUSES = [
  { value: "pending", label: "Pending", tone: "gray" },
  { value: "in_production", label: "In production", tone: "blue" },
  { value: "ready", label: "Ready", tone: "amber" },
  { value: "shipped", label: "Shipped", tone: "purple" },
  { value: "delivered", label: "Delivered", tone: "green" },
  { value: "cancelled", label: "Cancelled", tone: "red" },
];
export const STATUS_META = Object.fromEntries(ORDER_STATUSES.map((s) => [s.value, s]));

// Expense categories. The first five are the original ones (kept so existing
// expense records still match). Delivery costs live on the order itself, so
// there is deliberately no "Delivery" category here: it would be counted twice.
export const EXPENSE_CATEGORIES = [
  "Machine",
  "Utility",
  "Maintenance",
  "Salary",
  "Raw Material",
  "Rent",
  "Packaging",
  "Marketing",
  "Other",
];

export const WEEK_START_OPTIONS = [
  { value: 6, label: "Saturday" },
  { value: 0, label: "Sunday" },
  { value: 1, label: "Monday" },
];

export const DEFAULT_SETTINGS = {
  factory_name: "My Factory",
  day_shift_start: "09:00",
  night_shift_start: "21:00",
  currency: "BDT",
  theme: "system",
  // Business-finance settings
  opening_balance: 0, // cash on hand before the first payment recorded in the app
  credit_days: 15, // default days a client has to pay after the order date
  low_cash_threshold: 0, // alert when available cash drops below this
  week_starts_on: 6, // 6 = Saturday (common in Bangladesh)
  business_phone: "",
  business_address: "",
};
