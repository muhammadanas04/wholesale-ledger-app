const Database = require('better-sqlite3')
const path = require('path')
const { app } = require('electron')

let db

const SCHEMA_VERSION = 8
function initDatabase() {
  const dbPath = path.join(app.getPath('userData'), 'wholesale-ledger.db')
  db = new Database(dbPath)
  db.pragma('journal_mode = WAL')
  db.pragma('foreign_keys = ON')

  migrate()

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
      firm_name TEXT,
      date TEXT NOT NULL,
      weight REAL,
      location TEXT,
      bill_no TEXT,
      vehicle_number TEXT,
      driver_name TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now')),
      synced INTEGER DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS sales (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      customer_id INTEGER NOT NULL REFERENCES customers(id),
      date TEXT NOT NULL,
      total_amount INTEGER NOT NULL,
      discount INTEGER NOT NULL DEFAULT 0,
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
      weight REAL,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now')),
      synced INTEGER DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS payments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      customer_id INTEGER NOT NULL REFERENCES customers(id),
      amount INTEGER NOT NULL,
      discount INTEGER NOT NULL DEFAULT 0,
      date TEXT NOT NULL,
      notes TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now')),
      synced INTEGER DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS deleted_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      table_name TEXT NOT NULL,
      row_id INTEGER NOT NULL,
      deleted_at TEXT DEFAULT (datetime('now')),
      synced INTEGER DEFAULT 0
    );
  `)

  let version = 1
  const versionRow = db.prepare("SELECT value FROM _meta WHERE key = 'schema_version'").get()
  if (!versionRow) {
    db.prepare("INSERT INTO _meta (key, value) VALUES ('schema_version', ?)").run(String(SCHEMA_VERSION))
  } else {
    version = parseInt(versionRow.value, 10)
  }

  if (version < 2) {
    try {
      db.exec("ALTER TABLE sale_items ADD COLUMN weight REAL;")
    } catch (e) {
      // Column may already exist if created fresh
    }
  }

  if (version < 3) {
    try {
      db.exec("ALTER TABLE stock_purchases ADD COLUMN weight REAL;")
    } catch (e) {
      // Column may already exist if created fresh
    }
  }

  if (version < 4) {
    try {
      db.exec("ALTER TABLE sales ADD COLUMN discount INTEGER NOT NULL DEFAULT 0;")
    } catch (e) {
      // Column may already exist if created fresh
    }
  }

  if (version < 5) {
    try {
      db.exec("ALTER TABLE stock_purchases ADD COLUMN firm_name TEXT;")
    } catch (e) {
      // Column may already exist if created fresh
    }
  }

  if (version < 6) {
    try {
      db.exec("ALTER TABLE payments ADD COLUMN discount INTEGER NOT NULL DEFAULT 0;")
    } catch (e) {
      // Column may already exist
    }
  }

  if (version < 7) {
    try {
      db.exec("ALTER TABLE stock_purchases ADD COLUMN location TEXT;")
    } catch (e) {}
    try {
      db.exec("ALTER TABLE stock_purchases ADD COLUMN bill_no TEXT;")
    } catch (e) {}
    try {
      db.exec("ALTER TABLE stock_purchases ADD COLUMN vehicle_number TEXT;")
    } catch (e) {}
    try {
      db.exec("ALTER TABLE stock_purchases ADD COLUMN driver_name TEXT;")
    } catch (e) {}
  }

  if (version < 8) {
    try {
      db.exec("ALTER TABLE sale_items ADD COLUMN total_price INTEGER;")
    } catch (e) {}
    try {
      db.exec("ALTER TABLE stock_purchases ADD COLUMN total_cost INTEGER;")
    } catch (e) {}
    try {
      db.exec("UPDATE sale_items SET total_price = CAST(ROUND(qty * unit_price) AS INTEGER) WHERE total_price IS NULL;")
    } catch (e) {}
    try {
      db.exec("UPDATE stock_purchases SET total_cost = CAST(ROUND(qty * cost_price) AS INTEGER) WHERE total_cost IS NULL;")
    } catch (e) {}
  }

  if (version < SCHEMA_VERSION) {
    db.prepare("UPDATE _meta SET value = ? WHERE key = 'schema_version'").run(String(SCHEMA_VERSION))
  }
}

// ── Customers ──────────────────────────────────────────────────────

function getCustomers({ limit = 50, offset = 0, sortBy = 'name', order = 'ASC' } = {}) {
  const safeSort = ['name', 'balance', 'created_at'].includes(sortBy) ? sortBy : 'name'
  const safeOrder = order.toUpperCase() === 'DESC' ? 'DESC' : 'ASC'
  
  return db.prepare(`
    SELECT * FROM customers 
    ORDER BY ${safeSort} ${safeOrder}
    LIMIT ? OFFSET ?
  `).all(limit, offset)
}

function getCustomersCount(search = '') {
  if (search) {
    const like = `%${search}%`
    return db.prepare('SELECT COUNT(*) AS count FROM customers WHERE name LIKE ? OR phone LIKE ?').get(like, like).count
  }
  return db.prepare('SELECT COUNT(*) AS count FROM customers').get().count
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

function searchCustomers(query, { limit = 50, offset = 0, sortBy = 'name', order = 'ASC' } = {}) {
  const like = `%${query}%`
  const safeSort = ['name', 'balance', 'created_at'].includes(sortBy) ? sortBy : 'name'
  const safeOrder = order.toUpperCase() === 'DESC' ? 'DESC' : 'ASC'

  return db.prepare(`
    SELECT * FROM customers
    WHERE name LIKE ? OR phone LIKE ?
    ORDER BY ${safeSort} ${safeOrder}
    LIMIT ? OFFSET ?
  `).all(like, like, limit, offset)
}

function recalculateBalance(customerId) {
  const salesTotal = db.prepare(`
    SELECT COALESCE(SUM(total_amount - discount), 0) AS total FROM sales WHERE customer_id = ?
  `).get(customerId).total

  const paymentsTotal = db.prepare(`
    SELECT COALESCE(SUM(amount - discount), 0) AS total FROM payments WHERE customer_id = ?
  `).get(customerId).total

  const balance = salesTotal - paymentsTotal
  db.prepare(`
    UPDATE customers SET balance = ?, updated_at = datetime('now'), synced = 0 WHERE id = ?
  `).run(balance, customerId)
  return balance
}

// ── Products ───────────────────────────────────────────────────────

function getProducts({ limit = 50, offset = 0, sortBy = 'name', order = 'ASC' } = {}) {
  const safeSort = ['name', 'current_stock', 'reorder_level'].includes(sortBy) ? sortBy : 'name'
  const safeOrder = order.toUpperCase() === 'DESC' ? 'DESC' : 'ASC'

  return db.prepare(`
    SELECT * FROM products 
    ORDER BY ${safeSort} ${safeOrder}
    LIMIT ? OFFSET ?
  `).all(limit, offset)
}

function getProductsCount() {
  return db.prepare('SELECT COUNT(*) AS count FROM products').get().count
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

function adjustProductStock(id, newStock) {
  db.prepare(`
    UPDATE products
    SET current_stock = ?, updated_at = datetime('now'), synced = 0
    WHERE id = ?
  `).run(Number(newStock), id)
  return getProduct(id)
}


function getLowStockProducts() {
  return db.prepare(`
    SELECT * FROM products WHERE current_stock < reorder_level ORDER BY name ASC
  `).all()
}

// ── Stock Purchases ────────────────────────────────────────────────

function getStockPurchases({ limit = 50, offset = 0, date_from, date_to } = {}) {
  let sql = `
    SELECT sp.*, p.name AS product_name, p.unit
    FROM stock_purchases sp
    JOIN products p ON p.id = sp.product_id
  `
  const conds = []
  const params = []
  if (date_from) {
    conds.push("sp.date >= ?")
    params.push(date_from)
  }
  if (date_to) {
    conds.push("sp.date <= ?")
    params.push(date_to)
  }
  if (conds.length > 0) {
    sql += " WHERE " + conds.join(" AND ")
  }
  sql += " ORDER BY sp.date DESC, sp.id DESC LIMIT ? OFFSET ?"
  params.push(limit, offset)
  return db.prepare(sql).all(...params)
}

function getStockPurchasesCount({ date_from, date_to } = {}) {
  let sql = 'SELECT COUNT(*) AS count FROM stock_purchases'
  const conds = []
  const params = []
  if (date_from) {
    conds.push("date >= ?")
    params.push(date_from)
  }
  if (date_to) {
    conds.push("date <= ?")
    params.push(date_to)
  }
  if (conds.length > 0) {
    sql += " WHERE " + conds.join(" AND ")
  }
  return db.prepare(sql).get(...params).count
}

function getStockPurchase(id) {
  return db.prepare(`
    SELECT sp.*, p.name AS product_name, p.unit
    FROM stock_purchases sp
    JOIN products p ON p.id = sp.product_id
    WHERE sp.id = ?
  `).get(id)
}

function addStockPurchase({ product_id, qty, cost_price, supplier, date, weight, firm_name, location, bill_no, vehicle_number, driver_name, total_cost }) {
  const insertPurchase = db.prepare(`
    INSERT INTO stock_purchases (product_id, qty, cost_price, supplier, date, weight, firm_name, location, bill_no, vehicle_number, driver_name, total_cost)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `)

  const updateStock = db.prepare(`
    UPDATE products
    SET current_stock = current_stock + ?, updated_at = datetime('now'), synced = 0
    WHERE id = ?
  `)

  const transaction = db.transaction(() => {
    const result = insertPurchase.run(
      product_id,
      qty,
      cost_price,
      supplier || null,
      date,
      weight !== undefined ? weight : null,
      firm_name || null,
      location || null,
      bill_no || null,
      vehicle_number || null,
      driver_name || null,
      total_cost !== undefined ? total_cost : Math.round(weight > 0 ? weight * cost_price : qty * cost_price)
    )
    updateStock.run(qty, product_id)
    return result.lastInsertRowid
  })

  const id = transaction()
  return getStockPurchase(id)
}

function deleteStockPurchase(id) {
  const purchase = db.prepare('SELECT product_id, qty FROM stock_purchases WHERE id = ?').get(id)
  if (!purchase) return false

  const updateStock = db.prepare(`
    UPDATE products
    SET current_stock = current_stock - ?, updated_at = datetime('now'), synced = 0
    WHERE id = ?
  `)

  const transaction = db.transaction(() => {
    updateStock.run(purchase.qty, purchase.product_id)
    db.prepare('DELETE FROM stock_purchases WHERE id = ?').run(id)
    db.prepare('INSERT INTO deleted_log (table_name, row_id) VALUES (?, ?)').run('stock_purchases', id)
  })

  transaction()
  return true
}

// ── Sales ──────────────────────────────────────────────────────────

function getSales({ limit = 50, offset = 0, date_from, date_to } = {}) {
  let sql = `
    SELECT s.*, c.name AS customer_name,
           (SELECT SUM(qty) FROM sale_items WHERE sale_id = s.id) AS qty,
           (SELECT SUM(weight) FROM sale_items WHERE sale_id = s.id) AS weight,
           (SELECT unit_price FROM sale_items WHERE sale_id = s.id LIMIT 1) AS rate
    FROM sales s
    JOIN customers c ON c.id = s.customer_id
  `
  const conds = []
  const params = []
  if (date_from) {
    conds.push("s.date >= ?")
    params.push(date_from)
  }
  if (date_to) {
    conds.push("s.date <= ?")
    params.push(date_to)
  }
  if (conds.length > 0) {
    sql += " WHERE " + conds.join(" AND ")
  }
  sql += " ORDER BY s.date DESC, s.id DESC LIMIT ? OFFSET ?"
  params.push(limit, offset)
  return db.prepare(sql).all(...params)
}

function getSalesCount({ date_from, date_to } = {}) {
  let sql = 'SELECT COUNT(*) AS count FROM sales'
  const conds = []
  const params = []
  if (date_from) {
    conds.push("date >= ?")
    params.push(date_from)
  }
  if (date_to) {
    conds.push("date <= ?")
    params.push(date_to)
  }
  if (conds.length > 0) {
    sql += " WHERE " + conds.join(" AND ")
  }
  return db.prepare(sql).get(...params).count
}

function getSale(id) {
  const sale = db.prepare(`
    SELECT s.*, c.name AS customer_name,
           (SELECT SUM(weight) FROM sale_items WHERE sale_id = s.id) AS weight
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

function addSale({ customer_id, date, notes, items, discount = 0, total_amount }) {
  const insertSale = db.prepare(`
    INSERT INTO sales (customer_id, date, total_amount, discount, notes)
    VALUES (?, ?, ?, ?, ?)
  `)

  const insertItem = db.prepare(`
    INSERT INTO sale_items (sale_id, product_id, qty, unit_price, weight, total_price)
    VALUES (?, ?, ?, ?, ?, ?)
  `)

  const deductStock = db.prepare(`
    UPDATE products
    SET current_stock = current_stock - ?, updated_at = datetime('now'), synced = 0
    WHERE id = ?
  `)

  const transaction = db.transaction(() => {
    const calculatedTotal = items.reduce((sum, item) => sum + (item.total_price !== undefined ? item.total_price : (item.weight > 0 ? item.weight * item.unit_price : item.qty * item.unit_price)), 0)
    const finalTotal = total_amount !== undefined ? total_amount : calculatedTotal
    const result = insertSale.run(customer_id, date, finalTotal, discount || 0, notes || null)
    const saleId = result.lastInsertRowid

    for (const item of items) {
      const itemTotal = item.total_price !== undefined ? item.total_price : Math.round(item.weight > 0 ? item.weight * item.unit_price : item.qty * item.unit_price)
      insertItem.run(saleId, item.product_id, item.qty, item.unit_price, item.weight !== undefined ? item.weight : null, itemTotal)
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
  const logDelete = db.prepare('INSERT INTO deleted_log (table_name, row_id) VALUES (?, ?)')

  const transaction = db.transaction(() => {
    for (const item of sale.items) {
      updateStock.run(item.qty, item.product_id)
      logDelete.run('sale_items', item.id)
    }
    deleteItems.run(id)
    deleteSale.run(id)
    logDelete.run('sales', id)
    recalculateBalance(sale.customer_id)
  })

  transaction()
  return true
}

function updateSale(saleId, { customer_id, date, notes, items, discount = 0, total_amount }) {
  const oldSale = getSale(saleId)
  if (!oldSale) throw new Error('Sale not found')

  const updateSaleStmt = db.prepare(`
    UPDATE sales
    SET customer_id = ?, date = ?, total_amount = ?, discount = ?, notes = ?, updated_at = datetime('now'), synced = 0
    WHERE id = ?
  `)

  const insertItem = db.prepare(`
    INSERT INTO sale_items (sale_id, product_id, qty, unit_price, weight, total_price)
    VALUES (?, ?, ?, ?, ?, ?)
  `)

  const deleteItems = db.prepare('DELETE FROM sale_items WHERE sale_id = ?')

  const restoreStock = db.prepare(`
    UPDATE products
    SET current_stock = current_stock + ?, updated_at = datetime('now'), synced = 0
    WHERE id = ?
  `)

  const deductStock = db.prepare(`
    UPDATE products
    SET current_stock = current_stock - ?, updated_at = datetime('now'), synced = 0
    WHERE id = ?
  `)

  const transaction = db.transaction(() => {
    // 1. Restore stock levels for old items
    for (const oldItem of oldSale.items) {
      restoreStock.run(oldItem.qty, oldItem.product_id)
    }

    // 2. Delete old items
    deleteItems.run(saleId)

    // 3. Update the main sales record
    const calculatedTotal = items.reduce((sum, item) => sum + (item.total_price !== undefined ? item.total_price : (item.weight > 0 ? item.weight * item.unit_price : item.qty * item.unit_price)), 0)
    const finalTotal = total_amount !== undefined ? total_amount : calculatedTotal
    updateSaleStmt.run(customer_id, date, finalTotal, discount || 0, notes || null, saleId)

    // 4. Insert new items and deduct stock
    for (const item of items) {
      const itemTotal = item.total_price !== undefined ? item.total_price : Math.round(item.weight > 0 ? item.weight * item.unit_price : item.qty * item.unit_price)
      insertItem.run(saleId, item.product_id, item.qty, item.unit_price, item.weight !== undefined ? item.weight : null, itemTotal)
      deductStock.run(item.qty, item.product_id)
    }

    // 5. Recalculate customer balance
    recalculateBalance(oldSale.customer_id)
    if (oldSale.customer_id !== customer_id) {
      recalculateBalance(customer_id)
    }

    return saleId
  })

  transaction()
  return getSale(saleId)
}

// ── Payments ───────────────────────────────────────────────────────

function getPayments({ limit = 50, offset = 0, date_from, date_to } = {}) {
  let sql = `
    SELECT p.*, c.name AS customer_name
    FROM payments p
    JOIN customers c ON c.id = p.customer_id
  `
  const conds = []
  const params = []
  if (date_from) {
    conds.push("p.date >= ?")
    params.push(date_from)
  }
  if (date_to) {
    conds.push("p.date <= ?")
    params.push(date_to)
  }
  if (conds.length > 0) {
    sql += " WHERE " + conds.join(" AND ")
  }
  sql += " ORDER BY p.date DESC, p.id DESC LIMIT ? OFFSET ?"
  params.push(limit, offset)
  return db.prepare(sql).all(...params)
}

function getPaymentsCount({ date_from, date_to } = {}) {
  let sql = 'SELECT COUNT(*) AS count FROM payments'
  const conds = []
  const params = []
  if (date_from) {
    conds.push("date >= ?")
    params.push(date_from)
  }
  if (date_to) {
    conds.push("date <= ?")
    params.push(date_to)
  }
  if (conds.length > 0) {
    sql += " WHERE " + conds.join(" AND ")
  }
  return db.prepare(sql).get(...params).count
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
    db.prepare('INSERT INTO deleted_log (table_name, row_id) VALUES (?, ?)').run('payments', id)
    recalculateBalance(payment.customer_id)
  })

  transaction()
  return true
}

function addPayment({ customer_id, amount, date, notes, discount = 0 }) {
  const insertPayment = db.prepare(`
    INSERT INTO payments (customer_id, amount, discount, date, notes)
    VALUES (?, ?, ?, ?, ?)
  `)

  const transaction = db.transaction(() => {
    const result = insertPayment.run(customer_id, amount, discount || 0, date, notes || null)
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
    SELECT c.id, c.name, COUNT(s.id) AS sale_count, SUM(s.total_amount - s.discount) AS total_spent
    FROM sales s
    JOIN customers c ON c.id = s.customer_id
    WHERE s.date >= ? AND s.date <= ?
    GROUP BY s.customer_id
    ORDER BY total_spent DESC
  `).all(startDate, endDate)
}

function getStockMovements(startDate, endDate) {
  const bought = db.prepare(`
    SELECT p.id, p.name, p.unit, 
           COALESCE(SUM(sp.qty), 0) AS qty_bought,
           COALESCE(SUM(sp.weight), 0) AS weight_bought,
           COALESCE(SUM(sp.qty * sp.cost_price), 0) AS cost_total
    FROM products p
    LEFT JOIN stock_purchases sp ON sp.product_id = p.id AND sp.date >= ? AND sp.date <= ?
    GROUP BY p.id
  `).all(startDate, endDate)

  const sold = db.prepare(`
    SELECT si.product_id, 
           COALESCE(SUM(si.qty), 0) AS qty_sold,
           COALESCE(SUM(si.weight), 0) AS weight_sold
    FROM sale_items si
    JOIN sales s ON s.id = si.sale_id
    WHERE s.date >= ? AND s.date <= ?
    GROUP BY si.product_id
  `).all(startDate, endDate)

  const soldMap = {}
  for (const row of sold) {
    soldMap[row.product_id] = {
      qty_sold: row.qty_sold,
      weight_sold: row.weight_sold
    }
  }

  return bought.map((p) => {
    const s = soldMap[p.id] || { qty_sold: 0, weight_sold: 0 }
    return {
      ...p,
      qty_sold: s.qty_sold,
      weight_sold: s.weight_sold,
    }
  })
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

// ── Ledger ─────────────────────────────────────────────────────────

function buildLedgerQueries(filters = {}) {
  const { customer_id, date_from, date_to, type } = filters

  let salesSql = `
    SELECT
      'sale'    AS type,
      s.id,
      s.customer_id,
      c.name    AS customer_name,
      s.date,
      s.total_amount AS amount,
      s.discount,
      s.notes,
      (SELECT SUM(weight) FROM sale_items WHERE sale_id = s.id) AS weight,
      s.id      AS reference_id,
      s.created_at
    FROM sales s
    JOIN customers c ON c.id = s.customer_id
  `
  let paymentsSql = `
    SELECT
      'payment' AS type,
      p.id,
      p.customer_id,
      c.name    AS customer_name,
      p.date,
      -p.amount AS amount,
      p.discount AS discount,
      p.notes,
      NULL      AS weight,
      p.id      AS reference_id,
      p.created_at
    FROM payments p
    JOIN customers c ON c.id = p.customer_id
  `

  let salesConds = []
  let paymentsConds = []
  let salesParams = []
  let paymentsParams = []

  if (customer_id) {
    salesConds.push("s.customer_id = ?")
    paymentsConds.push("p.customer_id = ?")
    salesParams.push(Number(customer_id))
    paymentsParams.push(Number(customer_id))
  }
  if (date_from) {
    salesConds.push("s.date >= ?")
    paymentsConds.push("p.date >= ?")
    salesParams.push(date_from)
    paymentsParams.push(date_from)
  }
  if (date_to) {
    salesConds.push("s.date <= ?")
    paymentsConds.push("p.date <= ?")
    salesParams.push(date_to)
    paymentsParams.push(date_to)
  }

  if (salesConds.length > 0) {
    salesSql += " WHERE " + salesConds.join(" AND ")
  }
  if (paymentsConds.length > 0) {
    paymentsSql += " WHERE " + paymentsConds.join(" AND ")
  }

  let parts = []
  let params = []

  if (!type || type === 'all') {
    parts.push(salesSql)
    params.push(...salesParams)
    parts.push(paymentsSql)
    params.push(...paymentsParams)
  } else if (type === 'sale') {
    parts.push(salesSql)
    params.push(...salesParams)
  } else if (type === 'payment') {
    parts.push(paymentsSql)
    params.push(...paymentsParams)
  }

  return { parts, params }
}

function getLedgerEntries(filters = {}) {
  const { limit = 20, offset = 0 } = filters
  const { parts, params } = buildLedgerQueries(filters)

  if (parts.length === 0) return []

  const unionSql = parts.join(" UNION ALL ")
  const sql = `
    SELECT * FROM (
      ${unionSql}
    )
    ORDER BY date DESC, created_at DESC
    LIMIT ? OFFSET ?
  `

  const allParams = [...params, limit, offset]
  return db.prepare(sql).all(...allParams)
}

function getLedgerCount(filters = {}) {
  const { parts, params } = buildLedgerQueries(filters)

  if (parts.length === 0) return 0

  const unionSql = parts.join(" UNION ALL ")
  const sql = `
    SELECT COUNT(*) AS count FROM (
      ${unionSql}
    )
  `

  return db.prepare(sql).get(...params).count
}

function getLedgerSummary(filters = {}) {
  const { parts, params } = buildLedgerQueries(filters)

  if (parts.length === 0) {
    return {
      total_sales: 0,
      total_payments: 0,
      net_outstanding: 0,
      entry_count: 0
    }
  }

  const unionSql = parts.join(" UNION ALL ")
  const sql = `
    SELECT 
      COALESCE(SUM(CASE WHEN type = 'sale' THEN amount - discount ELSE 0 END), 0) AS total_sales,
      COALESCE(SUM(CASE WHEN type = 'payment' THEN -amount - discount ELSE 0 END), 0) AS total_payments,
      COUNT(*) AS entry_count
    FROM (
      ${unionSql}
    )
  `

  const row = db.prepare(sql).get(...params)
  const total_sales = row.total_sales
  const total_payments = row.total_payments

  return {
    total_sales,
    total_payments,
    net_outstanding: total_sales - total_payments,
    entry_count: row.entry_count
  }
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
  getCustomersCount,
  addCustomer,
  updateCustomer,
  searchCustomers,
  recalculateBalance,
  getProducts,
  getProduct,
  getProductsCount,
  addProduct,
  updateProduct,
  adjustProductStock,
  getLowStockProducts,
  getStockPurchases,
  getStockPurchase,
  getStockPurchasesCount,
  addStockPurchase,
  deleteStockPurchase,
  getSales,
  getSale,
  getSalesCount,
  addSale,
  deleteSale,
  updateSale,
  getPayments,
  getPaymentsByCustomer,
  getPaymentsCount,
  addPayment,
  deletePayment,
  getSalesInRange,
  getTopProducts,
  getTopCustomers,
  getStockMovements,
  getInventoryValue,
  getLedgerEntries,
  getLedgerCount,
  getLedgerSummary,
  getMeta,
  setMeta,
}

