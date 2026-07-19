const { ipcMain, dialog, BrowserWindow } = require('electron')
const fs = require('fs')
const path = require('path')
const db = require('./db')
const sync = require('./sync')
const XLSX = require('xlsx')

// Helper to standardize IPC responses
const wrap = (fn) => async (event, ...args) => {
  try {
    const data = await fn(event, ...args)
    return { success: true, data }
  } catch (err) {
    console.error(`IPC Handler Error:`, err)
    return { success: false, error: err.message }
  }
}

function registerIpcHandlers() {
  // ── Customers ──────────────────────────────────────────────────
  ipcMain.handle('customers:list', wrap((_e, args) => db.getCustomers(args)))
  ipcMain.handle('customers:count', wrap((_e, search) => db.getCustomersCount(search)))
  ipcMain.handle('customers:get', wrap((_e, id) => db.getCustomer(id)))
  ipcMain.handle('customers:add', wrap((_e, data) => db.addCustomer(data)))
  ipcMain.handle('customers:update', wrap((_e, id, data) => db.updateCustomer(id, data)))
  ipcMain.handle('customers:delete', wrap((_e, id) => db.deleteCustomer(id)))
  ipcMain.handle('customers:search', wrap((_e, query, args) => db.searchCustomers(query, args)))

  // ── Products ───────────────────────────────────────────────────
  ipcMain.handle('products:list', wrap((_e, args) => db.getProducts(args)))
  ipcMain.handle('products:count', wrap(() => db.getProductsCount()))
  ipcMain.handle('products:get', wrap((_e, id) => db.getProduct(id)))
  ipcMain.handle('products:add', wrap((_e, data) => db.addProduct(data)))
  ipcMain.handle('products:update', wrap((_e, id, data) => db.updateProduct(id, data)))
  ipcMain.handle('products:adjust-stock', wrap((_e, id, newStock) => db.adjustProductStock(id, newStock)))
  ipcMain.handle('products:low-stock', wrap(() => db.getLowStockProducts()))

  // ── Stock Purchases ────────────────────────────────────────────
  ipcMain.handle('stock-purchases:list', wrap((_e, args) => db.getStockPurchases(args)))
  ipcMain.handle('stock-purchases:count', wrap((_e, args) => db.getStockPurchasesCount(args)))
  ipcMain.handle('stock-purchases:get', wrap((_e, id) => db.getStockPurchase(id)))
  ipcMain.handle('stock-purchases:add', wrap((_e, data) => db.addStockPurchase(data)))
  ipcMain.handle('stock-purchases:delete', wrap((_e, id) => db.deleteStockPurchase(id)))
  ipcMain.handle('stock-purchases:suggestions', wrap(() => db.getStockPurchaseSuggestions()))

  // ── Sales ──────────────────────────────────────────────────────
  ipcMain.handle('sales:list', wrap((_e, args) => db.getSales(args)))
  ipcMain.handle('sales:count', wrap((_e, args) => db.getSalesCount(args)))
  ipcMain.handle('sales:get', wrap((_e, id) => db.getSale(id)))
  ipcMain.handle('sales:add', wrap((_e, data) => db.addSale(data)))
  ipcMain.handle('sales:delete', wrap((_e, id) => db.deleteSale(id)))
  ipcMain.handle('sales:update', wrap((_e, id, data) => db.updateSale(id, data)))

  // ── Payments ───────────────────────────────────────────────────
  ipcMain.handle('payments:list', wrap((_e, args) => db.getPayments(args)))
  ipcMain.handle('payments:count', wrap((_e, args) => db.getPaymentsCount(args)))
  ipcMain.handle('payments:by-customer', wrap((_e, customerId) => db.getPaymentsByCustomer(customerId)))
  ipcMain.handle('payments:add', wrap((_e, data) => db.addPayment(data)))
  ipcMain.handle('payments:delete', wrap((_e, id) => db.deletePayment(id)))

  // ── Ledger ─────────────────────────────────────────────────────
  ipcMain.handle('ledger:list', wrap((_e, args) => db.getLedgerEntries(args)))
  ipcMain.handle('ledger:count', wrap((_e, args) => db.getLedgerCount(args)))
  ipcMain.handle('ledger:summary', wrap((_e, args) => db.getLedgerSummary(args)))

  // ── Other Expenses ─────────────────────────────────────────────
  ipcMain.handle('other-expenses:list', wrap((_e, args) => db.getOtherExpenses(args)))
  ipcMain.handle('other-expenses:count', wrap((_e, args) => db.getOtherExpensesCount(args)))
  ipcMain.handle('other-expenses:add', wrap((_e, data) => db.addOtherExpense(data)))
  ipcMain.handle('other-expenses:update', wrap((_e, { id, ...data }) => db.updateOtherExpense(id, data)))
  ipcMain.handle('other-expenses:delete', wrap((_e, id) => db.deleteOtherExpense(id)))

  // ── Expense Categories ─────────────────────────────────────────
  ipcMain.handle('expense-categories:list', wrap(() => db.getExpenseCategories()))
  ipcMain.handle('expense-categories:add', wrap((_e, data) => db.addExpenseCategory(data)))
  ipcMain.handle('expense-categories:update', wrap((_e, { id, ...data }) => db.updateExpenseCategory(id, data)))
  ipcMain.handle('expense-categories:delete', wrap((_e, id) => db.deleteExpenseCategory(id)))

  // ── Tmp Records ────────────────────────────────────────────────
  ipcMain.handle('tmp-records:list', wrap((_e, args) => db.getTmpRecords(args)))
  ipcMain.handle('tmp-records:count', wrap((_e, args) => db.getTmpRecordsCount(args)))
  ipcMain.handle('tmp-records:delete', wrap((_e, id) => db.deleteTmpRecord(id)))

  // ── Bulk Drafts ───────────────────────────────────────────────
  ipcMain.handle('bulk-drafts:list', wrap((_e, type) => db.getBulkDrafts(type)))
  ipcMain.handle('bulk-drafts:get', wrap((_e, id) => db.getBulkDraft(id)))
  ipcMain.handle('bulk-drafts:save', wrap((_e, data) => {
    if (data.id) {
      const existing = db.getBulkDraft(data.id)
      if (existing) {
        return db.updateBulkDraft(data.id, data)
      }
    }
    return db.addBulkDraft(data)
  }))
  ipcMain.handle('bulk-drafts:delete', wrap((_e, id) => db.deleteBulkDraft(id)))

  // ── Drivers ──────────────────────────────────────────────────────
  ipcMain.handle('drivers:list', wrap(() => db.getDrivers()))
  ipcMain.handle('drivers:get', wrap((_e, id) => db.getDriver(id)))
  ipcMain.handle('drivers:add', wrap((_e, data) => db.addDriver(data)))
  ipcMain.handle('drivers:update', wrap((_e, id, data) => db.updateDriver(id, data)))
  ipcMain.handle('drivers:toggle-status', wrap((_e, id) => db.toggleDriverActive(id)))

  // ── Deliveries ───────────────────────────────────────────────────
  ipcMain.handle('deliveries:list', wrap(() => db.getDeliveries()))
  ipcMain.handle('deliveries:get', wrap((_e, id) => db.getDelivery(id)))
  ipcMain.handle('deliveries:add', wrap((_e, data) => db.addDelivery(data)))
  ipcMain.handle('deliveries:update-status', wrap((_e, id, status) => db.updateDeliveryStatus(id, status)))

  // ── Driver Locations ─────────────────────────────────────────────
  ipcMain.handle('drivers:locations', wrap(async () => {
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
  }))

  // ── Reports ────────────────────────────────────────────────────
  ipcMain.handle('reports:sales-range', wrap((_e, startDate, endDate) => db.getSalesInRange(startDate, endDate)))
  ipcMain.handle('reports:top-products', wrap((_e, startDate, endDate) => db.getTopProducts(startDate, endDate)))
  ipcMain.handle('reports:top-customers', wrap((_e, startDate, endDate) => db.getTopCustomers(startDate, endDate)))
  ipcMain.handle('reports:stock-movements', wrap((_e, startDate, endDate) => db.getStockMovements(startDate, endDate)))
  ipcMain.handle('reports:inventory-value', wrap(() => db.getInventoryValue()))

  // ── Balance ────────────────────────────────────────────────────
  ipcMain.handle('customers:recalculate-balance', wrap((_e, customerId) => db.recalculateBalance(customerId)))

  // ── Sync ───────────────────────────────────────────────────────
  ipcMain.handle('sync:run', wrap(() => sync.runSyncCycle()))

  // ── Sync Config ────────────────────────────────────────────────
  ipcMain.handle('sync:get-config', wrap(() => {
    const syncUrl = db.getMeta('sync_url')
    const syncToken = db.getMeta('sync_token')
    return {
      configured: !!(syncUrl && syncToken),
      syncUrl: syncUrl || null,
    }
  }))

  ipcMain.handle('sync:save-config', wrap((_e, syncKey) => {
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
  }))

  ipcMain.handle('sync:clear-config', wrap(() => {
    sync.stopSync()
    db.setMeta('sync_url', '')
    db.setMeta('sync_token', '')
    return { configured: false }
  }))

  ipcMain.handle('db:clear', wrap(() => {
    sync.stopSync()
    db.clearDatabase()
    return true
  }))

  // ── Meta / Settings ────────────────────────────────────────────
  ipcMain.handle('meta:get', wrap((_e, key) => db.getMeta(key)))
  ipcMain.handle('meta:set', wrap((_e, key, value) => db.setMeta(key, value)))

  // ── App / System ───────────────────────────────────────────────
  ipcMain.handle('app:print-to-pdf', wrap(async (event, filename) => {
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
  }))

  ipcMain.handle('app:export-excel', wrap(async (event, filename, headers, data) => {
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
  }))
}

module.exports = { registerIpcHandlers }
