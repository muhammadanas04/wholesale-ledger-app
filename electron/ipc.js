const { ipcMain, dialog, BrowserWindow } = require('electron')
const fs = require('fs')
const path = require('path')
const db = require('./db')
const sync = require('./sync')

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
  ipcMain.handle('customers:list', wrap(() => db.getCustomers()))
  ipcMain.handle('customers:get', wrap((_e, id) => db.getCustomer(id)))
  ipcMain.handle('customers:add', wrap((_e, data) => db.addCustomer(data)))
  ipcMain.handle('customers:update', wrap((_e, id, data) => db.updateCustomer(id, data)))
  ipcMain.handle('customers:search', wrap((_e, query) => db.searchCustomers(query)))

  // ── Products ───────────────────────────────────────────────────
  ipcMain.handle('products:list', wrap(() => db.getProducts()))
  ipcMain.handle('products:get', wrap((_e, id) => db.getProduct(id)))
  ipcMain.handle('products:add', wrap((_e, data) => db.addProduct(data)))
  ipcMain.handle('products:update', wrap((_e, id, data) => db.updateProduct(id, data)))
  ipcMain.handle('products:low-stock', wrap(() => db.getLowStockProducts()))

  // ── Stock Purchases ────────────────────────────────────────────
  ipcMain.handle('stock-purchases:list', wrap(() => db.getStockPurchases()))
  ipcMain.handle('stock-purchases:get', wrap((_e, id) => db.getStockPurchase(id)))
  ipcMain.handle('stock-purchases:add', wrap((_e, data) => db.addStockPurchase(data)))

  // ── Sales ──────────────────────────────────────────────────────
  ipcMain.handle('sales:list', wrap(() => db.getSales()))
  ipcMain.handle('sales:get', wrap((_e, id) => db.getSale(id)))
  ipcMain.handle('sales:add', wrap((_e, data) => db.addSale(data)))
  ipcMain.handle('sales:delete', wrap((_e, id) => db.deleteSale(id)))

  // ── Payments ───────────────────────────────────────────────────
  ipcMain.handle('payments:list', wrap(() => db.getPayments()))
  ipcMain.handle('payments:by-customer', wrap((_e, customerId) => db.getPaymentsByCustomer(customerId)))
  ipcMain.handle('payments:add', wrap((_e, data) => db.addPayment(data)))
  ipcMain.handle('payments:delete', wrap((_e, id) => db.deletePayment(id)))

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
}

module.exports = { registerIpcHandlers }
