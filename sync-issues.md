# Sync Bug Report — Wholesale Ledger App

## Context

- **Files in scope:** `electron/db.js`, `electron/sync.js`, `cloudflare/worker.js`
- **Feature:** Offline-first bidirectional sync between local SQLite (`better-sqlite3`) and Cloudflare D1 via a Cloudflare Worker REST API (`POST /push`, `GET /pull`).
- **Sync mechanism:** Every table has `synced INTEGER DEFAULT 0` and `updated_at TEXT`. Push sends `WHERE synced = 0`; pull fetches `WHERE updated_at > last_sync_time`. Conflict resolution is last-write-wins on `updated_at`.

---

## Issue 1 — Deleted rows resurrect after sync

### Severity
Critical

### Files
- `electron/db.js` — `deleteSale()`, `deletePayment()`
- `electron/sync.js` — push block
- `cloudflare/worker.js` — `POST /push` handler

### Description
`deleteSale()` and `deletePayment()` perform hard deletes (`DELETE FROM ...`) on local SQLite. The sync push only collects rows where `synced = 0` — it has no mechanism to communicate deletions to the cloud. The Cloudflare D1 database retains the deleted row. On the next pull cycle, the worker returns the row (it still exists in D1 and its `updated_at` is newer than the last sync on a fresh machine), and `sync.js` upserts it back into local SQLite. The deleted record is resurrected.

In a two-machine setup this means: Machine A deletes a sale → syncs → Machine B pulls → sale reappears on Machine B → Machine B pushes it back → sale reappears on Machine A on next pull.

### Root Cause
No deletion log exists. The sync layer only tracks dirty rows (`synced = 0`), not absent rows.

### Fix
1. Add a `deleted_log` table to the SQLite schema and to the Cloudflare D1 schema:
   ```sql
   CREATE TABLE IF NOT EXISTS deleted_log (
     id INTEGER PRIMARY KEY AUTOINCREMENT,
     table_name TEXT NOT NULL,
     row_id INTEGER NOT NULL,
     deleted_at TEXT DEFAULT (datetime('now')),
     synced INTEGER DEFAULT 0
   );
   ```
2. In `deleteSale()`, inside the existing transaction, after deleting `sale_items` and `sales`, insert one row into `deleted_log` per deleted record:
   ```js
   const logDelete = db.prepare(`INSERT INTO deleted_log (table_name, row_id) VALUES (?, ?)`)
   // inside transaction:
   for (const item of sale.items) {
     logDelete.run('sale_items', item.id)
   }
   logDelete.run('sales', id)
   ```
3. Apply the same pattern in `deletePayment()`:
   ```js
   db.prepare(`INSERT INTO deleted_log (table_name, row_id) VALUES (?, ?)`).run('payments', id)
   ```
4. In `sync.js`, collect pending deletions before the push fetch:
   ```js
   const pendingDeletes = db.prepare(`SELECT * FROM deleted_log WHERE synced = 0`).all()
   ```
   Include them in the push body as `_deletes`:
   ```js
   body: JSON.stringify({ ...pushData, _deletes: pendingDeletes })
   ```
   After a confirmed successful push, mark them synced by ID (see Issue 2 for why ID-scoped updates matter).
5. In `worker.js`, handle `_deletes` in the `POST /push` handler after upserting rows:
   ```js
   const deletes = data._deletes || []
   for (const entry of deletes) {
     const { table_name, row_id } = entry
     if (!tables.includes(table_name)) continue // safety guard
     await env.DB.prepare(`DELETE FROM ${table_name} WHERE id = ?`).bind(row_id).run()
   }
   ```

---

## Issue 2 — Rows written during push are permanently lost

### Severity
Critical

### File
- `electron/sync.js` — push block, mark-synced block

### Description
The push block collects unsynced rows, sends them to the worker, then marks all currently-unsynced rows as synced:

```js
// current code (buggy)
const pushData = {}
for (const table of tables) {
  pushData[table] = db.prepare(`SELECT * FROM ${table} WHERE synced = 0`).all()
}
// ... await fetch(push) ...
db.transaction(() => {
  for (const table of tables) {
    db.prepare(`UPDATE ${table} SET synced = 1 WHERE synced = 0`).run() // ← blanket update
  }
})()
```

There is a race window between when `pushData` is collected and when the `UPDATE synced = 1` runs. Any row inserted by the user during this window (e.g. a new sale recorded while the push fetch is in flight) will be marked `synced = 1` without ever having been included in the push payload. That row will never be pushed again.

### Root Cause
The mark-synced query uses `WHERE synced = 0` instead of `WHERE id IN (ids that were actually pushed)`.

### Fix
Capture the IDs of the rows being pushed before the fetch, then scope the update to only those IDs:

```js
const pushData = {}
const pushedIds = {}
for (const table of tables) {
  const rows = db.prepare(`SELECT * FROM ${table} WHERE synced = 0`).all()
  pushData[table] = rows
  pushedIds[table] = rows.map(r => r.id)
}

// ... await fetch(push) — only after confirmed ok: ...

db.transaction(() => {
  for (const table of tables) {
    const ids = pushedIds[table]
    if (ids.length > 0) {
      const placeholders = ids.map(() => '?').join(', ')
      db.prepare(`UPDATE ${table} SET synced = 1 WHERE id IN (${placeholders})`).run(...ids)
    }
  }
})()
```

Apply the same ID-scoped pattern to `deleted_log` entries (use `pendingDeleteIds` captured before the fetch).

---

## Issue 3 — Worker silently ignores deletions sent by the app

### Severity
Critical (dependent on Issue 1 fix being applied)

### File
- `cloudflare/worker.js` — `POST /push` handler

### Description
Even after the app-side fix from Issue 1 is applied (sending `_deletes` in the push payload), the current worker ignores any keys it does not explicitly iterate. The worker loops over `tables` only:

```js
for (const table of tables) {
  const rows = data[table] || []
  // ...
}
// data._deletes is never read
```

Deletions sent by the app are silently dropped. The resurrection bug from Issue 1 persists even with the app-side fix.

### Root Cause
The worker was written before deletion syncing was designed. It has no handler for `_deletes`.

### Fix
After the upsert loop in the `POST /push` handler, add:

```js
const deletes = data._deletes || []
for (const entry of deletes) {
  const { table_name, row_id } = entry
  if (!tables.includes(table_name)) continue // reject unknown table names
  await env.DB.prepare(`DELETE FROM ${table_name} WHERE id = ?`).bind(row_id).run()
}
```

The `tables.includes(table_name)` guard is required to prevent a malformed or malicious payload from issuing arbitrary DELETE statements against D1.

---

## Summary Table

| # | Issue | Severity | Files | Status |
|---|-------|----------|-------|--------|
| 1 | Deleted rows resurrect after sync — no deletion log | Critical | `db.js`, `sync.js`, `worker.js` | Open |
| 2 | Rows written during push are permanently lost — blanket `synced = 1` update | Critical | `sync.js` | Open |
| 3 | Worker silently ignores `_deletes` in push payload | Critical | `worker.js` | Open |

All three issues must be fixed together. Issues 1 and 3 are a matched pair — the app-side deletion log (Issue 1) is useless without the worker-side handler (Issue 3). Issue 2 is independent but should be fixed in the same `sync.js` edit pass.
