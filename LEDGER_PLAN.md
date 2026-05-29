# Ledger Section — Feature Plan & Build Guide

> **Context:** Adding a dedicated **Ledger** section to the Wholesale Ledger App.  
> Currently, ledger data exists but is scattered: per-customer history lives in `CustomerDetail.jsx`,
> payments are a separate page, and there is no unified cross-customer ledger view.  
> This plan introduces a first-class `/ledger` section with its own screen, filters, and business logic.

---

## What the Ledger Section Is

A central, date-ordered log of **every financial event** across all customers — every sale and every payment — presented as a running account book. It complements `CustomerDetail` (which is per-customer) by giving a **shop-wide view** that the owner can review at the end of the day or at the start of the week.

---

## Phase L1 — Database & Backend

### L1.1 — Unified Ledger Query

- [ ] Add `getLedgerEntries(filters)` function in `electron/db.js`
  - Merges `sales` + `payments` using a `UNION ALL` SQL query
  - Returns columns: `id`, `type` (`sale` / `payment`), `customer_id`, `customer_name`, `date`, `amount`, `notes`, `reference_id`
  - Supports filters: `customer_id`, `date_from`, `date_to`, `type`
  - Supports `LIMIT` / `OFFSET` for pagination
  - Orders by `date DESC`, then `created_at DESC` as tiebreaker

```sql
-- Example base query shape
SELECT
  'sale'    AS type,
  s.id,
  s.customer_id,
  c.name    AS customer_name,
  s.date,
  s.total_amount AS amount,
  s.notes,
  s.id      AS reference_id
FROM sales s
JOIN customers c ON c.id = s.customer_id

UNION ALL

SELECT
  'payment' AS type,
  p.id,
  p.customer_id,
  c.name    AS customer_name,
  p.date,
  -p.amount AS amount,   -- negative = money received
  p.notes,
  p.id      AS reference_id
FROM payments p
JOIN customers c ON c.id = p.customer_id

ORDER BY date DESC, created_at DESC
LIMIT ? OFFSET ?
```

### L1.2 — Ledger Count Query

- [ ] Add `getLedgerCount(filters)` function in `electron/db.js`
  - Same `UNION ALL` shape as above but returns `COUNT(*)` for pagination

### L1.3 — Ledger Summary Query

- [ ] Add `getLedgerSummary(filters)` function in `electron/db.js`
  - Returns aggregate values for the current filtered view:
    - `total_sales` — sum of all sale amounts
    - `total_payments` — sum of all payment amounts
    - `net_outstanding` — `total_sales - total_payments`
    - `entry_count` — total number of entries

### L1.4 — IPC Handlers

- [ ] Register new IPC channels in `electron/ipc.js`:
  - `ledger:list` → calls `getLedgerEntries(filters)`
  - `ledger:count` → calls `getLedgerCount(filters)`
  - `ledger:summary` → calls `getLedgerSummary(filters)`

---

## Phase L2 — Frontend: Ledger Page

### L2.1 — New Page File

- [ ] Create `src/pages/Ledger.jsx`
- [ ] Register route `/ledger` in `src/main.jsx`
- [ ] Add **Ledger** nav item in `src/components/Sidebar.jsx` with a `BookOpen` icon from `lucide-react`, positioned between **Payments** and **Reports**

### L2.2 — Filter Bar

- [ ] Customer dropdown — "All Customers" default, populated from `customers:list`
- [ ] Type toggle — `All / Sales / Payments` (three-way button group)
- [ ] Date range — `Date From` and `Date To` date inputs, defaulting to the current calendar month
- [ ] "Clear Filters" button — resets all filters to defaults
- [ ] Filters are applied on change (no explicit submit needed); page resets to 1 on every filter change

### L2.3 — Summary Strip

- [ ] Displayed above the table, updates whenever filters change
- [ ] Shows four stat cards in a row:
  - **Total Sales** (orange) — sum of sale amounts in the filtered view
  - **Total Payments** (green) — sum of payment amounts in the filtered view
  - **Net Outstanding** (blue or red depending on sign) — sales minus payments
  - **Entries** (gray) — count of rows in the filtered view
- [ ] Stat cards use the same visual style as the Dashboard cards

### L2.4 — Ledger Table

Columns:

| Column | Notes |
|---|---|
| Date | `formatDate(entry.date)` |
| Customer | Name, links to `/customers/:id` |
| Type | Pill badge — orange **Sale**, green **Payment** |
| Reference | `Sale #ID` or `Payment #ID` |
| Debit (Dr) | Shows sale amount in orange; blank for payments |
| Credit (Cr) | Shows payment amount in green; blank for sales |
| Notes | `italic text-xs text-gray-400`; `-` if empty |
| Action | Delete button (Trash2 icon), same confirm-dialog pattern as other pages |

- [ ] Empty state: "No entries found for the selected filters." centered in the table
- [ ] Loading state: 10 skeleton rows (same Skeleton component used elsewhere)
- [ ] Pagination: reuse `Pagination.jsx` component, 20 entries per page (`LIMIT = 20`)

### L2.5 — Delete Actions

- [ ] Deleting a **Sale** row calls `sales:delete` (existing IPC) — already reverses stock and recalculates balance
- [ ] Deleting a **Payment** row calls `payments:delete` (existing IPC) — already reverses balance
- [ ] After delete: reload ledger data and summary, show `toast.success`
- [ ] Confirm dialog uses the same `ConfirmDialog.jsx` component
  - Sale message: *"This will reverse the sale, return items to stock, and update the customer balance."*
  - Payment message: *"This will reverse the payment and increase the customer's outstanding balance."*

### L2.6 — Export to PDF

- [ ] "Download PDF" button in the top-right of the page (same as `CustomerDetail.jsx`)
- [ ] Calls `ipc('app:print-to-pdf', 'Ledger_<DateRange>')` — reuses the existing print-to-PDF IPC handler
- [ ] Page has `print-only` / `no-print` CSS classes applied like `CustomerDetail.jsx` so the printed output is clean

---

## Phase L3 — Polish & Integration

### L3.1 — Dashboard Integration

- [ ] Add a **"View Ledger"** quick-link button on the Dashboard screen, below the outstanding balance card
- [ ] The link should pre-filter to today's date when clicked (pass `?date=today` query param and read it in `Ledger.jsx` on mount)

### L3.2 — Customer Detail Cross-Link

- [ ] In `CustomerDetail.jsx`, add a small **"View in Ledger"** link next to the "Transaction History" heading
- [ ] Link navigates to `/ledger?customer_id=<id>` — Ledger page reads `customer_id` from the URL on mount and pre-selects the customer filter

### L3.3 — Keyboard Shortcut

- [ ] Register `Ctrl+L` shortcut (in `electron/main.js` or via `useEffect` on the renderer) to navigate to `/ledger`
- [ ] Document the shortcut in `README.md`

### L3.4 — Sync Compatibility

- [ ] `ledger:list` and `ledger:summary` are read-only derived queries — no new tables, no new `synced` columns needed
- [ ] No changes required to `sync.js` or the Cloudflare Worker — ledger entries come from `sales` and `payments`, which are already synced

---

## File Change Summary

| File | Change |
|---|---|
| `electron/db.js` | Add `getLedgerEntries`, `getLedgerCount`, `getLedgerSummary` |
| `electron/ipc.js` | Register `ledger:list`, `ledger:count`, `ledger:summary` handlers |
| `src/main.jsx` | Add `/ledger` route pointing to `Ledger.jsx` |
| `src/components/Sidebar.jsx` | Add Ledger nav item with `BookOpen` icon |
| `src/pages/Ledger.jsx` | **New file** — full ledger screen |
| `src/pages/Dashboard.jsx` | Add "View Ledger" quick-link |
| `src/pages/CustomerDetail.jsx` | Add "View in Ledger" cross-link |
| `README.md` | Document `Ctrl+L` shortcut |

> No schema migrations, no new tables, no sync changes required.  
> All new queries are derived from existing `sales` and `payments` tables.

---

## Build Order

1. **L1 first** — write and test the three db functions in isolation before touching the UI.
2. **L1.4** — wire up IPC handlers; verify with a quick `ipc('ledger:list', {})` call from DevTools.
3. **L2.1** — scaffold the page and route so you can navigate to it.
4. **L2.2 + L2.3** — filter bar and summary strip; confirm data loads and aggregates correctly.
5. **L2.4** — build the table with pagination.
6. **L2.5** — add delete with confirm dialogs.
7. **L2.6** — PDF export.
8. **L3** — cross-links, keyboard shortcut, README update.
