# Changes Summary

## Phase 1 — Project Setup & Infrastructure

- **Initialized** Electron + React + Vite project with `package.json`, `vite.config.js`, `index.html`
- **Configured** `electron-builder.yml` for Windows `.exe` packaging (NSIS installer, x64)
- **Set up** folder structure: `electron/`, `src/`, `cloudflare/`, `src/pages/`, `src/components/`
- **Installed** `better-sqlite3` (v12), Tailwind CSS, shadcn/ui utilities, React Router, Recharts, lucide-react
- **Set up** Tailwind CSS with `tailwind.config.js`, `postcss.config.js`, `src/index.css`
- **Configured IPC bridge**: `electron/preload.js` (contextBridge + ipcRenderer), `electron/ipc.js` (handler registration), wired into `electron/main.js`
- **Created** Electron main process (`electron/main.js`) with dev/prod URL detection and window creation
- **Created** app skeleton: `src/main.jsx` (React entry, BrowserRouter + Routes), `src/components/Sidebar.jsx` (nav with lucide icons), `src/pages/Dashboard.jsx` (placeholder)
- **Created** database module (`electron/db.js`), sync placeholder (`electron/sync.js`), Cloudflare Worker placeholder (`cloudflare/worker.js`)
- **Added** `.gitignore`

## Phase 2 — Local Database Schema (first 3 tables)

- **Created `customers` table** in `electron/db.js`: id, name, phone, address, balance (INTEGER, stored in smallest currency unit), created_at, updated_at, synced
- **Created `products` table**: id, name, unit (kg/box/piece), current_stock, reorder_level, timestamps, synced
- **Created `stock_purchases` table**: id, product_id (FK → products), qty, cost_price (INTEGER, smallest currency unit), supplier, date, timestamps, synced
- All tables use `CREATE TABLE IF NOT EXISTS` inside a `createTables()` function called from `initDatabase()`

## Phase 2 — Local Database Schema (next 3 tables)

- **Created `sales` table**: id, customer_id (FK → customers), date, total_amount (INTEGER), notes, timestamps, synced
- **Created `sale_items` table**: id, sale_id (FK → sales), product_id (FK → products), qty, unit_price (INTEGER), timestamps, synced
- **Created `payments` table**: id, customer_id (FK → customers), amount (INTEGER), date, notes, timestamps, synced

## Phase 2 — Local Database Schema (CRUD + migrations)

- **Added migration system** via `_meta` table with `schema_version` key, checked on `initDatabase()`
- **Wrote all CRUD functions** in `electron/db.js`:
  - Customers: `getCustomers`, `getCustomer`, `addCustomer`, `updateCustomer`, `searchCustomers`, `recalculateBalance`
  - Products: `getProducts`, `getProduct`, `addProduct`, `updateProduct`, `getLowStockProducts`
  - Stock purchases: `getStockPurchases`, `getStockPurchase`, `addStockPurchase` (auto-increments product stock)
  - Sales: `getSales`, `getSale` (with items), `addSale` (transaction: inserts sale + items, deducts stock, recalculates balance), `deleteSale` (reverses everything)
  - Payments: `getPayments`, `getPaymentsByCustomer`, `addPayment` (auto-updates customer balance)
  - Reports helpers: `getSalesInRange`, `getTopProducts`, `getTopCustomers`, `getStockMovements`, `getInventoryValue`

## Phase 3 — Core Backend Logic (IPC handlers)

- **Wired all CRUD functions** as IPC handlers in `electron/ipc.js`:
  - `customers:*` — list, get, add, update, search, recalculate-balance
  - `products:*` — list, get, add, update, low-stock
  - `stock-purchases:*` — list, get, add
  - `sales:*` — list, get, add, delete
  - `payments:*` — list, by-customer, add
  - `reports:*` — sales-range, top-products, top-customers, stock-movements, inventory-value

## Phase 4 — Frontend UI (first 3 screens)

- **Created `src/lib/ipc.js`** — thin wrapper around `electronAPI.invoke` with safe fallback
- **Created `src/components/TopBar.jsx`** — header with online/offline status and last-synced indicator
- **Updated `src/main.jsx`** — full layout with Sidebar + TopBar + Routes for all 7 pages
- **Rewrote `Dashboard.jsx`** — stat cards (today's sales, stock value, outstanding balance), low-stock alert banner
- **Created `Customers.jsx`** — search bar, customer list with phone/address/balance, inline add/edit form
- **Added placeholder pages**: Products, NewSale, StockPurchase, Payments, Reports (wired into routes)

## Phase 4 — Frontend UI (next 3 screens)

- **Created `CustomerDetail.jsx`** — full ledger view with running balance, sales & payments history table, back navigation; added `/customers/:id` route
- **Rewrote `Products.jsx`** — card grid with stock levels, low-stock highlight, unit selector (kg/box/piece/etc.), inline add/edit form
- **Rewrote `StockPurchase.jsx`** — form with product select, qty, cost price (converted to paise), supplier, date; purchase history table below
- **Updated `Customers.jsx`** — customer cards now link to detail page

## Phase 4 — Frontend UI (remaining screens)

- **Rewrote `NewSale.jsx`** — customer select, date, notes, dynamic line items (product + qty + price), running total, saves via IPC (auto-converts prices to paise)
- **Rewrote `Payments.jsx`** — customer select, amount, date, notes form with recent payments table below
- **Phase 4 fully complete** — all 10 screens implemented

## Phase 6 — Cloudflare D1 Sync (env-based config)

- **Removed Cloudflare D1 config from Settings** — worker URL and sync token fields removed from `Settings.jsx`
- **Added `dotenv`** — loads `.env` in main process from project root (dev) or `userData` (packaged)
- **Updated `sync.js`** — reads `WORKER_URL` and `SYNC_TOKEN` directly from `process.env` instead of `_meta` table
- **Removed defaults from `db.js`** — no longer seeds `worker_url` / `sync_token` into `_meta`
- **Updated `.env`** — added `WORKER_URL` and `SYNC_TOKEN` entries

## Phase 5 — Reports & PDF Export

- **Added `app:print-to-pdf` handler** in `electron/ipc.js` using Electron's `printToPDF` and `dialog` APIs
- **Configured print styles** in `src/index.css` to hide navigation and interaction elements for clean PDFs
- **Enhanced `Reports.jsx`** — added Stock Movements table and 'Download PDF' button
- **Updated `CustomerDetail.jsx`** — added 'Delete Sale' functionality and 'Print Ledger' button with print-only headers
- **Finished Phase 4 Polish** — added `deletePayment` to `db.js`, registered IPC handler, and added delete button to `Payments.jsx`

## Improvements & Refinements (from IMPROVE.md)

- **Implemented Zod Schema Validation** — added type-safe validation for all forms (Customers, Products, Sales, Payments, Stock Purchases) to prevent malformed data entry
- **Standardized IPC Error Handling** — implemented a `wrap` helper in `electron/ipc.js` and updated `src/lib/ipc.js` to catch and report errors via toasts
- **Added Toast Notifications** — integrated `sonner` for rich-color interactive feedback across the app
- **Enhanced Secret Management** — moved sync worker URL and secret token from hardcoded strings to database-managed metadata (configurable via Settings)
- **Hardened Database Initialization** — ensured default metadata values are set on first run and improved migration reliability

## Phase 6 — Cloudflare D1 Sync

- **Implemented Cloudflare Worker API** (`cloudflare/worker.js`) with pull/push endpoints and Bearer token auth
- **Created Sync Engine** (`electron/sync.js`) for bidirectional sync with last-write-wins conflict resolution
- **Integrated Sync into UI** — added real-time status indicators and manual sync button to `TopBar.jsx`
- **Added Metadata Helpers** to `db.js` to track `last_sync_time`

## Phase 7 — Polish & Deployment

- **Created Settings Screen** (`src/pages/Settings.jsx`) — allows configuration of Shop Name, Currency, and Sync credentials
- **Implemented Keyboard Shortcuts** — global `Ctrl+Key` navigation (Dashboard, Customers, etc.)
- **Finalized Documentation** — wrote a user-friendly `README.md` guide
- **Completed Infrastructure** — all features from the original plan and audit refinements are now implemented

## Sync Bug Fixes (from sync-issues.md)

- **Issue 1 — Deleted rows resurrect**: Added `deleted_log` table to local schema and D1. `deleteSale()` and `deletePayment()` now log deletions (`table_name`, `row_id`) inside their transactions. Push sends `_deletes` array; worker deletes matching rows from D1.
- **Issue 2 — Rows permanently lost during push**: Push now captures row IDs before sending, then marks only those specific IDs as `synced = 1` (`WHERE id IN (...)`), avoiding a race where rows inserted mid-sync got silently dropped.
- **Issue 3 — Worker ignored deletions**: `POST /push` handler reads `data._deletes` and deletes from D1 with a `tables.includes()` safety guard against malformed payloads.
- **Deployed** updated worker + D1 schema (7 tables incl. `deleted_log`).
