const { getDatabase, getMeta, setMeta } = require('./db')
const { BrowserWindow } = require('electron')

const SYNC_INTERVAL_MS = 5 * 60 * 1000 // 5 minutes
const FETCH_TIMEOUT_MS = 10000 // 10 seconds

let isSyncing = false
let syncTimeout

async function startSync() {
  runSyncCycle()
}

function stopSync() {
  if (syncTimeout) {
    clearTimeout(syncTimeout)
    syncTimeout = null
  }
}

function fetchWithTimeout(url, options = {}, timeout = FETCH_TIMEOUT_MS) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeout)
  return fetch(url, { ...options, signal: controller.signal })
    .finally(() => clearTimeout(timer))
}

async function runSyncCycle() {
  if (isSyncing) {
    notifyRenderer({ status: 'error', error: 'Sync already in progress — click again after it finishes' })
    return
  }
  isSyncing = true
  notifyRenderer({ status: 'syncing' })

  try {
    const db = getDatabase()
    const lastSync = getMeta('last_sync_time') || '1970-01-01 00:00:00'
    const workerUrl = getMeta('sync_url')
    const secret = getMeta('sync_token')

    if (!workerUrl || !secret) {
      notifyRenderer({ status: 'not-configured' })
      return
    }

    // ── 1. PULL ──────────────────────────────────────────────────
    const pullResponse = await fetchWithTimeout(`${workerUrl}/pull?since=${encodeURIComponent(lastSync)}`, {
      headers: { 'Authorization': `Bearer ${secret}` }
    })

    if (!pullResponse.ok) throw new Error(`Pull failed: ${pullResponse.statusText}`)
    
    const remoteData = await pullResponse.json()

    // Sync remote rounding rules settings
    if (remoteData && remoteData._settings) {
      const { rounding_rules: remoteRules, rounding_rules_updated_at: remoteRulesTime } = remoteData._settings
      if (remoteRules && remoteRulesTime) {
        const localRulesTime = getMeta('rounding_rules_updated_at')
        if (!localRulesTime || new Date(remoteRulesTime) > new Date(localRulesTime)) {
          setMeta('rounding_rules', remoteRules)
          setMeta('rounding_rules_updated_at', remoteRulesTime)
        }
      }
    }

    const tables = ['customers', 'products', 'stock_purchases', 'sales', 'sale_items', 'payments', 'other_expenses', 'tmp_records']

    db.transaction(() => {
      for (const table of tables) {
        const rows = remoteData[table] || []
        for (const row of rows) {
          // Exclude 'synced' — it's a local-only tracking field
          const columns = Object.keys(row).filter(k => k !== 'synced')
          const placeholders = columns.map(() => '?').join(', ')
          const updates = columns.map(c => `${c} = EXCLUDED.${c}`).join(', ')
          
          db.prepare(`
            INSERT INTO ${table} (${columns.join(', ')})
            VALUES (${placeholders})
            ON CONFLICT(id) DO UPDATE SET ${updates}
            WHERE EXCLUDED.updated_at > ${table}.updated_at
          `).run(...columns.map(c => row[c]))
        }
        // Mark pulled records as synced so they aren't re-pushed
        if (rows.length > 0) {
          const ids = rows.map(r => r.id).filter(id => id != null)
          if (ids.length > 0) {
            const placeholders = ids.map(() => '?').join(', ')
            db.prepare(`UPDATE ${table} SET synced = 1 WHERE id IN (${placeholders})`).run(...ids)
          }
        }
      }
    })()

    // ── 2. PUSH ──────────────────────────────────────────────────
    const pushData = {}
    const pushedIds = {}
    for (const table of tables) {
      const rows = db.prepare(`SELECT * FROM ${table} WHERE synced = 0`).all()
      pushData[table] = rows
      pushedIds[table] = rows.map(r => r.id)
    }

    const pendingDeletes = db.prepare('SELECT * FROM deleted_log WHERE synced = 0').all()
    const pendingDeleteIds = pendingDeletes.map(r => r.id)

    const hasLocalChanges = Object.values(pushData).some(rows => rows.length > 0) || pendingDeletes.length > 0

    // Sync local rounding rules settings
    const localRules = getMeta('rounding_rules')
    const localRulesTime = getMeta('rounding_rules_updated_at')
    const hasSettingsChanges = localRulesTime && new Date(localRulesTime) > new Date(lastSync)

    const shouldPush = hasLocalChanges || hasSettingsChanges

    if (shouldPush) {
      const settingsPayload = (localRules && localRulesTime) ? {
        rounding_rules: localRules,
        rounding_rules_updated_at: localRulesTime
      } : null

      const pushResponse = await fetchWithTimeout(`${workerUrl}/push`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${secret}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ ...pushData, _deletes: pendingDeletes, _settings: settingsPayload })
      })

      if (!pushResponse.ok) throw new Error(`Push failed: ${pushResponse.statusText}`)

      db.transaction(() => {
        for (const table of tables) {
          const ids = pushedIds[table]
          if (ids.length > 0) {
            const placeholders = ids.map(() => '?').join(', ')
            db.prepare(`UPDATE ${table} SET synced = 1 WHERE id IN (${placeholders})`).run(...ids)
          }
        }
        if (pendingDeleteIds.length > 0) {
          const placeholders = pendingDeleteIds.map(() => '?').join(', ')
          db.prepare(`UPDATE deleted_log SET synced = 1 WHERE id IN (${placeholders})`).run(...pendingDeleteIds)
        }
      })()
    }

    // Cleanup expired tmp_records from local SQLite
    try {
      db.prepare("DELETE FROM tmp_records WHERE date < date('now', '-15 days')").run()
    } catch (e) {
      console.error('tmp_records cleanup error:', e)
    }

    const now = new Date().toISOString().replace('T', ' ').slice(0, 19)
    setMeta('last_sync_time', now)
    notifyRenderer({ status: 'online', lastSync: now })

  } catch (error) {
    if (error.name === 'AbortError') {
      console.error('Sync Error: Request timed out')
      notifyRenderer({ status: 'error', error: 'Sync timed out — check your network or Worker URL' })
    } else {
      console.error('Sync Error:', error.message)
      notifyRenderer({ status: 'error', error: error.message })
    }
  } finally {
    isSyncing = false
    syncTimeout = setTimeout(runSyncCycle, SYNC_INTERVAL_MS)
  }
}

function notifyRenderer(data) {
  const wins = BrowserWindow.getAllWindows()
  for (const win of wins) {
    win.webContents.send('sync:status', data)
  }
}

module.exports = { startSync, stopSync, runSyncCycle }

