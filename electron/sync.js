const { getDatabase, getMeta, setMeta, recalculateBalance } = require('./db')
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
    const lastDeliverySync = getMeta('last_delivery_sync_time') || '1970-01-01 00:00:00'
    const workerUrl = getMeta('sync_url')
    const secret = getMeta('sync_token')

    if (!workerUrl || !secret) {
      notifyRenderer({ status: 'not-configured' })
      return
    }

    // ── 1. PULL ──────────────────────────────────────────────────
    const pullResponse = await fetchWithTimeout(`${workerUrl}/pull?since=${encodeURIComponent(lastSync)}&v=2`, {
      headers: { 'Authorization': `Bearer ${secret}` }
    })

    if (!pullResponse.ok) throw new Error(`Pull failed: ${pullResponse.statusText}`)
    
    const remoteData = await pullResponse.json()

    try {
      const pullDeliveryResponse = await fetchWithTimeout(`${workerUrl}/pull/delivery?since=${encodeURIComponent(lastDeliverySync)}`, {
        headers: { 'Authorization': `Bearer ${secret}` }
      })
      if (pullDeliveryResponse.ok) {
        const deliveryData = await pullDeliveryResponse.json()
        Object.assign(remoteData, deliveryData)
      }
    } catch (e) {
      console.warn('Delivery pull failed, skipping delivery sync this cycle', e)
    }

    // Sync remote rounding rules settings
    if (remoteData && remoteData._settings) {
      const { 
        rounding_rules: remoteRules, rounding_rules_updated_at: remoteRulesTime,
        carried_forward_data: remoteCf, carried_forward_updated_at: remoteCfTime
      } = remoteData._settings
      
      if (remoteRules && remoteRulesTime) {
        const localRulesTime = getMeta('rounding_rules_updated_at')
        if (!localRulesTime || new Date(remoteRulesTime) > new Date(localRulesTime)) {
          setMeta('rounding_rules', remoteRules)
          setMeta('rounding_rules_updated_at', remoteRulesTime)
        }
      }
      
      if (remoteCf && remoteCfTime) {
        const localCfTime = getMeta('carried_forward_updated_at')
        if (!localCfTime || new Date(remoteCfTime) > new Date(localCfTime)) {
          const cfMap = JSON.parse(remoteCf)
          // We must update the DB here, but avoid triggering 'synced = 0' for customers so we don't push right back.
          // Since the pull step happens BEFORE push, we can just update carried_forward and the push step won't mind.
          db.transaction(() => {
            const updateCfStmt = db.prepare('UPDATE customers SET carried_forward = ? WHERE id = ?')
            for (const [idStr, cfVal] of Object.entries(cfMap)) {
              updateCfStmt.run(cfVal, Number(idStr))
            }
          })()
          
          // Trigger balance recalculation for affected customers
          for (const idStr of Object.keys(cfMap)) {
            recalculateBalance(Number(idStr))
          }
          setMeta('carried_forward_updated_at', remoteCfTime)
        }
      }
    }

    const coreTables = ['customers', 'products', 'stock_purchases', 'sales', 'sale_items', 'payments', 'other_expenses', 'expense_categories', 'tmp_records', 'bulk_drafts']
    const deliveryTables = ['drivers', 'deliveries', 'delivery_items']
    const tables = [...coreTables, ...deliveryTables]

    db.pragma('foreign_keys = OFF')
    try {
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
              const updateStmt = db.prepare(`UPDATE ${table} SET synced = 1 WHERE id = ?`)
              for (const id of ids) {
                updateStmt.run(id)
              }
            }
          }
        }
      })()
    } finally {
      db.pragma('foreign_keys = ON')
    }

    // ── 2. PUSH ──────────────────────────────────────────────────
    const pushData = {}
    const pushedIds = {}
    for (const table of tables) {
      const rows = db.prepare(`SELECT * FROM ${table} WHERE synced = 0`).all()
      if (table === 'customers') {
        pushData[table] = rows.map(({ carried_forward, ...rest }) => rest)
      } else {
        pushData[table] = rows
      }
      pushedIds[table] = rows.map(r => r.id)
    }

    const pendingDeletes = db.prepare('SELECT * FROM deleted_log WHERE synced = 0').all()
    const pendingDeleteIds = pendingDeletes.map(r => r.id)

    // Build carried forward data to push
    const cfRows = db.prepare('SELECT id, carried_forward, updated_at FROM customers').all()
    const cfMap = {}
    let maxCfTime = '1970-01-01T00:00:00Z'
    cfRows.forEach(r => {
      cfMap[r.id] = r.carried_forward
      if (new Date(r.updated_at) > new Date(maxCfTime)) maxCfTime = r.updated_at
    })
    const localCfData = JSON.stringify(cfMap)
    
    // We update local CF time if it's behind the max customer update time
    let localCfTime = getMeta('carried_forward_updated_at')
    if (!localCfTime || new Date(maxCfTime) > new Date(localCfTime)) {
       localCfTime = maxCfTime
       setMeta('carried_forward_updated_at', localCfTime)
    }

    const hasLocalChanges = Object.values(pushData).some(rows => rows.length > 0) || pendingDeletes.length > 0

    // Sync local rounding rules settings
    const localRules = getMeta('rounding_rules')
    const localRulesTime = getMeta('rounding_rules_updated_at')
    const hasSettingsChanges = localRulesTime && new Date(localRulesTime) > new Date(lastSync)
    const hasCfChanges = localCfTime && new Date(localCfTime) > new Date(lastSync)

    const shouldPush = hasLocalChanges || hasSettingsChanges || hasCfChanges

    if (shouldPush) {
      const settingsPayload = {}
      if (localRules && localRulesTime) {
        settingsPayload.rounding_rules = localRules
        settingsPayload.rounding_rules_updated_at = localRulesTime
      }
      if (localCfData && localCfTime) {
        settingsPayload.carried_forward_data = localCfData
        settingsPayload.carried_forward_updated_at = localCfTime
      }

      // Split pushData into core and delivery
      const corePushData = {}
      for (const t of coreTables) if (pushData[t] && pushData[t].length > 0) corePushData[t] = pushData[t]
      
      const deliveryPushData = {}
      for (const t of deliveryTables) if (pushData[t] && pushData[t].length > 0) deliveryPushData[t] = pushData[t]

      const hasCorePush = Object.keys(corePushData).length > 0 || pendingDeletes.length > 0 || Object.keys(settingsPayload).length > 0
      if (hasCorePush) {
        const pushResponse = await fetchWithTimeout(`${workerUrl}/push`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${secret}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ ...corePushData, _deletes: pendingDeletes, _settings: Object.keys(settingsPayload).length > 0 ? settingsPayload : null })
        })
        if (!pushResponse.ok) throw new Error(`Push failed: ${pushResponse.statusText}`)
      }

      const hasDeliveryPush = Object.keys(deliveryPushData).length > 0
      if (hasDeliveryPush) {
        const deliveryPushResponse = await fetchWithTimeout(`${workerUrl}/push/delivery`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${secret}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(deliveryPushData)
        })
        if (!deliveryPushResponse.ok) throw new Error(`Delivery Push failed: ${deliveryPushResponse.statusText}`)
      }

      db.transaction(() => {
        for (const table of tables) {
          const ids = pushedIds[table]
          if (ids && ids.length > 0) {
            const updateStmt = db.prepare(`UPDATE ${table} SET synced = 1 WHERE id = ?`)
            for (const id of ids) {
              updateStmt.run(id)
            }
          }
        }
        if (pendingDeleteIds.length > 0) {
          const updateStmt = db.prepare(`UPDATE deleted_log SET synced = 1 WHERE id = ?`)
          for (const id of pendingDeleteIds) {
            updateStmt.run(id)
          }
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
    setMeta('last_delivery_sync_time', now)
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

