const { getDatabase, getMeta, setMeta } = require('./db')
const { BrowserWindow } = require('electron')

const SYNC_INTERVAL_MS = 5 * 60 * 1000 // 5 minutes

let isSyncing = false
let syncTimeout

async function startSync() {
  runSyncCycle()
}

async function runSyncCycle() {
  if (isSyncing) return
  isSyncing = true
  notifyRenderer({ status: 'syncing' })

  try {
    const db = getDatabase()
    const lastSync = getMeta('last_sync_time') || '1970-01-01 00:00:00'
    const workerUrl = getMeta('worker_url')
    const secret = getMeta('sync_token')

    if (!workerUrl || !secret) {
      throw new Error('Sync configuration missing (Worker URL or Token)')
    }

    // ── 1. PULL ──────────────────────────────────────────────────
    const pullResponse = await fetch(`${workerUrl}/pull?since=${encodeURIComponent(lastSync)}`, {
      headers: { 'Authorization': `Bearer ${secret}` }
    })

    if (!pullResponse.ok) throw new Error(`Pull failed: ${pullResponse.statusText}`)
    
    const remoteData = await pullResponse.json()
    const tables = ['customers', 'products', 'stock_purchases', 'sales', 'sale_items', 'payments']

    db.transaction(() => {
      for (const table of tables) {
        const rows = remoteData[table] || []
        for (const row of rows) {
          const columns = Object.keys(row)
          const placeholders = columns.map(() => '?').join(', ')
          const updates = columns.map(c => `${c} = EXCLUDED.${c}`).join(', ')
          
          db.prepare(`
            INSERT INTO ${table} (${columns.join(', ')})
            VALUES (${placeholders})
            ON CONFLICT(id) DO UPDATE SET ${updates}
            WHERE EXCLUDED.updated_at > ${table}.updated_at
          `).run(...columns.map(c => row[c]))
        }
      }
    })()

    // ── 2. PUSH ──────────────────────────────────────────────────
    const pushData = {}
    for (const table of tables) {
      pushData[table] = db.prepare(`SELECT * FROM ${table} WHERE synced = 0`).all()
    }

    const hasLocalChanges = Object.values(pushData).some(rows => rows.length > 0)
    
    if (hasLocalChanges) {
      const pushResponse = await fetch(`${workerUrl}/push`, {
        method: 'POST',
        headers: { 
          'Authorization': `Bearer ${secret}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(pushData)
      })

      if (!pushResponse.ok) throw new Error(`Push failed: ${pushResponse.statusText}`)

      // Mark as synced
      db.transaction(() => {
        for (const table of tables) {
          db.prepare(`UPDATE ${table} SET synced = 1 WHERE synced = 0`).run()
        }
      })()
    }

    const now = new Date().toISOString().replace('T', ' ').slice(0, 19)
    setMeta('last_sync_time', now)
    notifyRenderer({ status: 'online', lastSync: now })

  } catch (error) {
    console.error('Sync Error:', error.message)
    notifyRenderer({ status: 'error', error: error.message })
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

module.exports = { startSync, runSyncCycle }
