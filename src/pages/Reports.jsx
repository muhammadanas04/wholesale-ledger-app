import { useState, useEffect } from 'react'
import { ipc } from '../lib/ipc'
import { FileText, Calendar, TrendingUp, Users, Package, Download } from 'lucide-react'

const fmt = (n) => `₹${(n / 100).toLocaleString('en-IN')}`

export default function Reports() {
  const [dates, setDates] = useState({
    start: new Date(new Date().setDate(new Date().getDate() - 7)).toISOString().slice(0, 10),
    end: new Date().toISOString().slice(0, 10),
  })
  const [summary, setSummary] = useState({
    totalSales: 0,
    topProducts: [],
    topCustomers: [],
    inventoryValue: 0,
    stockMovements: [],
  })

  async function load() {
    const [sales, products, customers, inv, movements] = await Promise.all([
      ipc('reports:sales-range', dates.start, dates.end),
      ipc('reports:top-products', dates.start, dates.end),
      ipc('reports:top-customers', dates.start, dates.end),
      ipc('reports:inventory-value'),
      ipc('reports:stock-movements', dates.start, dates.end),
    ])

    const total = (sales || []).reduce((sum, s) => sum + s.total_amount, 0)

    setSummary({
      totalSales: total,
      topProducts: products || [],
      topCustomers: customers || [],
      inventoryValue: inv || 0,
      stockMovements: movements || [],
    })
  }

  useEffect(() => { load() }, [dates])

  async function handleDownloadPDF() {
    await ipc('app:print-to-pdf', `Report_${dates.start}_to_${dates.end}`)
  }

  return (
    <div className="p-6 space-y-6">
      <div className="print-only mb-6">
        <h1 className="text-3xl font-bold text-gray-800">Business Report</h1>
        <p className="text-gray-500">Period: {dates.start} to {dates.end}</p>
      </div>

      <div className="flex items-center justify-between no-print">
        <div className="flex items-center gap-2">
          <FileText className="w-6 h-6 text-gray-700" />
          <h1 className="text-2xl font-bold text-gray-800">Reports</h1>
        </div>
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2 bg-white border border-gray-200 rounded-lg p-1">
            <Calendar className="w-4 h-4 text-gray-400 ml-2" />
            <input
              type="date"
              value={dates.start}
              onChange={(e) => setDates({ ...dates, start: e.target.value })}
              className="text-sm border-none focus:ring-0"
            />
            <span className="text-gray-300">to</span>
            <input
              type="date"
              value={dates.end}
              onChange={(e) => setDates({ ...dates, end: e.target.value })}
              className="text-sm border-none focus:ring-0"
            />
          </div>
          <button
            onClick={handleDownloadPDF}
            className="flex items-center gap-2 px-4 py-2 bg-gray-100 text-gray-600 rounded-lg text-sm font-medium hover:bg-gray-200"
          >
            <Download className="w-4 h-4" /> Download PDF
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="bg-blue-600 rounded-2xl p-6 text-white space-y-1">
          <p className="text-blue-100 text-sm font-medium">Total Sales (Period)</p>
          <p className="text-3xl font-bold">{fmt(summary.totalSales)}</p>
        </div>
        <div className="bg-gray-800 rounded-2xl p-6 text-white space-y-1">
          <p className="text-gray-400 text-sm font-medium">Current Inventory Value</p>
          <p className="text-3xl font-bold">{fmt(summary.inventoryValue)}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        {/* Top Products */}
        <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-100 flex items-center gap-2 font-bold text-gray-800">
            <Package className="w-4 h-4 text-blue-500" /> Top Selling Products
          </div>
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-gray-500">
              <tr>
                <th className="text-left px-5 py-2 font-medium">Product</th>
                <th className="text-right px-5 py-2 font-medium">Qty</th>
                <th className="text-right px-5 py-2 font-medium">Revenue</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {summary.topProducts.map((p) => (
                <tr key={p.id}>
                  <td className="px-5 py-3 font-medium">{p.name}</td>
                  <td className="px-5 py-3 text-right text-gray-500">{p.total_qty} {p.unit}</td>
                  <td className="px-5 py-3 text-right font-bold text-gray-800">{fmt(p.total_revenue)}</td>
                </tr>
              ))}
              {summary.topProducts.length === 0 && (
                <tr><td colSpan={3} className="text-center py-8 text-gray-400">No sales in this period</td></tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Top Customers */}
        <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-100 flex items-center gap-2 font-bold text-gray-800">
            <Users className="w-4 h-4 text-orange-500" /> Top Customers
          </div>
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-gray-500">
              <tr>
                <th className="text-left px-5 py-2 font-medium">Customer</th>
                <th className="text-right px-5 py-2 font-medium">Orders</th>
                <th className="text-right px-5 py-2 font-medium">Total Spent</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {summary.topCustomers.map((c) => (
                <tr key={c.id}>
                  <td className="px-5 py-3 font-medium">{c.name}</td>
                  <td className="px-5 py-3 text-right text-gray-500">{c.sale_count}</td>
                  <td className="px-5 py-3 text-right font-bold text-gray-800">{fmt(c.total_spent)}</td>
                </tr>
              ))}
              {summary.topCustomers.length === 0 && (
                <tr><td colSpan={3} className="text-center py-8 text-gray-400">No sales in this period</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Stock Movement */}
      <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100 flex items-center gap-2 font-bold text-gray-800">
          <TrendingUp className="w-4 h-4 text-green-500" /> Stock Movements
        </div>
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-gray-500">
            <tr>
              <th className="text-left px-5 py-2 font-medium">Product</th>
              <th className="text-right px-5 py-2 font-medium">Qty Bought</th>
              <th className="text-right px-5 py-2 font-medium">Qty Sold</th>
              <th className="text-right px-5 py-2 font-medium">Net Movement</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {summary.stockMovements.map((m) => (
              <tr key={m.id}>
                <td className="px-5 py-3 font-medium">{m.name}</td>
                <td className="px-5 py-3 text-right text-green-600">+{m.qty_bought} {m.unit}</td>
                <td className="px-5 py-3 text-right text-red-600">-{m.qty_sold} {m.unit}</td>
                <td className={`px-5 py-3 text-right font-bold ${m.qty_bought - m.qty_sold >= 0 ? 'text-green-700' : 'text-red-700'}`}>
                  {m.qty_bought - m.qty_sold} {m.unit}
                </td>
              </tr>
            ))}
            {summary.stockMovements.length === 0 && (
              <tr><td colSpan={4} className="text-center py-8 text-gray-400">No movements in this period</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
