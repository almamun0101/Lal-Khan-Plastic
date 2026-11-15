# Business Control Panel (Factory Production + Clients, Orders, Payments, Finance)

Next.js 15 (App Router) · React 19 · Tailwind · Firebase Auth + Firestore · Recharts · Zod.
Deploys to Netlify. Everything is free-tier friendly.

## What it does

| Area | Pages |
|---|---|
| **Dashboard** | Sales vs received vs dues vs available cash (kept separate), alerts, overdue payments, pending deliveries, recent transactions, performance indicators, 14-day chart |
| **Clients** | `/clients` list with billed / paid / due · `/clients/[id]` full account: orders, payment history, running-balance statement (print or Excel) |
| **Orders** | `/orders` · `/orders/[id]`: multi-product orders, quantity, price, cost, customisation, delivery (partial deliveries), courier, tracking ID, invoice print |
| **Payments** | `/payments`: every payment with date, client, order, method (Cash / bKash / Bank / Other), reference; filters; Excel |
| **Finance** | `/finance`: money received, money spent, available cash, receivables, expected collections (overdue / 7 days / 30 days / later), cash-flow chart |
| **Expenses** | `/expenses`: categories, paid-by method, filters, Excel |
| **Analytics** | `/analytics`: daily / weekly / monthly / yearly sales, received, expenses, profit, outstanding; top clients and products; Excel |
| **Production** (original features, kept) | Production Count, Production Logs, Daily, Production Queue (was "Orders"), Floor Overview (was Dashboard), Production Value (was Income), Production Reports, Machines, Workers, Products, Settings |

## The four numbers that are never mixed up

| Number | Meaning |
|---|---|
| **Total sales (billed)** | Sum of all non-cancelled orders: products − discount + delivery charge billed to the client |
| **Payments received** | Money actually recorded as paid |
| **Outstanding dues** | Billed − paid, per order (partial payments supported) |
| **Available cash** | Opening balance + payments received − expenses − delivery costs |

`Net profit = total sales − product cost − delivery costs − expenses`.
Don't enter the same cost twice (as an order line "cost / unit" *and* as an expense).

How payments are applied: a payment tied to an order pays that order. A payment "On account" (or the part that is more than an order needs) pays the client's **oldest unpaid order first**; anything beyond all bills is kept as the client's **advance**. Payments on a cancelled order stay in "received" and become client credit. All of this lives in one file, `src/lib/finance.js`, covered by `npm test`.

## Important changes from the previous version

- **Old "Orders" = machine production jobs.** They were renamed **Production Queue** (`/production/queue`). Same Firestore collection (`orders`), so all existing data is untouched. **Customer orders** are a new collection, `sales_orders`.
- **Old "Income" showed pieces × price**, which looked like real income. It is now **Production Value** (an estimate) and is never added to sales or cash.
- Old dashboard → **Floor Overview** (`/production/overview`). The new `/dashboard` is the business dashboard.
- New production entries store the price used at the time, so old bills don't change when you edit a product's price. (Older entries fall back to the current price.)
- The machine on a saved production entry can no longer be changed (it corrupted the running counter). Delete and re-enter instead.

## Bugs fixed (audit)

1. **Settings never loaded after login** (listener opened before sign-in was killed by security rules). Now subscribes after login.
2. **Date bug in Bangladesh time** (`toISOString` shifted dates by a day between 12 AM and 6 AM). All dates now use the local calendar.
3. **Failed reads looked like "no data"** (errors replaced data with an empty list). Now data is kept and a persistent red banner explains the problem.
4. **Duplicate saves**: every create now uses a pre-generated ID, so retrying a slow save can't create a second record. Slow connections show "saved on this device, will sync" instead of a false error.
5. "Mark Complete" on the production queue promised the next job became active but never did it. Fixed.
6. Dashboard only counted the latest 500 production logs; now all.
7. Diagnostics wrote to Firestore on every page load. Now read-only on load; write test only on demand.
8. Each page opened its own Firestore listeners (slow, re-downloading, totals could briefly disagree). One shared live store now.
9. Documents missing `created_at` were silently hidden by server-side sorting. Sorting is now done in the browser.
10. Netlify: removed the manual `@netlify/plugin-nextjs` entry (Netlify installs its runtime automatically).
11. Misc: Tailwind `h-4.5` classes that did nothing, hard-coded "of 12 workers / of 3 machines", a missing `danger` gauge tone that would crash, no error boundary (blank screen on crash), no password reset, modal scroll lock / nested Escape handling.

## Setup

```bash
npm install
cp .env.local.example .env.local      # fill in your six Firebase values
npm run dev
npm test                               # finance unit tests
```

### Firebase (one time)
1. Authentication → Sign-in method → enable **Email/Password**; add your user.
2. Create the **Firestore** database.
3. **Publish the new `firestore.rules`** (Firestore → Rules → paste → Publish). The new collections `clients`, `sales_orders`, `payments` are blocked until you do. The red banner in the app will tell you if you forget.
4. Authentication → Settings → Authorized domains → add your Netlify domain.

### Netlify
Set the six `NEXT_PUBLIC_FIREBASE_*` variables in Site configuration → Environment variables, then **Clear cache and deploy site**.

### First use
1. **Settings**: set your *opening cash balance* and payment terms (default 15 days).
2. **Products**: add selling price and cost per piece.
3. **Clients** → add a client → **New order** (an advance can be recorded right in the form) → **Record payment** as money arrives.

## Data model (Firestore)

`clients` · `sales_orders` (items[], discount, delivery_charge, delivery_cost, status, due_date, expected/ actual delivery, courier, tracking_id) · `payments` (client_id, order_id or "", amount, date, method, reference) · `expenses` (+ method) · `products` (+ cost_per_piece) · `production_logs` (items now include unit_price) · `orders` (production queue) · `machines` · `workers` · `app_config/settings` · `app_config/counters` (order numbers ORD-0001…).

Totals are **never stored**; they are always recomputed from these records, so every page agrees.
