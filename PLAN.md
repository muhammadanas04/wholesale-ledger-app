# Wholesale Ledger App — Feature To-Do & Build Guide

> **Stack:** Electron + React + SQLite (local) → Cloudflare D1 (cloud sync)  
> **Target:** Windows desktop app, offline-first, 2–3 users

---

## Phase 1 — Project Setup & Infrastructure

- [x] Initialise Electron + React + Vite project
- [x] Configure electron-builder for Windows `.exe` packaging
- [x] Set up folder structure: `electron/`, `src/`, `cloudflare/`
- [x] Install `better-sqlite3` for local database
- [x] Set up Tailwind CSS + shadcn/ui component library
- [x] Configure IPC bridge between Electron main & renderer

---

## Phase 2 — Local Database Schema

- [x] Design and create `customers` table (id, name, phone, address, balance, timestamps)
- [x] Design and create `products` table (id, name, unit, current_stock, reorder_level)
- [x] Design and create `stock_purchases` table (id, product_id, qty, cost_price, supplier, date)
- [x] Design and create `sales` table (id, customer_id, date, total_amount, notes)
- [x] Design and create `sale_items` table (id, sale_id, product_id, qty, unit_price)
- [x] Design and create `payments` table (id, customer_id, amount, date, notes)
- [x] Add `synced` + `updated_at` columns to every table for sync tracking
- [x] Write `db.js` module with all CRUD query functions
- [x] Add database migration/versioning system

---

## Phase 3 — Core Backend Logic (Electron Main Process)

- [x] Customer management: add, edit, view, search customers
- [x] Product management: add, edit, update stock levels
- [x] Stock purchase entry: record new stock bought with supplier and cost
- [x] Sales entry: create sale with line items, auto-deduct stock
- [x] Payment recording: log payments against a customer's ledger
- [x] Balance calculation: auto-compute each customer's outstanding balance
- [x] Low stock alert logic: flag products below reorder level
- [x] Expose all logic to renderer via IPC handlers

---

## Phase 4 — Frontend UI Screens

- [x] App shell: sidebar navigation, top bar, layout skeleton
- [x] Dashboard screen: today's sales, total stock value, pending balances summary
- [x] Customers screen: list, search, add/edit customer form
- [x] Customer detail screen: full ledger — all sales, payments, running balance
- [x] Products / stock screen: list all products with current stock levels
- [x] Stock purchase screen: form to record new stock bought
- [x] New sale screen: select customer, add line items, set prices, save
- [x] Record payment screen: select customer, enter payment amount
- [x] Low stock alerts banner/screen
- [x] Sync status indicator in header (online / offline / last synced)

---

## Phase 5 — Reports

- [x] Weekly sales report: total sold, top products, top customers
- [x] Monthly sales report: same as weekly but per month with trends
- [x] Stock report: current inventory value, stock bought vs sold per period
- [x] Per-customer report: full transaction history, total purchased, outstanding balance
- [x] Reports UI screen with date range picker and filters
- [x] Print / export report to PDF using Electron's print-to-PDF API

---

## Phase 6 — Cloudflare D1 Sync

d1_database_info : [
{
  binding : DB,
  database_name : "wholesale-personal",
  database_id : "8b64feac-f3a4-4242-8f57-986abf38c8b0"
}
]

- [ ] Create Cloudflare D1 database with identical schema to local SQLite
- [ ] Write Cloudflare Worker API: push endpoint (receive records from app)
- [ ] Write Cloudflare Worker API: pull endpoint (return records newer than timestamp)
- [ ] Secure Worker API with a secret token (Authorization header)
- [ ] Write `sync.js` in Electron: detect internet, pull remote changes, push local unsynced rows
- [ ] Handle last-write-wins conflict resolution using `updated_at` timestamp
- [ ] Auto-sync on app start if online; retry every N minutes in background
- [ ] Show sync status and last-synced time in UI

---

## Phase 7 — Polish & Deployment

- [ ] Add user settings screen: shop name, currency symbol, sync interval
- [ ] Keyboard shortcuts for common actions (new sale, new customer)
- [ ] Auto-updater setup with `electron-updater`
- [ ] Build and sign Windows `.exe` installer with `electron-builder`
- [ ] Write basic user guide / README for the 2–3 users
- [ ] Test full offline → online sync cycle end to end

---

## Build Order Notes

Each phase depends on the previous. Follow this sequence strictly:

1. **Phase 1** — Get the skeleton running. An Electron window that opens a React app. Nothing else.
2. **Phase 2** — Define all tables before writing any logic. Changing schema later is painful.
3. **Phase 3** — All business rules live in the Electron main process, talking to SQLite via `db.js`. No UI yet.
4. **Phase 4** — Wire up the React frontend to the IPC handlers from Phase 3. Each screen is forms + tables calling those handlers.
5. **Phase 5** — Mostly SQL queries added to `db.js`, with a reports screen and PDF export on top.
6. **Phase 6** — Start only after the local app works perfectly. Sync is an isolated layer: a Worker on Cloudflare and a `sync.js` file in Electron.
7. **Phase 7** — Done last, once everything works.

---

## Recommended Folder Structure

```
wholesale-ledger/
├── electron/
│   ├── main.js          ← App entry, window creation
│   ├── db.js            ← All SQLite queries
│   ├── sync.js          ← Cloudflare D1 sync logic
│   └── ipc.js           ← IPC handler registrations
├── src/
│   ├── pages/
│   │   ├── Dashboard.jsx
│   │   ├── Customers.jsx
│   │   ├── CustomerDetail.jsx
│   │   ├── Products.jsx
│   │   ├── NewSale.jsx
│   │   ├── StockPurchase.jsx
│   │   ├── Payments.jsx
│   │   └── Reports.jsx
│   ├── components/
│   │   ├── Sidebar.jsx
│   │   ├── TopBar.jsx
│   │   └── SyncStatus.jsx
│   └── main.jsx
├── cloudflare/
│   └── worker.js        ← Deployed once to Cloudflare
├── electron-builder.yml
└── package.json
```

---

## Sync Strategy (Summary)

Every table has two extra columns:

| Column | Type | Purpose |
|---|---|---|
| `updated_at` | DATETIME | Timestamp of last change |
| `synced` | BOOLEAN | Whether this row has been pushed to D1 |

**Sync flow on app start:**
1. Check for internet connection
2. If online → pull all D1 rows newer than `last_sync_time`
3. Apply pulled rows to local SQLite (last-write-wins on `updated_at`)
4. Push all local rows where `synced = false` to D1
5. Mark pushed rows as `synced = true`
6. Save current timestamp as `last_sync_time`
7. If offline → use local SQLite only; new rows tagged `synced = false`
