import { useState, useEffect } from 'react'
import { ipc } from '../lib/ipc'
import { IndianRupee, Package, Users, AlertTriangle } from 'lucide-react'

function StatCard({ icon: Icon, label, value, color }) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5 flex items-center gap-4">
      <div className={`p-3 rounded-lg ${color}`}>
        <Icon className="w-6 h-6 text-white" />
      </div>
      <div>
        <p className="text-sm text-gray-500">{label}</p>
        <p className="text-xl font-bold text-gray-800">{value}</p>
      </div>
    </div>
  )
}

export default function Dashboard() {
  const [stats, setStats] = useState({ sales: 0, stockValue: 0, balance: 0 })
  const [lowStock, setLowStock] = useState([])

  useEffect(() => {
    async function load() {
      const today = new Date().toISOString().slice(0, 10)
      const sales = await ipc('reports:sales-range', today, today) || []
      const totalSales = sales.reduce((s, r) => s + r.total_amount, 0)

      const stockVal = await ipc('reports:inventory-value') || 0
      const customers = await ipc('customers:list') || []
      const totalBalance = customers.reduce((s, c) => s + c.balance, 0)

      const low = await ipc('products:low-stock') || []

      setStats({ sales: totalSales, stockValue: stockVal, balance: totalBalance })
      setLowStock(low)
    }
    load()
  }, [])

  const fmt = (n) => `₹${(n / 100).toLocaleString('en-IN')}`

  return (
    <div className="p-6 space-y-6">
      <h1 className="text-2xl font-bold text-gray-800">Dashboard</h1>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <StatCard icon={IndianRupee} label="Today's Sales" value={fmt(stats.sales)} color="bg-green-500" />
        <StatCard icon={Package} label="Stock Value" value={fmt(stats.stockValue)} color="bg-blue-500" />
        <StatCard icon={Users} label="Outstanding Balance" value={fmt(stats.balance)} color="bg-orange-500" />
      </div>

      {lowStock.length > 0 && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4">
          <div className="flex items-center gap-2 text-red-700 font-semibold mb-2">
            <AlertTriangle className="w-5 h-5" />
            Low Stock Alerts
          </div>
          <ul className="space-y-1">
            {lowStock.map((p) => (
              <li key={p.id} className="text-sm text-red-600">
                {p.name} — {p.current_stock} {p.unit} (reorder at {p.reorder_level})
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}
