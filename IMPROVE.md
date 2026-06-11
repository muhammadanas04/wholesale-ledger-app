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
- **Pagination & Sorting:** Implemented `LIMIT`, `OFFSET`, and `ORDER BY` in `db.js` for all major entities. Frontend updated with `Pagination` component.
- **Delete Confirmations:** Custom `ConfirmDialog` modal replaces browser `confirm()` for all destructive actions.
- **Loading Skeletons:** `Skeleton` component implemented and used across all main pages for smooth perceived performance.
- **Input Formatting:** `formatters.js` utility added for consistent currency and phone number display.
- **Auto-Updater:** `electron-updater` integrated into `main.js` with UI indicators in `TopBar`.

---

## ⏳ Pending / In-Progress

### 1. Performance & Scale
- **React Query Migration:** While IPC is standardized, moving to `TanStack Query` would improve caching and reduce redundant DB hits.

### 2. User Experience (UX) Refinement
- **Input Masks:** Add active masks for phone numbers and formatted currency inputs during typing (currently only formatted on display).

### 3. Deployment & Production (Phase 7)
- **Installer Signing:** Code signing for the Windows `.exe` to avoid "Unknown Publisher" warnings (requires developer certificate).
- **User Documentation:** Basic PDF or "Help" screen for end-users.

### 4. Future Features (v2.0)
- **GST Support:** Simple tax calculation fields.
- **Automated Testing:** Implement Vitest for DB logic and Playwright for Electron E2E flows.

### 5. Identified Code Issues & Refinements
- **Bi-directional Rate Recalculation:** In `NewSale.jsx` and `StockPurchase.jsx`, the rate is auto-calculated only if the rate field is empty or zero. If the user subsequently adjusts the weight or total amount, the rate does not dynamically re-calculate, leading to validation warnings unless cleared manually.
- **Code Duplication in Rounding Logic:** The `applyRounding` utility function and its helper `getModulus` are duplicated in both `CustomerDetail.jsx` and `Ledger.jsx`. This should be unified in `src/lib/formatters.js` or a common library file.
- **Unrounded Database Totals vs. Rounded UI Totals:** Rounding rules are applied client-side at render time. While this keeps raw database transactions clean, the SQLite database totals differ from what the user sees on the UI screens, which could lead to reporting discrepancies if raw database audits are performed.
