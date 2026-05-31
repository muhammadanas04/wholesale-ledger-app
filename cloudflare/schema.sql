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
  product_id INTEGER NOT NULL,
  qty REAL NOT NULL,
  cost_price INTEGER NOT NULL,
  supplier TEXT,
  firm_name TEXT,
  date TEXT NOT NULL,
  weight REAL,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  synced INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS sales (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  customer_id INTEGER NOT NULL,
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
  sale_id INTEGER NOT NULL,
  product_id INTEGER NOT NULL,
  qty REAL NOT NULL,
  unit_price INTEGER NOT NULL,
  weight REAL,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  synced INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS payments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  customer_id INTEGER NOT NULL,
  amount INTEGER NOT NULL,
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

CREATE TABLE IF NOT EXISTS _meta (
  key TEXT PRIMARY KEY,
  value TEXT,
  updated_at TEXT
);
