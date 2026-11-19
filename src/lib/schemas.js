import { z } from "zod";
import { EXPENSE_CATEGORIES } from "./constants";

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Pick a valid date");
const optionalDate = z.string().regex(/^(\d{4}-\d{2}-\d{2})?$/, "Pick a valid date");
const money = (label = "Amount") => z.coerce.number({ invalid_type_error: `${label} must be a number` }).min(0, "Can't be negative").max(1e9, "That amount looks too large");

// One row in a production entry: a product being run on the machine this
// shift, with the new cumulative counter reading. "count" is NOT the amount
// produced this shift -- it's the running total on the machine's counter.
// The amount produced is derived elsewhere as count - start_count.
const productionLineItemSchema = z.object({
  product_id: z.string().min(1, "Select a product"),
  count: z.coerce.number().min(0, "Must be 0 or more"),
});

const productionEntrySchema = z
  .object({
    date: z.string().min(1, "Date is required"),
    shift: z.enum(["day", "night"]),
    machine_id: z.string().min(1, "Select a machine"),
    worker1_id: z.string().min(1, "Select worker 1"),
    worker2_id: z.string().min(1, "Select worker 2"),
    items: z.array(productionLineItemSchema).min(1, "Add at least one product"),
  })
  .refine((data) => data.worker1_id !== data.worker2_id, {
    message: "Worker 1 and Worker 2 must be different",
    path: ["worker2_id"],
  });

const workerSchema = z.object({
  name: z.string().trim().min(1, "Name is required"),
  phone: z.string().trim().optional(),
  status: z.enum(["active", "inactive"]),
  joining_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Pick the joining date"),
  salary_type: z.enum(["monthly", "daily"]),
  salary_amount: z.coerce.number({ invalid_type_error: "Enter the salary" }).min(0, "Can't be negative").max(1e8, "That looks too large"),
});

const staffPaymentSchema = z.object({
  worker_id: z.string().min(1, "Select a worker"),
  type: z.enum(["advance", "salary"]),
  amount: z.coerce.number({ invalid_type_error: "Enter an amount" }).positive("Must be greater than 0").max(1e8, "That looks too large"),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Pick a valid date"),
  method: z.enum(["cash", "bkash", "bank", "other"]),
  note: z.string().optional(),
});

const machineSchema = z.object({
  name: z.string().min(1, "Name is required"),
  status: z.enum(["running", "idle", "maintenance"]),
});

const productSchema = z.object({
  name: z.string().min(1, "Name is required"),
  price_per_piece: z.coerce.number().positive("Must be greater than 0"),
  // What it costs you to make/buy one piece. Optional; pre-fills new order lines
  // so profit is calculated automatically.
  cost_per_piece: z.coerce.number().min(0, "Can't be negative").default(0),
  rate_per_minute: z.coerce.number().positive("Must be greater than 0"),
});

const orderSchema = z.object({
  machine_id: z.string().min(1, "Select a machine"),
  product_id: z.string().min(1, "Select a product"),
  target_quantity: z.coerce.number().positive("Must be greater than 0"),
  rate_per_minute: z.coerce.number().positive("Must be greater than 0"),
  reference: z.string().trim().optional(), // free-text label, e.g. the client or "5000 plates for Rahim"
});

const expenseSchema = z.object({
  name: z.string().trim().min(1, "Name is required"),
  category: z.enum(EXPENSE_CATEGORIES),
  amount: z.coerce.number().positive("Must be greater than 0").max(1e9, "That amount looks too large"),
  date: isoDate,
  method: z.enum(["cash", "bkash", "bank", "other"]).default("cash"),
  notes: z.string().optional(),
});

const clientSchema = z.object({
  name: z.string().trim().min(1, "Client name is required"),
  phone: z.string().trim().optional(),
  email: z.string().trim().email("Enter a valid email").optional().or(z.literal("")),
  address: z.string().optional(),
  notes: z.string().optional(),
  credit_limit: money("Credit limit").default(0),
  status: z.enum(["active", "inactive"]).default("active"),
});

const paymentSchema = z.object({
  client_id: z.string().min(1, "Select a client"),
  order_id: z.string().optional(),
  amount: z.coerce.number({ invalid_type_error: "Enter an amount" }).positive("Must be greater than 0").max(1e9, "That amount looks too large"),
  date: isoDate,
  method: z.enum(["cash", "bkash", "bank", "other"]),
  reference: z.string().optional(), // bKash TrxID, cheque no., etc.
  notes: z.string().optional(),
});

const orderItemSchema = z.object({
  product_id: z.string().optional(),
  name: z.string().trim().min(1, "Item name is required"),
  qty: z.coerce.number({ invalid_type_error: "Enter a quantity" }).positive("Must be greater than 0").max(1e7, "Too large"),
  unit_price: money("Price"),
  unit_cost: money("Cost").default(0),
  customization: z.string().optional(),
  delivered_qty: z.coerce.number().min(0).default(0),
});

const orderTotals = (o) => {
  const subtotal = o.items.reduce((s, i) => s + i.qty * i.unit_price, 0);
  return { subtotal, total: Math.max(0, subtotal - o.discount) + o.delivery_charge };
};

const salesOrderSchema = z
  .object({
    client_id: z.string().min(1, "Select a client"),
    order_date: isoDate,
    due_date: optionalDate.optional(),
    expected_delivery_date: optionalDate.optional(),
    items: z.array(orderItemSchema).min(1, "Add at least one product"),
    discount: money("Discount").default(0),
    delivery_charge: money("Delivery charge").default(0),
    delivery_cost: money("Delivery cost").default(0),
    delivery_address: z.string().optional(),
    courier: z.string().optional(),
    tracking_id: z.string().optional(),
    notes: z.string().optional(),
    // Optional money received together with a NEW order (recorded as a payment).
    advance: money("Advance").default(0),
    advance_method: z.enum(["cash", "bkash", "bank", "other"]).default("cash"),
  })
  .superRefine((o, ctx) => {
    const { subtotal, total } = orderTotals(o);
    if (o.discount > subtotal + 0.0001) ctx.addIssue({ code: "custom", message: "Discount can't be more than the products total", path: ["discount"] });
    if (o.advance > total + 0.0001) ctx.addIssue({ code: "custom", message: "Advance can't be more than the order total", path: ["advance"] });
  });

const deliverySchema = z.object({
  courier: z.string().optional(),
  tracking_id: z.string().optional(),
  delivery_date: optionalDate.optional(),
  delivery_cost: money("Delivery cost").default(0),
});

export {
  clientSchema,
  deliverySchema,
  expenseSchema,
  orderItemSchema,
  paymentSchema,
  salesOrderSchema,
  machineSchema,
  orderSchema,
  productSchema,
  productionEntrySchema,
  productionLineItemSchema,
  staffPaymentSchema,
  workerSchema,
};
