# Project Improvements & Refinements

This document tracks technical and user-experience improvements. 

## ✅ Solved / Implemented

- **Keyboard Navigation (Global):** Ctrl/Meta shortcuts implemented for all main routes in `main.jsx`.
- **Interactive Feedback (Toasts):** `sonner` integrated and used for success/error notifications.
- **Standardized IPC Response:** `{ success, data, error }` wrapper implemented in `ipc.js` and handled in `src/lib/ipc.js`.
- **Zod Validation:** All major forms (`NewSale`, `Customers`) now use Zod schemas for pre-submission validation.
- **Phase 6 Sync Core:** `sync.js` implemented with Pull/Push logic, last-write-wins resolution, and background interval.
- **Sync UI:** `TopBar` dynamically updates status via `sync:status` IPC events.
- **Metadata Storage:** `_meta` table and associated `getMeta`/`setMeta` functions implemented for settings persistence.
- **Security:** Preload script isolation and standardized IPC bridge fully operational.

---

## ⏳ Pending / In-Progress

### 1. Performance & Scale
- **Pagination:** Implement `LIMIT` and `OFFSET` in `db.js` queries for Sales and Customers to prevent slowdowns as the database grows (1,000+ records).
- **Table Sorting:** Add UI-driven sorting for data grids (e.g., sort customers by highest balance).
- **React Query Migration:** While IPC is standardized, moving to `TanStack Query` would improve caching and reduce redundant DB hits.

### 2. User Experience (UX) Refinement
- **Delete Confirmations:** Add a modal or "Are you sure?" prompt before deleting sales or payments.
- **Loading Skeletons:** Implement skeleton loaders for smoother perceived performance.
- **Input Masks:** Add masks for phone numbers and formatted currency inputs.

### 3. Deployment & Production (Phase 7)
- **Auto-Updater:** Configure `electron-updater` for seamless background updates.
- **Installer Signing:** Code signing for the Windows `.exe` to avoid "Unknown Publisher" warnings.
- **User Documentation:** Basic PDF or "Help" screen for end-users.

### 4. Future Features (v2.0)
- **Unit Conversions:** Logic to handle conversions (e.g., 1 Box = 24 Pieces).
- **GST Support:** Simple tax calculation fields.
- **Expense Tracking:** Shop expenses ledger.
- **Automated Testing:** Implement Vitest for DB logic and Playwright for Electron E2E flows.

