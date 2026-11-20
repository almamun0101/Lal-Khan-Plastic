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
| **Team** | `/workers`: joining date + salary (monthly or per day), no employee ID · `/salary`: monthly salary sheet with days present, overtime, advances, over-advance and net payable |
| **Production** (original features, kept) | Production Count, Production Logs, Daily, Production Calendar, Production Queue (was "Orders"), Floor Overview (was Dashboard), Production Value (was Income), Production Reports, Machines, Workers, Products, Settings |

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
3. **Publish `firestore.rules` to the correct project.** This repository is configured for Firebase project `factory-7faaa` (`.firebaserc` and `.env.local` must agree). In Firebase Console, select `factory-7faaa` → Firestore Database → Rules, paste the complete contents of `firestore.rules`, then click **Publish**. The rules already include authenticated read access to `activity_log`; if that collection still reports `permission-denied`, the deployed rules are outdated, the app is pointed at a different project, or the user is not signed in.

   Optional CLI deployment from the project folder (requires Firebase CLI login and project permissions):
   ```bash
   npx firebase-tools deploy --only firestore:rules --project factory-7faaa
   ```
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


## Workers, salary and advances

- **Present** = the worker is named (Worker 1 or Worker 2) on a production entry that date. One present day = one day's pay.
- **Overtime** = the same worker covers **both** shifts on one date (for example a colleague didn't come). That date pays 1 day + 1 overtime shift. Overtime rate (default 300) and days per month (default 30) are in Settings.
- **Daily rate** = monthly salary ÷ days per month, or the per-day wage if the worker is set up as "per day". Days before the joining date are ignored.
- **Advances / salary payments** (Salary page) are deducted from what the worker has earned. If someone takes more than they earned it shows as **over-advance** (red, "Owes ...") and carries into the next months automatically.
- **Finance:** staff payments count as money spent (cash), and staff pay *earned* counts against profit. Don't also enter salaries on the Expenses page (the dashboard warns if you do).
- **Production Count** pre-fills the crew from the last entry on that machine (same shift if possible). Change it if someone else is on duty. It also shows which Production Queue order the count goes toward: target, done before, after this entry, remaining. New entries remember their order, so the queue page and the calendar agree.
- **Production Calendar** (`/production/calendar`): 24-hour totals per day (day shift + night shift), calendar or table view, click a day for every entry, Excel export. A night shift counts on the date it starts.

**After updating, publish `firestore.rules` again** (it now includes `staff_payments`).

## Second audit: bugs fixed and real-world safeguards

Tested by driving the real app in a browser (client → order with advance → payments → delivery → production shifts → salary → calendar → dashboard totals, plus mobile and dark mode) against an in-memory database, then the money rules again with unit tests (`npm test`).

Fixed:
- **Production Count layout**: the order-progress box squeezed the product and count fields down to "Pl" / "000". Fixed.
- **Order form layout**: Qty and Total boxes were cut off ("10(", "৳25,..."). Fixed.
- **Dropdown width**: filter dropdowns ignored their width and the arrow floated far away. Fixed.
- **"Total Bill" on Production Count** now says *Production value (estimate)* so it can't be mistaken for sales.
- **Silent overtime**: a night shift used to be pre-filled with the *day* crew, which would count them as overtime. Crew now pre-fills from the last entry of the **same shift** only.
- Chart axis labels rounded oddly (12.5k showed as 13k); "1 clients" / "1 days" wording; a Next.js smooth-scroll warning.

Added for real-world use:
- **Counter reset**: tick "counter was reset or replaced" so a lower reading starts from 0 instead of being rejected.
- **Heads-ups on Production Count**: a worker already on the other shift today (= overtime), a worker on two machines in one shift, and entries older than the latest one for that machine.
- **Activity Log** (`/activity`): who edited, cancelled or deleted payments, expenses, salary payments, orders and production entries. It can be added to but never edited or deleted (enforced in `firestore.rules`).
- **Backup**: Settings → Download backup gives every record as one JSON file.

**Publish `firestore.rules` again** after updating (new: `staff_payments`, `activity_log`). The in-app connection check now tests `activity_log` directly rather than a separate diagnostics collection, so it reports the permission that the Activity Log page actually needs.
