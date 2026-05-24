const Database = require('better-sqlite3')
const path = require('path')
const { app } = require('electron')

let db

const SCHEMA_VERSION = 1
function initDatabase() {
  const dbPath = path.join(app.getPath('userData'), 'wholesale-ledger.db')
  db = new Database(dbPath)
  db.pragma('journal_mode = WAL')
  db.pragma('foreign_keys = ON')

  migrate()

  // Set defaults for sync if not present
  if (!getMeta('sync_token')) {
    setMeta('sync_token', 'wholesale-sync-token-2026')
  }
  if (!getMeta('worker_url')) {
    setMeta('worker_url', 'https://wholesale-sync.muhammadanas.workers.dev')
  }

  return db
}

function getDatabase() {
  if (!db) throw new Error('Database not initialized')
  return db
}

function migrate() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS _meta (
      key TEXT PRIMARY KEY,
      value TEXT
    );

    CREATE TABLE IF NOT EXISTS customers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      phone TEXT,
      address TEXT,
      balance INTEGER NOT NULL DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now')),
      synced INTEGER DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS products (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      unit TEXT NOT NULL,
      current_stock REAL NOT NULL DEFAULT 0,
      reorder_level REAL NOT NULL DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now')),
      synced INTEGER DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS stock_purchases (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      product_id INTEGER NOT NULL REFERENCES products(id),
      qty REAL NOT NULL,
      cost_price INTEGER NOT NULL,
      supplier TEXT,
      date TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now')),
      synced INTEGER DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS sales (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      customer_id INTEGER NOT NULL REFERENCES customers(id),
      date TEXT NOT NULL,
      total_amount INTEGER NOT NULL,
      notes TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now')),
      synced INTEGER DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS sale_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      sale_id INTEGER NOT NULL REFERENCES sales(id),
      product_id INTEGER NOT NULL REFERENCES products(id),
      qty REAL NOT NULL,
      unit_price INTEGER NOT NULL,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now')),
      synced INTEGER DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS payments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      customer_id INTEGER NOT NULL REFERENCES customers(id),
      amount INTEGER NOT NULL,
      date TEXT NOT NULL,
      notes TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now')),
      synced INTEGER DEFAULT 0
    );
  `)

  const version = db.prepare("SELECT value FROM _meta WHERE key = 'schema_version'").get()
  if (!version) {
    db.prepare("INSERT INTO _meta (key, value) VALUES ('schema_version', ?)").run(String(SCHEMA_VERSION))
  }
}

// ── Customers ──────────────────────────────────────────────────────

function getCustomers() {
  return db.prepare('SELECT * FROM customers ORDER BY name ASC').all()
}

function getCustomer(id) {
  return db.prepare('SELECT * FROM customers WHERE id = ?').get(id)
}

function addCustomer({ name, phone, address }) {
  const stmt = db.prepare(`
    INSERT INTO customers (name, phone, address)
    VALUES (?, ?, ?)
  `)
  const result = stmt.run(name, phone || null, address || null)
  return getCustomer(result.lastInsertRowid)
}

function updateCustomer(id, { name, phone, address }) {
  db.prepare(`
    UPDATE customers
    SET name = ?, phone = ?, address = ?, updated_at = datetime('now'), synced = 0
    WHERE id = ?
  `).run(name, phone || null, address || null, id)
  return getCustomer(id)
}

function searchCustomers(query) {
  const like = `%${query}%`
  return db.prepare(`
    SELECT * FROM customers
    WHERE name LIKE ? OR phone LIKE ?
    ORDER BY name ASC
  `).all(like, like)
}

function recalculateBalance(customerId) {
  const salesTotal = db.prepare(`
    SELECT COALESCE(SUM(total_amount), 0) AS total FROM sales WHERE customer_id = ?
  `).get(customerId).total

  const paymentsTotal = db.prepare(`
    SELECT COALESCE(SUM(amount), 0) AS total FROM payments WHERE customer_id = ?
  `).get(customerId).total

  const balance = salesTotal - paymentsTotal
  db.prepare(`
    UPDATE customers SET balance = ?, updated_at = datetime('now'), synced = 0 WHERE id = ?
  `).run(balance, customerId)
  return balance
}

// ── Products ───────────────────────────────────────────────────────

function getProducts() {
  return db.prepare('SELECT * FROM products ORDER BY name ASC').all()
}

function getProduct(id) {
  return db.prepare('SELECT * FROM products WHERE id = ?').get(id)
}

function addProduct({ name, unit, reorder_level }) {
  const stmt = db.prepare(`
    INSERT INTO products (name, unit, current_stock, reorder_level)
    VALUES (?, ?, 0, ?)
  `)
  const result = stmt.run(name, unit, reorder_level || 0)
  return getProduct(result.lastInsertRowid)
}

function updateProduct(id, { name, unit, reorder_level }) {
  db.prepare(`
    UPDATE products
    SET name = ?, unit = ?, reorder_level = ?, updated_at = datetime('now'), synced = 0
    WHERE id = ?
  `).run(name, unit, reorder_level || 0, id)
  return getProduct(id)
}

function getLowStockProducts() {
  return db.prepare(`
    SELECT * FROM products WHERE current_stock < reorder_level ORDER BY name ASC
  `).all()
}

// ── Stock Purchases ────────────────────────────────────────────────

function getStockPurchases() {
  return db.prepare(`
    SELECT sp.*, p.name AS product_name, p.unit
    FROM stock_purchases sp
    JOIN products p ON p.id = sp.product_id
    ORDER BY sp.date DESC
  `).all()
}

function getStockPurchase(id) {
  return db.prepare(`
    SELECT sp.*, p.name AS product_name, p.unit
    FROM stock_purchases sp
    JOIN products p ON p.id = sp.product_id
    WHERE sp.id = ?
  `).get(id)
}

function addStockPurchase({ product_id, qty, cost_price, supplier, date }) {
  const insertPurchase = db.prepare(`
    INSERT INTO stock_purchases (product_id, qty, cost_price, supplier, date)
    VALUES (?, ?, ?, ?, ?)
  `)

  const updateStock = db.prepare(`
    UPDATE products
    SET current_stock = current_stock + ?, updated_at = datetime('now'), synced = 0
    WHERE id = ?
  `)

  const transaction = db.transaction(() => {
    const result = insertPurchase.run(product_id, qty, cost_price, supplier || null, date)
    updateStock.run(qty, product_id)
    return result.lastInsertRowid
  })

  const id = transaction()
  return getStockPurchase(id)
}

// ── Sales ──────────────────────────────────────────────────────────

function getSales() {
  return db.prepare(`
    SELECT s.*, c.name AS customer_name
    FROM sales s
    JOIN customers c ON c.id = s.customer_id
    ORDER BY s.date DESC
  `).all()
}

function getSale(id) {
  const sale = db.prepare(`
    SELECT s.*, c.name AS customer_name
    FROM sales s
    JOIN customers c ON c.id = s.customer_id
    WHERE s.id = ?
  `).get(id)

  if (!sale) return null

  sale.items = db.prepare(`
    SELECT si.*, p.name AS product_name, p.unit
    FROM sale_items si
    JOIN products p ON p.id = si.product_id
    WHERE si.sale_id = ?
  `).all(id)

  return sale
}

function addSale({ customer_id, date, notes, items }) {
  const insertSale = db.prepare(`
    INSERT INTO sales (customer_id, date, total_amount, notes)
    VALUES (?, ?, ?, ?)
  `)

  const insertItem = db.prepare(`
    INSERT INTO sale_items (sale_id, product_id, qty, unit_price)
    VALUES (?, ?, ?, ?)
  `)

  const deductStock = db.prepare(`
    UPDATE products
    SET current_stock = current_stock - ?, updated_at = datetime('now'), synced = 0
    WHERE id = ?
  `)

  const transaction = db.transaction(() => {
    const totalAmount = items.reduce((sum, item) => sum + item.qty * item.unit_price, 0)
    const result = insertSale.run(customer_id, date, totalAmount, notes || null)
    const saleId = result.lastInsertRowid

    for (const item of items) {
      insertItem.run(saleId, item.product_id, item.qty, item.unit_price)
      deductStock.run(item.qty, item.product_id)
    }

    recalculateBalance(customer_id)
    return saleId
  })

  const id = transaction()
  return getSale(id)
}

function deleteSale(id) {
  const sale = getSale(id)
  if (!sale) return false

  const updateStock = db.prepare(`
    UPDATE products
    SET current_stock = current_stock + ?, updated_at = datetime('now'), synced = 0
    WHERE id = ?
  `)

  const deleteItems = db.prepare('DELETE FROM sale_items WHERE sale_id = ?')
  const deleteSale = db.prepare('DELETE FROM sales WHERE id = ?')

  const transaction = db.transaction(() => {
    for (const item of sale.items) {
      updateStock.run(item.qty, item.product_id)
    }
    deleteItems.run(id)
    deleteSale.run(id)
    recalculateBalance(sale.customer_id)
  })

  transaction()
  return true
}

// ── Payments ───────────────────────────────────────────────────────

function getPayments() {
  return db.prepare(`
    SELECT p.*, c.name AS customer_name
    FROM payments p
    JOIN customers c ON c.id = p.customer_id
    ORDER BY p.date DESC
  `).all()
}

function getPaymentsByCustomer(customerId) {
  return db.prepare(`
    SELECT * FROM payments WHERE customer_id = ? ORDER BY date DESC
  `).all(customerId)
}

function deletePayment(id) {
  const payment = db.prepare('SELECT customer_id FROM payments WHERE id = ?').get(id)
  if (!payment) return false

  const transaction = db.transaction(() => {
    db.prepare('DELETE FROM payments WHERE id = ?').run(id)
    recalculateBalance(payment.customer_id)
  })

  transaction()
  return true
}

function addPayment({ customer_id, amount, date, notes }) {
  const insertPayment = db.prepare(`
    INSERT INTO payments (customer_id, amount, date, notes)
    VALUES (?, ?, ?, ?)
  `)

  const transaction = db.transaction(() => {
    const result = insertPayment.run(customer_id, amount, date, notes || null)
    recalculateBalance(customer_id)
    return result.lastInsertRowid
  })

  const id = transaction()
  return db.prepare(`
    SELECT p.*, c.name AS customer_name
    FROM payments p
    JOIN customers c ON c.id = p.customer_id
    WHERE p.id = ?
  `).get(id)
}

// ── Reports (helpers) ──────────────────────────────────────────────

function getSalesInRange(startDate, endDate) {
  return db.prepare(`
    SELECT s.*, c.name AS customer_name
    FROM sales s
    JOIN customers c ON c.id = s.customer_id
    WHERE s.date >= ? AND s.date <= ?
    ORDER BY s.date ASC
  `).all(startDate, endDate)
}

function getTopProducts(startDate, endDate) {
  return db.prepare(`
    SELECT p.id, p.name, p.unit, SUM(si.qty) AS total_qty, SUM(si.qty * si.unit_price) AS total_revenue
    FROM sale_items si
    JOIN sales s ON s.id = si.sale_id
    JOIN products p ON p.id = si.product_id
    WHERE s.date >= ? AND s.date <= ?
    GROUP BY si.product_id
    ORDER BY total_revenue DESC
  `).all(startDate, endDate)
}

function getTopCustomers(startDate, endDate) {
  return db.prepare(`
    SELECT c.id, c.name, COUNT(s.id) AS sale_count, SUM(s.total_amount) AS total_spent
    FROM sales s
    JOIN customers c ON c.id = s.customer_id
    WHERE s.date >= ? AND s.date <= ?
    GROUP BY s.customer_id
    ORDER BY total_spent DESC
  `).all(startDate, endDate)
}

function getStockMovements(startDate, endDate) {
  const bought = db.prepare(`
    SELECT p.id, p.name, p.unit, COALESCE(SUM(sp.qty), 0) AS qty_bought,
           COALESCE(SUM(sp.qty * sp.cost_price), 0) AS cost_total
    FROM products p
    LEFT JOIN stock_purchases sp ON sp.product_id = p.id AND sp.date >= ? AND sp.date <= ?
    GROUP BY p.id
  `).all(startDate, endDate)

  const sold = db.prepare(`
    SELECT si.product_id, COALESCE(SUM(si.qty), 0) AS qty_sold
    FROM sale_items si
    JOIN sales s ON s.id = si.sale_id
    WHERE s.date >= ? AND s.date <= ?
    GROUP BY si.product_id
  `).all(startDate, endDate)

  const soldMap = {}
  for (const row of sold) soldMap[row.product_id] = row.qty_sold

  return bought.map((p) => ({
    ...p,
    qty_sold: soldMap[p.id] || 0,
  }))
}
function getInventoryValue() {
  const row = db.prepare(`
    SELECT COALESCE(SUM(sp.qty * sp.cost_price), 0) AS total_value
    FROM (
      SELECT product_id, qty, cost_price,
             ROW_NUMBER() OVER (PARTITION BY product_id ORDER BY date DESC) AS rn
      FROM stock_purchases
    ) sp
    WHERE sp.rn = 1
  `).get()
  return row ? row.total_value : 0
}

// ── Metadata ───────────────────────────────────────────────────────

function getMeta(key) {
  const row = db.prepare('SELECT value FROM _meta WHERE key = ?').get(key)
  return row ? row.value : null
}

function setMeta(key, value) {
  db.prepare(`
    INSERT INTO _meta (key, value)
    VALUES (?, ?)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value
  `).run(key, String(value))
}

module.exports = {
  initDatabase,
  getDatabase,
  getCustomers,
  getCustomer,
  addCustomer,
  updateCustomer,
  searchCustomers,
  recalculateBalance,
  getProducts,
  getProduct,
  addProduct,
  updateProduct,
  getLowStockProducts,
  getStockPurchases,
  getStockPurchase,
  addStockPurchase,
  getSales,
  getSale,
  addSale,
  deleteSale,
  getPayments,
  getPaymentsByCustomer,
  addPayment,
  deletePayment,
  getSalesInRange,
  getTopProducts,
  getTopCustomers,
  getStockMovements,
  getInventoryValue,
  getMeta,
  setMeta,
}

