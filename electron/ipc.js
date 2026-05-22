const { ipcMain, dialog, BrowserWindow } = require('electron')
const fs = require('fs')
const path = require('path')
const db = require('./db')

function registerIpcHandlers() {
  // ── Customers ──────────────────────────────────────────────────
  ipcMain.handle('customers:list', () => db.getCustomers())
  ipcMain.handle('customers:get', (_e, id) => db.getCustomer(id))
  ipcMain.handle('customers:add', (_e, data) => db.addCustomer(data))
  ipcMain.handle('customers:update', (_e, id, data) => db.updateCustomer(id, data))
  ipcMain.handle('customers:search', (_e, query) => db.searchCustomers(query))

  // ── Products ───────────────────────────────────────────────────
  ipcMain.handle('products:list', () => db.getProducts())
  ipcMain.handle('products:get', (_e, id) => db.getProduct(id))
  ipcMain.handle('products:add', (_e, data) => db.addProduct(data))
  ipcMain.handle('products:update', (_e, id, data) => db.updateProduct(id, data))
  ipcMain.handle('products:low-stock', () => db.getLowStockProducts())

  // ── Stock Purchases ────────────────────────────────────────────
  ipcMain.handle('stock-purchases:list', () => db.getStockPurchases())
  ipcMain.handle('stock-purchases:get', (_e, id) => db.getStockPurchase(id))
  ipcMain.handle('stock-purchases:add', (_e, data) => db.addStockPurchase(data))

  // ── Sales ──────────────────────────────────────────────────────
  ipcMain.handle('sales:list', () => db.getSales())
  ipcMain.handle('sales:get', (_e, id) => db.getSale(id))
  ipcMain.handle('sales:add', (_e, data) => db.addSale(data))
  ipcMain.handle('sales:delete', (_e, id) => db.deleteSale(id))

  // ── Payments ───────────────────────────────────────────────────
  ipcMain.handle('payments:list', () => db.getPayments())
  ipcMain.handle('payments:by-customer', (_e, customerId) => db.getPaymentsByCustomer(customerId))
  ipcMain.handle('payments:add', (_e, data) => db.addPayment(data))
  ipcMain.handle('payments:delete', (_e, id) => db.deletePayment(id))

  // ── Reports ────────────────────────────────────────────────────
  ipcMain.handle('reports:sales-range', (_e, startDate, endDate) => db.getSalesInRange(startDate, endDate))
  ipcMain.handle('reports:top-products', (_e, startDate, endDate) => db.getTopProducts(startDate, endDate))
  ipcMain.handle('reports:top-customers', (_e, startDate, endDate) => db.getTopCustomers(startDate, endDate))
  ipcMain.handle('reports:stock-movements', (_e, startDate, endDate) => db.getStockMovements(startDate, endDate))
  ipcMain.handle('reports:inventory-value', () => db.getInventoryValue())

  // ── Balance ────────────────────────────────────────────────────
  ipcMain.handle('customers:recalculate-balance', (_e, customerId) => db.recalculateBalance(customerId))

  // ── App / System ───────────────────────────────────────────────
  ipcMain.handle('app:print-to-pdf', async (event, filename) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    try {
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
    } catch (error) {
      console.error('Failed to print to PDF:', error)
      return false
    }
    return false
  })
}

module.exports = { registerIpcHandlers }
