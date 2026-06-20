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
  location TEXT,
  bill_no TEXT,
  vehicle_number TEXT,
  driver_name TEXT,
  total_cost INTEGER,
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
  total_price INTEGER,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  synced INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS payments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  customer_id INTEGER NOT NULL,
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

CREATE TABLE IF NOT EXISTS other_expenses (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  money_spent INTEGER NOT NULL DEFAULT 0,
  money_gained INTEGER NOT NULL DEFAULT 0,
  reason TEXT NOT NULL,
  date TEXT NOT NULL,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  synced INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS _meta (
  key TEXT PRIMARY KEY,
  value TEXT,
  updated_at TEXT
);

-- ── Delivery Module Tables ──────────────────────────────────────────

CREATE TABLE IF NOT EXISTS drivers (
  id TEXT PRIMARY KEY,
  phone TEXT NOT NULL UNIQUE,
  name TEXT,
  otp TEXT,
  otp_used INTEGER DEFAULT 0,
  active INTEGER DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  synced INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS deliveries (
  id TEXT PRIMARY KEY,
  driver_id TEXT NOT NULL,
  status TEXT DEFAULT 'pending',
  notes TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  synced INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS delivery_items (
  id TEXT PRIMARY KEY,
  delivery_id TEXT NOT NULL,
  address TEXT NOT NULL,
  stock_amount TEXT NOT NULL,
  status TEXT DEFAULT 'pending',
  customer_id TEXT,
  notes TEXT,
  qty INTEGER DEFAULT 0,
  weight REAL,
  total_price INTEGER,
  customer_name TEXT,
  customer_phone TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  synced INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS driver_locations (
  id TEXT PRIMARY KEY,
  driver_id TEXT NOT NULL,
  latitude REAL NOT NULL,
  longitude REAL NOT NULL,
  recorded_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS tmp_records (
  id TEXT PRIMARY KEY,              -- UUID (generated client-side)
  type TEXT NOT NULL,                -- 'sale' | 'payment' | 'other'
  customer_id TEXT,                  -- Optional FK to customers.id (for lookups)
  customer_name TEXT,                -- Denormalized customer name for display
  customer_phone TEXT,               -- Denormalized phone for SMS sending
  qty REAL,                          -- Sale only: quantity of goods
  weight REAL,                       -- Sale only: weight in kg
  rate REAL,                         -- Sale only: auto-calculated (total_value / weight)
  discount INTEGER DEFAULT 0,        -- Sale/Payment: discount amount in paise
  total_value INTEGER,               -- Sale/Payment: total value in paise
  amount INTEGER,                    -- Other expenses: amount in paise
  reason TEXT,                       -- Other expenses: free-text reason
  date TEXT NOT NULL,                -- YYYY-MM-DD (user-assigned date)
  created_at TEXT NOT NULL,          -- ISO 8601 (auto-set on creation)
  updated_at TEXT NOT NULL,          -- ISO 8601 (auto-set on creation/update)
  synced INTEGER DEFAULT 0           -- 0 = unsynced, 1 = synced
);


-- New table: expenses for driver reporting
CREATE TABLE IF NOT EXISTS expenses (
  id          TEXT PRIMARY KEY,
  driver_id   TEXT NOT NULL,
  category    TEXT NOT NULL,       -- 'petrol_diesel' | 'repair' | 'defective_item' | 'other'
  amount      INTEGER NOT NULL,    -- paise for price categories, raw count for defective_item
  note        TEXT,
  image_url   TEXT NOT NULL,       -- B2 receipt URL served via the Worker /receipt proxy
  created_at  TEXT NOT NULL,
  FOREIGN KEY (driver_id) REFERENCES drivers(id)
);

-- Database indexes for optimized driver queries
CREATE INDEX IF NOT EXISTS idx_expenses_driver ON expenses(driver_id);
CREATE INDEX IF NOT EXISTS idx_delivery_items_delivery ON delivery_items(delivery_id);
CREATE INDEX IF NOT EXISTS idx_deliveries_driver ON deliveries(driver_id);
CREATE INDEX IF NOT EXISTS idx_driver_locations_driver ON driver_locations(driver_id);

