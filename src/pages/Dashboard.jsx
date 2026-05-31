import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { ipc } from '../lib/ipc'
import { 
  IndianRupee, 
  Package, 
  Users, 
  AlertTriangle, 
  TrendingUp, 
  Calendar, 
  TrendingDown,
  Layers
} from 'lucide-react'
import { formatCurrency } from '../lib/formatters'
import Skeleton from '../components/Skeleton'
import { ResponsiveContainer, PieChart, Pie, Cell, Tooltip, Legend } from 'recharts'

// Harmonized color palette for donut charts
const CHARTS_COLORS = [
  '#3b82f6', // blue-500
  '#10b981', // emerald-500
  '#6366f1', // indigo-500
  '#f59e0b', // amber-500
  '#8b5cf6', // violet-500
  '#ec4899', // pink-500
  '#14b8a6', // teal-500
  '#f43f5e', // rose-500
]

function StatCard({ icon: Icon, label, value, color, loading, children }) {
  return (
    <div className="bg-white rounded-3xl border border-gray-200/80 p-6 shadow-sm flex items-center gap-5 transition-all duration-300 hover:border-blue-200 hover:-translate-y-0.5 hover:shadow-md">
      <div className={`p-4 rounded-2xl shadow-sm flex-shrink-0 ${color}`}>
        <Icon className="w-8 h-8 text-white" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1 truncate" title={label}>{label}</p>
        {loading ? (
          <Skeleton className="h-8 w-24" />
        ) : (
          <>
            <p className="text-xl sm:text-2xl font-black text-gray-900 tracking-tighter truncate" title={value}>{value}</p>
            {children}
          </>
        )}
      </div>
    </div>
  )
}



export default function Dashboard() {
  const [loading, setLoading] = useState(true)
  const [activePreset, setActivePreset] = useState('monthly')
  const [dates, setDates] = useState({ start: '', end: '' })
  const [shopName, setShopName] = useState('Wholesale Ledger')
  const [activeTab, setActiveTab] = useState('products') // products, customers, movements

  const [singleProductMode, setSingleProductMode] = useState(false)
  const [singleProduct, setSingleProduct] = useState(null)
  const [stats, setStats] = useState({ sales: 0, stockValue: 0, balance: 0 })
  const [lowStock, setLowStock] = useState([])
  const [topProducts, setTopProducts] = useState([])
  const [topCustomers, setTopCustomers] = useState([])
  const [stockMovements, setStockMovements] = useState([])

  // Calculate dynamic monthly dates on mount or preset switch
  const getPresetDates = (preset) => {
    const now = new Date()
    const y = now.getFullYear()
    const m = now.getMonth()

    if (preset === 'today') {
      const today = now.toISOString().slice(0, 10)
      return { start: today, end: today }
    } else if (preset === 'monthly') {
      const startStr = `${y}-${String(m + 1).padStart(2, '0')}-01`
      const end = new Date(y, m + 1, 0)
      const endStr = `${y}-${String(m + 1).padStart(2, '0')}-${String(end.getDate()).padStart(2, '0')}`
      return { start: startStr, end: endStr }
    } else if (preset === 'yearly') {
      const end = new Date()
      const start = new Date()
      start.setFullYear(end.getFullYear() - 1)
      return {
        start: start.toISOString().slice(0, 10),
        end: end.toISOString().slice(0, 10)
      }
    }
    return { start: '', end: '' }
  }

  // Set default preset on mount
  useEffect(() => {
    const initialDates = getPresetDates('monthly')
    setDates(initialDates)
  }, [])

  // Load all statistics & reports
  useEffect(() => {
    async function load() {
      if (!dates.start || !dates.end) return
      setLoading(true)
      try {
        const [sales, products, customers, invVal, movements, low, allCusts, name, singleProductVal, prodsList] = await Promise.all([
          ipc('reports:sales-range', dates.start, dates.end),
          ipc('reports:top-products', dates.start, dates.end),
          ipc('reports:top-customers', dates.start, dates.end),
          ipc('reports:inventory-value'),
          ipc('reports:stock-movements', dates.start, dates.end),
          ipc('products:low-stock'),
          ipc('customers:list', { limit: 1000 }),
          ipc('meta:get', 'shop_name'),
          ipc('meta:get', 'single_product_mode'),
          ipc('products:list', { limit: 1 }),
        ])

        const totalSales = (sales || []).reduce((sum, s) => sum + s.total_amount - (s.discount || 0), 0)
        const totalBalance = (allCusts || []).reduce((sum, c) => sum + c.balance, 0)

        if (name) setShopName(name)
        const isSingle = singleProductVal === 'true'
        setSingleProductMode(isSingle)
        if (isSingle) {
          setActiveTab('customers')
          if (prodsList && prodsList.length > 0) {
            setSingleProduct(prodsList[0])
          } else {
            setSingleProduct(null)
          }
        } else {
          setSingleProduct(null)
        }

        setStats({
          sales: totalSales,
          stockValue: invVal || 0,
          balance: totalBalance,
        })
        setTopProducts(products || [])
        setTopCustomers(customers || [])
        setStockMovements(movements || [])
        setLowStock(low || [])
      } catch (err) {
        console.error('Failed to load dashboard data', err)
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [dates])

  // Presets trigger handler
  const handlePresetSelect = (preset) => {
    setActivePreset(preset)
    if (preset !== 'custom') {
      setDates(getPresetDates(preset))
    }
  }


  // Group low volume chart data into "Others" to maintain chart beauty
  const groupChartData = (dataList, maxItems = 5) => {
    if (dataList.length <= maxItems) return dataList
    const top = dataList.slice(0, maxItems - 1)
    const remaining = dataList.slice(maxItems - 1)
    const otherValue = remaining.reduce((sum, item) => sum + item.value, 0)
    return [
      ...top,
      { name: 'Others', value: otherValue }
    ]
  }

  const productChartData = groupChartData(
    topProducts.map(p => ({ name: p.name, value: p.total_revenue }))
  )

  const customerChartData = groupChartData(
    topCustomers.map(c => ({ name: c.name, value: c.total_spent }))
  )

  return (
    <div className="p-6 space-y-8">
      {/* Printable Report Header */}
      <div className="print-only mb-6 border-b pb-4">
        <h1 className="text-3xl font-black text-gray-900 tracking-tight">{shopName}</h1>
        <p className="text-xl font-bold mt-1 text-gray-600">Business Performance & Analytics Overview</p>
        <p className="text-gray-400 font-medium text-xs mt-1">Period: {dates.start} to {dates.end}</p>
      </div>

      {/* Main Actions & Title Header */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 no-print">
        <div className="flex items-center gap-3">
          <TrendingUp className="w-8 h-8 text-blue-600" />
          <div>
            <h1 className="text-3xl font-black text-gray-900 tracking-tight">Overview</h1>
            <p className="text-xs text-gray-400 font-bold uppercase tracking-wider mt-0.5">Real-time performance analytics</p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {/* Preset Controls */}
          <div className="flex items-center gap-1.5 bg-gray-100 p-1 rounded-2xl">
            {['today', 'monthly', 'yearly', 'custom'].map((preset) => (
              <button
                key={preset}
                onClick={() => handlePresetSelect(preset)}
                className={`px-3 py-1.5 text-xs font-black uppercase tracking-wider rounded-xl transition-all duration-200 ${
                  activePreset === preset
                    ? 'bg-white text-gray-900 shadow-sm'
                    : 'text-gray-500 hover:text-gray-900'
                }`}
              >
                {preset === 'monthly' ? 'This Month' : preset === 'yearly' ? 'Yearly' : preset}
              </button>
            ))}
          </div>

          {/* Date Picker inputs for custom selection */}
          {activePreset === 'custom' && (
            <div className="flex items-center gap-2 bg-white border border-gray-200 rounded-2xl p-1.5 shadow-sm transition-all duration-300">
              <Calendar className="w-4 h-4 text-gray-400 ml-2" />
              <input
                type="date"
                value={dates.start}
                onChange={(e) => setDates({ ...dates, start: e.target.value })}
                onClick={(e) => {
                  try {
                    e.target.showPicker()
                  } catch (err) {
                    console.error(err)
                  }
                }}
                className="text-xs border-none focus:ring-0 font-bold text-gray-700 bg-transparent p-0 w-28 cursor-pointer"
              />
              <span className="text-gray-300 text-xs font-medium">to</span>
              <input
                type="date"
                value={dates.end}
                onChange={(e) => setDates({ ...dates, end: e.target.value })}
                onClick={(e) => {
                  try {
                    e.target.showPicker()
                  } catch (err) {
                    console.error(err)
                  }
                }}
                className="text-xs border-none focus:ring-0 font-bold text-gray-700 bg-transparent p-0 w-28 cursor-pointer"
              />
            </div>
          )}

        </div>
      </div>

      {/* Stock Alerts Panel */}
      {lowStock.length > 0 && (
        <div className="bg-red-50 border border-red-100 rounded-3xl p-6 shadow-sm no-print">
          <div className="flex items-center gap-3 text-red-700 font-black uppercase text-xs tracking-widest mb-4">
            <AlertTriangle className="w-5 h-5 text-red-500 animate-pulse" />
            Inventory Depletion Warnings
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {lowStock.map((p) => (
              <div key={p.id} className="bg-white border border-red-200/60 rounded-2xl p-4 flex items-center justify-between shadow-sm">
                <div>
                  <p className="font-bold text-gray-800 tracking-tight">{p.name}</p>
                  <p className="text-[10px] font-bold text-gray-400 uppercase mt-0.5">Reorder trigger: {p.reorder_level} {p.unit}</p>
                </div>
                <div className="text-right">
                  <p className="text-lg font-black text-red-600 tracking-tighter">{p.current_stock}</p>
                  <p className="text-[10px] font-bold text-red-400 uppercase">{p.unit} remaining</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* KPI Cards Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
        <StatCard 
          icon={IndianRupee} 
          label={`Sales (${activePreset === 'custom' ? 'Custom Period' : activePreset === 'today' ? 'Today' : activePreset === 'monthly' ? 'This Month' : 'Yearly'})`} 
          value={formatCurrency(stats.sales)} 
          color="bg-emerald-500" 
          loading={loading} 
        />
        <StatCard 
          icon={Package} 
          label="Total Inventory Value" 
          value={formatCurrency(stats.stockValue)} 
          color="bg-blue-600" 
          loading={loading} 
        >
          {singleProductMode && singleProduct && (
            <span className="text-[10px] font-bold text-blue-600 block mt-1.5 uppercase tracking-wider">
              Stock: {singleProduct.current_stock} {singleProduct.unit}
            </span>
          )}
        </StatCard>
        <StatCard 
          icon={Users} 
          label="Total Outstanding Balance" 
          value={formatCurrency(stats.balance)} 
          color="bg-orange-500" 
          loading={loading}
        >
          <Link to="/ledger?date=today" className="no-print text-[10px] font-bold text-orange-600 hover:text-orange-700 hover:underline block mt-1.5 uppercase tracking-wider">
            View Today's Ledger →
          </Link>
        </StatCard>
      </div>

      {/* Analytics Charts Grid */}
      <div className={`grid grid-cols-1 ${singleProductMode ? '' : 'xl:grid-cols-2'} gap-6`}>
        {/* Top Products Donut */}
        {!singleProductMode && (
          <div className="bg-white border border-gray-200/80 rounded-3xl p-6 shadow-sm flex flex-col justify-between">
            <div className="flex items-center gap-2 mb-4">
              <div className="p-2 bg-blue-50 text-blue-600 rounded-xl">
                <Layers className="w-4 h-4" />
              </div>
              <div>
                <h3 className="font-black text-gray-900 text-sm tracking-tight">Revenue contribution by Product</h3>
                <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wide mt-0.5">Top performing products value share</p>
              </div>
            </div>
            <div className="flex-1 flex items-center justify-center min-h-[260px]">
              {loading ? (
                <Skeleton className="h-48 w-48 rounded-full" />
              ) : productChartData.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-48 text-gray-400">
                  <Package className="w-10 h-10 text-gray-200 mb-2" />
                  <span className="text-xs font-bold uppercase tracking-wider">No sales records in period</span>
                </div>
              ) : (
                <div className="w-full h-[260px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={productChartData}
                        cx="50%"
                        cy="50%"
                        innerRadius={65}
                        outerRadius={85}
                        paddingAngle={3}
                        dataKey="value"
                      >
                        {productChartData.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={CHARTS_COLORS[index % CHARTS_COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip 
                        formatter={(val) => formatCurrency(val)}
                        contentStyle={{ background: '#fff', borderRadius: '16px', border: '1px solid #f3f4f6', boxShadow: '0 4px 12px -2px rgba(0,0,0,0.06)' }}
                        labelStyle={{ fontWeight: 'bold' }}
                      />
                      <Legend 
                        verticalAlign="bottom" 
                        height={36} 
                        iconType="circle"
                        iconSize={6}
                        wrapperStyle={{ fontSize: '10px', fontWeight: 'bold', color: '#6b7280' }}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Top Customers Donut */}
        <div className="bg-white border border-gray-200/80 rounded-3xl p-6 shadow-sm flex flex-col justify-between">
          <div className="flex items-center gap-2 mb-4">
            <div className="p-2 bg-emerald-50 text-emerald-600 rounded-xl">
              <Users className="w-4 h-4" />
            </div>
            <div>
              <h3 className="font-black text-gray-900 text-sm tracking-tight">Sales Contribution by Customer</h3>
              <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wide mt-0.5">Customer spending distribution</p>
            </div>
          </div>
          <div className="flex-1 flex items-center justify-center min-h-[260px]">
            {loading ? (
              <Skeleton className="h-48 w-48 rounded-full" />
            ) : customerChartData.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-48 text-gray-400">
                <Users className="w-10 h-10 text-gray-200 mb-2" />
                <span className="text-xs font-bold uppercase tracking-wider">No sales records in period</span>
              </div>
            ) : (
              <div className="w-full h-[260px]">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={customerChartData}
                      cx="50%"
                      cy="50%"
                      innerRadius={65}
                      outerRadius={85}
                      paddingAngle={3}
                      dataKey="value"
                    >
                      {customerChartData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={CHARTS_COLORS[index % CHARTS_COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip 
                      formatter={(val) => formatCurrency(val)}
                      contentStyle={{ background: '#fff', borderRadius: '16px', border: '1px solid #f3f4f6', boxShadow: '0 4px 12px -2px rgba(0,0,0,0.06)' }}
                    />
                    <Legend 
                      verticalAlign="bottom" 
                      height={36} 
                      iconType="circle"
                      iconSize={6}
                      wrapperStyle={{ fontSize: '10px', fontWeight: 'bold', color: '#6b7280' }}
                    />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Tabbed Report Tables Details */}
      <div className="bg-white border border-gray-200/80 rounded-3xl overflow-hidden shadow-sm">
        {/* Tab Headers */}
        <div className="px-6 py-4 border-b border-gray-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-gray-50/50 no-print">
          <h3 className="text-sm font-black text-gray-900 uppercase tracking-wide">Detailed Business Breakdown</h3>
          <div className="flex items-center gap-1.5 bg-gray-200/60 p-0.5 rounded-xl self-start sm:self-auto">
            {!singleProductMode && (
              <button
                onClick={() => setActiveTab('products')}
                className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-all duration-200 flex items-center gap-1.5 ${
                  activeTab === 'products'
                    ? 'bg-white text-gray-900 shadow-sm'
                    : 'text-gray-500 hover:text-gray-900'
                }`}
              >
                <Package className="w-3.5 h-3.5" />
                Products
              </button>
            )}
            <button
              onClick={() => setActiveTab('customers')}
              className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-all duration-200 flex items-center gap-1.5 ${
                activeTab === 'customers'
                  ? 'bg-white text-gray-900 shadow-sm'
                  : 'text-gray-500 hover:text-gray-900'
              }`}
            >
              <Users className="w-3.5 h-3.5" />
              Customers
            </button>
            <button
              onClick={() => setActiveTab('movements')}
              className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-all duration-200 flex items-center gap-1.5 ${
                activeTab === 'movements'
                  ? 'bg-white text-gray-900 shadow-sm'
                  : 'text-gray-500 hover:text-gray-900'
              }`}
            >
              <TrendingUp className="w-3.5 h-3.5" />
              Stock Movements
            </button>
          </div>
        </div>

        {/* Printable View - Shows all three lists during print, ignoring tabs */}
        <div className="p-6 space-y-8 print:p-0 print:space-y-10">
          
          {/* 1. Top Selling Products Section */}
          {!singleProductMode && (
            <div className={`${activeTab === 'products' ? 'block' : 'hidden'} print:block`}>
              <div className="hidden print:flex items-center gap-2 mb-3 border-b pb-2">
                <Package className="w-4 h-4 text-blue-500" />
                <h3 className="font-bold text-gray-800 text-sm uppercase">Top Selling Products</h3>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 text-gray-500 uppercase tracking-widest text-[10px] font-black">
                    <tr>
                      <th className="text-left px-5 py-3 border-b border-gray-100">Product Name</th>
                      <th className="text-right px-5 py-3 border-b border-gray-100">Quantity Sold</th>
                      <th className="text-right px-5 py-3 border-b border-gray-100">Revenue Generated</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {loading ? (
                      <tr>
                        <td colSpan={3} className="px-5 py-6">
                          <Skeleton className="h-6 w-full mb-2" />
                          <Skeleton className="h-6 w-full" />
                        </td>
                      </tr>
                    ) : topProducts.map((p) => (
                      <tr key={p.id} className="hover:bg-gray-50/50">
                        <td className="px-5 py-3 font-semibold text-gray-800">{p.name}</td>
                        <td className="px-5 py-3 text-right text-gray-500 font-bold">{p.total_qty} {p.unit}</td>
                        <td className="px-5 py-3 text-right font-black text-gray-900">{formatCurrency(p.total_revenue)}</td>
                      </tr>
                    ))}
                    {!loading && topProducts.length === 0 && (
                      <tr>
                        <td colSpan={3} className="text-center py-8 text-gray-400 font-bold uppercase tracking-wider text-xs">
                          No transactions registered in this period
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* 2. Top Customers Section */}
          <div className={`${activeTab === 'customers' ? 'block' : 'hidden'} print:block print:page-break-before`}>
            <div className="hidden print:flex items-center gap-2 mb-3 border-b pb-2">
              <Users className="w-4 h-4 text-orange-500" />
              <h3 className="font-bold text-gray-800 text-sm uppercase">Top Buying Customers</h3>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 text-gray-500 uppercase tracking-widest text-[10px] font-black">
                  <tr>
                    <th className="text-left px-5 py-3 border-b border-gray-100">Customer Name</th>
                    <th className="text-right px-5 py-3 border-b border-gray-100">Invoices Filed</th>
                    <th className="text-right px-5 py-3 border-b border-gray-100">Total Spent</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {loading ? (
                    <tr>
                      <td colSpan={3} className="px-5 py-6">
                        <Skeleton className="h-6 w-full mb-2" />
                        <Skeleton className="h-6 w-full" />
                      </td>
                    </tr>
                  ) : topCustomers.map((c) => (
                    <tr key={c.id} className="hover:bg-gray-50/50">
                      <td className="px-5 py-3 font-semibold text-gray-800">{c.name}</td>
                      <td className="px-5 py-3 text-right text-gray-500 font-bold">{c.sale_count} sales</td>
                      <td className="px-5 py-3 text-right font-black text-gray-900">{formatCurrency(c.total_spent)}</td>
                    </tr>
                  ))}
                  {!loading && topCustomers.length === 0 && (
                    <tr>
                      <td colSpan={3} className="text-center py-8 text-gray-400 font-bold uppercase tracking-wider text-xs">
                        No transactions registered in this period
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* 3. Stock Movements Section */}
          <div className={`${activeTab === 'movements' ? 'block' : 'hidden'} print:block print:page-break-before`}>
            <div className="hidden print:flex items-center gap-2 mb-3 border-b pb-2">
              <TrendingUp className="w-4 h-4 text-green-500" />
              <h3 className="font-bold text-gray-800 text-sm uppercase">Stock Movement Log</h3>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 text-gray-500 uppercase tracking-widest text-[10px] font-black">
                  <tr>
                    <th className="text-left px-5 py-3 border-b border-gray-100">Product Name</th>
                    <th className="text-right px-5 py-3 border-b border-gray-100">Quantity Purchased</th>
                    <th className="text-right px-5 py-3 border-b border-gray-100">Quantity Sold</th>
                    <th className="text-right px-5 py-3 border-b border-gray-100">Net Flow</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {loading ? (
                    <tr>
                      <td colSpan={4} className="px-5 py-6">
                        <Skeleton className="h-6 w-full mb-2" />
                        <Skeleton className="h-6 w-full" />
                      </td>
                    </tr>
                  ) : stockMovements.map((m) => {
                    const netMovement = m.qty_bought - m.qty_sold
                    return (
                      <tr key={m.id} className="hover:bg-gray-50/50">
                        <td className="px-5 py-3 font-semibold text-gray-800">{m.name}</td>
                        <td className="px-5 py-3 text-right text-emerald-600 font-bold">+{m.qty_bought} {m.unit}</td>
                        <td className="px-5 py-3 text-right text-rose-500 font-bold">-{m.qty_sold} {m.unit}</td>
                        <td className={`px-5 py-3 text-right font-black flex items-center justify-end gap-1 ${
                          netMovement > 0 ? 'text-emerald-700' : netMovement < 0 ? 'text-rose-700' : 'text-gray-500'
                        }`}>
                          {netMovement > 0 ? (
                            <TrendingUp className="w-3.5 h-3.5 flex-shrink-0" />
                          ) : netMovement < 0 ? (
                            <TrendingDown className="w-3.5 h-3.5 flex-shrink-0" />
                          ) : null}
                          {netMovement} {m.unit}
                        </td>
                      </tr>
                    )
                  })}
                  {!loading && stockMovements.length === 0 && (
                    <tr>
                      <td colSpan={4} className="text-center py-8 text-gray-400 font-bold uppercase tracking-wider text-xs">
                        No product movements in this period
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
          
        </div>
      </div>

    </div>
  )
}
