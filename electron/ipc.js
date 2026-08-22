const { ipcMain, dialog, BrowserWindow } = require('electron')
const fs = require('fs')
const path = require('path')
const db = require('./db')
const sync = require('./sync')
const XLSX = require('xlsx')
const { reportError } = require('./error-reporter')

// Helper to standardize IPC responses
const wrap = (fn, handlerName) => async (event, ...args) => {
  try {
    const data = await fn(event, ...args)
    return { success: true, data }
  } catch (err) {
    console.error(`IPC Handler Error (${handlerName}):`, err)
    reportError({ error: err, source: 'ipc', context: handlerName || 'unknown handler' })
    return { success: false, error: err.message }
  }
}

// Auto-naming wrapper: passes the channel name as handlerName
function handle(channel, fn) {
  ipcMain.handle(channel, wrap(fn, channel))
}

function registerIpcHandlers() {
  // ── Customers ──────────────────────────────────────────────────
  handle('customers:list', (_e, args) => db.getCustomers(args))
  handle('customers:count', (_e, search) => db.getCustomersCount(search))
  handle('customers:get', (_e, id) => db.getCustomer(id))
  handle('customers:add', (_e, data) => db.addCustomer(data))
  handle('customers:update', (_e, id, data) => db.updateCustomer(id, data))
  handle('customers:delete', (_e, id) => db.deleteCustomer(id))
  handle('customers:search', (_e, query, args) => db.searchCustomers(query, args))
  handle('customers:report-data', (_e, args) => db.getCustomerReportData(args))
  handle('customers:recalculate-balance', (_e, customerId) => db.recalculateBalance(customerId))

  // ── Customer Reminders ─────────────────────────────────────────
  handle('reminders:get', (_e, customerId) => db.getCustomerReminders(customerId))
  handle('reminders:due', () => db.getDueReminders())
  handle('reminders:add', (_e, data) => db.addCustomerReminder(data))
  handle('reminders:delete', (_e, id) => db.deleteCustomerReminder(id))
  handle('reminders:reset', (_e, id) => db.resetCustomerReminder(id))

  // ── Products ───────────────────────────────────────────────────
  handle('products:list', (_e, args) => db.getProducts(args))
  handle('products:count', () => db.getProductsCount())
  handle('products:get', (_e, id) => db.getProduct(id))
  handle('products:add', (_e, data) => db.addProduct(data))
  handle('products:update', (_e, id, data) => db.updateProduct(id, data))
  handle('products:adjust-stock', (_e, id, newStock) => db.adjustProductStock(id, newStock))
  handle('products:low-stock', () => db.getLowStockProducts())

  // ── Stock Purchases ────────────────────────────────────────────
  handle('stock-purchases:list', (_e, args) => db.getStockPurchases(args))
  handle('stock-purchases:count', (_e, args) => db.getStockPurchasesCount(args))
  handle('stock-purchases:get', (_e, id) => db.getStockPurchase(id))
  handle('stock-purchases:add', (_e, data) => db.addStockPurchase(data))
  handle('stock-purchases:delete', (_e, id) => db.deleteStockPurchase(id))
  handle('stock-purchases:suggestions', () => db.getStockPurchaseSuggestions())

  // ── Sales ──────────────────────────────────────────────────────
  handle('sales:list', (_e, args) => db.getSales(args))
  handle('sales:count', (_e, args) => db.getSalesCount(args))
  handle('sales:get', (_e, id) => db.getSale(id))
  handle('sales:add', (_e, data) => db.addSale(data))
  handle('sales:delete', (_e, id) => db.deleteSale(id))
  handle('sales:update', (_e, id, data) => db.updateSale(id, data))

  // ── Payments ───────────────────────────────────────────────────
  handle('payments:list', (_e, args) => db.getPayments(args))
  handle('payments:count', (_e, args) => db.getPaymentsCount(args))
  handle('payments:by-customer', (_e, customerId) => db.getPaymentsByCustomer(customerId))
  handle('payments:add', (_e, data) => db.addPayment(data))
  handle('payments:delete', (_e, id) => db.deletePayment(id))

  // ── Ledger ─────────────────────────────────────────────────────
  handle('ledger:list', (_e, args) => db.getLedgerEntries(args))
  handle('ledger:count', (_e, args) => db.getLedgerCount(args))
  handle('ledger:summary', (_e, args) => db.getLedgerSummary(args))

  // ── Other Expenses ─────────────────────────────────────────────
  handle('other-expenses:list', (_e, args) => db.getOtherExpenses(args))
  handle('other-expenses:count', (_e, args) => db.getOtherExpensesCount(args))
  handle('other-expenses:add', (_e, data) => db.addOtherExpense(data))
  handle('other-expenses:update', (_e, { id, ...data }) => db.updateOtherExpense(id, data))
  handle('other-expenses:delete', (_e, id) => db.deleteOtherExpense(id))

  // ── Expense Categories ─────────────────────────────────────────
  handle('expense-categories:list', () => db.getExpenseCategories())
  handle('expense-categories:add', (_e, data) => db.addExpenseCategory(data))
  handle('expense-categories:update', (_e, { id, ...data }) => db.updateExpenseCategory(id, data))
  handle('expense-categories:delete', (_e, id) => db.deleteExpenseCategory(id))

  // ── Tmp Records ────────────────────────────────────────────────
  handle('tmp-records:list', (_e, args) => db.getTmpRecords(args))
  handle('tmp-records:count', (_e, args) => db.getTmpRecordsCount(args))
  handle('tmp-records:delete', (_e, id) => db.deleteTmpRecord(id))

  // ── Bulk Drafts ───────────────────────────────────────────────
  handle('bulk-drafts:list', (_e, type) => db.getBulkDrafts(type))
  handle('bulk-drafts:get', (_e, id) => db.getBulkDraft(id))
  handle('bulk-drafts:save', (_e, data) => {
    if (data.id) {
      const existing = db.getBulkDraft(data.id)
      if (existing) {
        return db.updateBulkDraft(data.id, data)
      }
    }
    return db.addBulkDraft(data)
  })
  handle('bulk-drafts:delete', (_e, id) => db.deleteBulkDraft(id))

  // ── Drivers ──────────────────────────────────────────────────────
  handle('drivers:list', () => db.getDrivers())
  handle('drivers:get', (_e, id) => db.getDriver(id))
  handle('drivers:add', (_e, data) => db.addDriver(data))
  handle('drivers:update', (_e, id, data) => db.updateDriver(id, data))
  handle('drivers:toggle-status', (_e, id) => db.toggleDriverActive(id))

  // ── Deliveries ───────────────────────────────────────────────────
  handle('deliveries:list', () => db.getDeliveries())
  handle('deliveries:get', (_e, id) => db.getDelivery(id))
  handle('deliveries:add', (_e, data) => db.addDelivery(data))
  handle('deliveries:update-status', (_e, id, status) => db.updateDeliveryStatus(id, status))

  // ── Driver Locations ─────────────────────────────────────────────
  handle('drivers:locations', async () => {
    const syncUrl = db.getMeta('sync_url')
    const syncToken = db.getMeta('sync_token')
    if (!syncUrl || !syncToken) {
      throw new Error('Sync connection is not configured')
    }
    const cleanUrl = syncUrl.endsWith('/') ? syncUrl.slice(0, -1) : syncUrl
    const url = `${cleanUrl}/driver/locations`

    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${syncToken}`
      }
    })

    if (!response.ok) {
      const text = await response.text()
      throw new Error(text || `Request failed with code ${response.status}`)
    }

    return response.json()
  })

  // ── Reports ────────────────────────────────────────────────────
  handle('reports:sales-range', (_e, startDate, endDate) => db.getSalesInRange(startDate, endDate))
  handle('reports:top-products', (_e, startDate, endDate) => db.getTopProducts(startDate, endDate))
  handle('reports:top-customers', (_e, startDate, endDate) => db.getTopCustomers(startDate, endDate))
  handle('reports:stock-movements', (_e, startDate, endDate) => db.getStockMovements(startDate, endDate))
  handle('reports:inventory-value', () => db.getInventoryValue())

  // ── Sync ───────────────────────────────────────────────────────
  handle('sync:run', () => sync.runSyncCycle())

  // ── Sync Config ────────────────────────────────────────────────
  handle('sync:get-config', () => {
    const syncUrl = db.getMeta('sync_url')
    const syncToken = db.getMeta('sync_token')
    return {
      configured: !!(syncUrl && syncToken),
      syncUrl: syncUrl || null,
    }
  })

  handle('sync:save-config', (_e, syncKey) => {
    // Decode base64 sync key: "url|token"
    let decoded
    try {
      decoded = Buffer.from(syncKey.trim(), 'base64').toString('utf-8')
    } catch {
      throw new Error('Invalid sync key — could not decode')
    }

    const parts = decoded.split('|')
    if (parts.length !== 2 || !parts[0].startsWith('http') || !parts[1]) {
      throw new Error('Invalid sync key format')
    }

    const [syncUrl, syncToken] = parts
    db.setMeta('sync_url', syncUrl.trim())
    db.setMeta('sync_token', syncToken.trim())

    // Start syncing immediately
    sync.startSync()

    return { configured: true, syncUrl: syncUrl.trim() }
  })

  handle('sync:clear-config', () => {
    sync.stopSync()
    db.setMeta('sync_url', '')
    db.setMeta('sync_token', '')
    return { configured: false }
  })

  handle('db:clear', () => {
    sync.stopSync()
    db.clearDatabase()
    return true
  })

  // ── Meta / Settings ────────────────────────────────────────────
  handle('meta:get', (_e, key) => db.getMeta(key))
  handle('meta:set', (_e, key, value) => db.setMeta(key, value))

  // ── App / System ───────────────────────────────────────────────
  handle('app:print-to-pdf', async (event, filename) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    const data = await win.webContents.printToPDF({
      printBackground: true,
      margins: { top: 0, bottom: 0, left: 0, right: 0 },
    })

    const { filePath } = await dialog.showSaveDialog(win, {
      title: 'Save PDF',
      defaultPath: path.join(process.env.HOME || process.env.USERPROFILE, `${filename}.pdf`),
      filters: [{ name: 'PDF Files', extensions: ['pdf'] }],
    })

    if (filePath) {
      fs.writeFileSync(filePath, data)
      return true
    }
    return false
  })

  handle('app:export-excel', async (event, filename, headers, data) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    const { filePath } = await dialog.showSaveDialog(win, {
      title: 'Export Excel',
      defaultPath: path.join(process.env.HOME || process.env.USERPROFILE, `${filename}.xlsx`),
      filters: [{ name: 'Excel Files', extensions: ['xlsx'] }],
    })

    if (filePath) {
      const worksheet = XLSX.utils.aoa_to_sheet([headers, ...data])
      const workbook = XLSX.utils.book_new()
      XLSX.utils.book_append_sheet(workbook, worksheet, 'Sheet1')
      const buf = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' })
      fs.writeFileSync(filePath, buf)
      return true
    }
    return false
  })
}

module.exports = { registerIpcHandlers }
