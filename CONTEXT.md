# Wholesale Ledger App — Project Context

## What This App Is

A desktop application for Windows built for a wholesale shop to manage their day-to-day business operations. It handles stock inventory, sales, customer ledgers, and financial reports. The app is used by 2–3 people internally and must work fully offline, syncing data to a cloud database whenever internet is available.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Desktop shell | Electron |
| Frontend UI | React + Vite |
| Styling | Tailwind CSS + shadcn/ui |
| Local database | SQLite via `better-sqlite3` |
| Cloud database | Cloudflare D1 (SQLite-compatible) |
| Cloud sync API | Cloudflare Workers |
| Packaging | electron-builder (Windows .exe) |

---

## Core Features

### 1. Stock Management
The app tracks all products the shop buys and sells. Each product has a name, unit (kg, box, piece, etc.), current stock quantity, and a reorder level. When stock falls below the reorder level, the app shows a low stock alert. Stock increases when a purchase is recorded and decreases automatically when a sale is made.

### 2. Stock Purchases
When the shop buys new stock from a supplier, the user records it here: which product, how much quantity, the cost price per unit, supplier name, and date. This increases the stock level for that product.

### 3. Sales & Invoicing
The user creates a sale by selecting a customer and adding line items (product, quantity, unit price). On saving, the app auto-deducts the sold quantities from stock, calculates the total amount, and adds it to the customer's outstanding balance.

### 4. Customer Ledger
Every customer has their own ledger — a running record of all their purchases and payments. The app always shows the current outstanding balance for each customer. The user can record a payment against a customer which reduces their balance.

### 5. Payments
Payments from customers are recorded separately. Each payment logs the customer, amount, date, and optional notes. The customer's balance updates automatically.

### 6. Reports
- **Weekly report:** total sales, total stock purchased, top-selling products, top customers for the week
- **Monthly report:** same as weekly but aggregated by month with a comparison to the previous month
- **Stock report:** current inventory value, stock movement (bought vs sold) for a given period
- **Customer report:** full transaction history for any customer — every sale, every payment, running balance
- All reports can be exported to PDF using Electron's built-in print-to-PDF

### 7. Dashboard
A home screen showing at a glance: today's total sales, total outstanding balance across all customers, current stock value, and any low stock alerts.

---

## Offline-First Sync Architecture

The app works 100% offline using a local SQLite database stored on the machine. Every table has two extra columns: `updated_at` (timestamp of last change) and `synced` (boolean — whether this row has been pushed to the cloud).

When the app detects an internet connection, it runs a sync cycle:
1. Pull all rows from Cloudflare D1 that are newer than the last sync timestamp
2. Apply those rows to local SQLite using last-write-wins logic on `updated_at`
3. Push all local rows where `synced = false` up to D1
4. Mark those rows as `synced = true` and save the current time as `last_sync_time`

The sync happens automatically on app start and retries in the background at a set interval. A sync status indicator in the header shows online/offline state and when data was last synced.

The Cloudflare Worker exposes two simple REST endpoints secured by a secret token:
- `POST /push` — receives records from the app and upserts them into D1
- `GET /pull?since=<timestamp>` — returns all records modified after the given timestamp

---

## Database Tables

```sql
customers       (id, name, phone, address, balance, created_at, updated_at, synced)
products        (id, name, unit, current_stock, reorder_level, created_at, updated_at, synced)
stock_purchases (id, product_id, qty, cost_price, supplier, date, created_at, updated_at, synced)
sales           (id, customer_id, date, total_amount, notes, created_at, updated_at, synced)
sale_items      (id, sale_id, product_id, qty, unit_price, created_at, updated_at, synced)
payments        (id, customer_id, amount, date, notes, created_at, updated_at, synced)
```

---

## Folder Structure

```
wholesale-ledger/
├── electron/
│   ├── main.js          ← App entry, Electron window creation
│   ├── db.js            ← All SQLite queries (CRUD for every table)
│   ├── sync.js          ← Cloudflare D1 sync logic
│   └── ipc.js           ← All IPC handler registrations
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
│   └── worker.js        ← Deployed to Cloudflare, never changes after setup
├── electron-builder.yml
└── package.json
```

---

## Key Behaviours & Business Rules

- **Stock is always auto-deducted** when a sale is saved. The user never manually reduces stock for a sale.
- **Customer balance is always auto-calculated** from the sum of all their sales minus all their payments. It is never manually edited.
- **Sale items cannot be edited after saving** — to correct a mistake, the sale must be deleted and re-entered. This keeps the ledger clean and auditable.
- **All monetary values** are stored as integers in the smallest currency unit (e.g. paise if using INR) to avoid floating point errors.
- **Sync is non-blocking** — if sync fails or is slow, the app continues working normally on local data.
- **No user authentication** is required — the app is installed on trusted in-shop machines only.
- **The Cloudflare Worker secret token** is hardcoded in the Electron app's config and in the Worker — it just prevents random people from hitting the API.

---

## What the App Is NOT

- Not a full accounting or GST/tax filing system
- Not a multi-location or multi-shop system
- Not a point-of-sale (POS) system with barcode scanning
- Not accessible from a browser or mobile — desktop Windows only
