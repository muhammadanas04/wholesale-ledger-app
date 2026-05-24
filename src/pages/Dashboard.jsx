import { useState, useEffect } from 'react'
import { ipc } from '../lib/ipc'
import { IndianRupee, Package, Users, AlertTriangle, TrendingUp } from 'lucide-react'
import { formatCurrency } from '../lib/formatters'
import Skeleton from '../components/Skeleton'

function StatCard({ icon: Icon, label, value, color, loading }) {
  return (
    <div className="bg-white rounded-2xl border border-gray-200 p-6 shadow-sm flex items-center gap-5 transition-all hover:border-blue-200">
      <div className={`p-4 rounded-2xl shadow-sm ${color}`}>
        <Icon className="w-8 h-8 text-white" />
      </div>
      <div className="flex-1">
        <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">{label}</p>
        {loading ? (
          <Skeleton className="h-8 w-24" />
        ) : (
          <p className="text-2xl font-black text-gray-900 tracking-tighter">{value}</p>
        )}
      </div>
    </div>
  )
}

export default function Dashboard() {
  const [stats, setStats] = useState({ sales: 0, stockValue: 0, balance: 0 })
  const [lowStock, setLowStock] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      setLoading(true)
      const today = new Date().toISOString().slice(0, 10)
      const [sales, stockVal, customers, low] = await Promise.all([
        ipc('reports:sales-range', today, today),
        ipc('reports:inventory-value'),
        ipc('customers:list', { limit: 1000 }),
        ipc('products:low-stock')
      ])

      const totalSales = (sales || []).reduce((s, r) => s + r.total_amount, 0)
      const totalBalance = (customers || []).reduce((s, c) => s + c.balance, 0)

      setStats({ sales: totalSales, stockValue: stockVal || 0, balance: totalBalance })
      setLowStock(low || [])
      setLoading(false)
    }
    load()
  }, [])

  return (
    <div className="p-6 space-y-8">
      <div className="flex items-center gap-3">
        <TrendingUp className="w-8 h-8 text-blue-600" />
        <h1 className="text-3xl font-black text-gray-900 tracking-tight">Overview</h1>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <StatCard icon={IndianRupee} label="Today's Sales" value={formatCurrency(stats.sales)} color="bg-emerald-500" loading={loading} />
        <StatCard icon={Package} label="Stock Value" value={formatCurrency(stats.stockValue)} color="bg-blue-600" loading={loading} />
        <StatCard icon={Users} label="Pending Balance" value={formatCurrency(stats.balance)} color="bg-orange-500" loading={loading} />
      </div>

      {lowStock.length > 0 && (
        <div className="bg-red-50 border border-red-100 rounded-3xl p-6 shadow-sm">
          <div className="flex items-center gap-3 text-red-700 font-black uppercase text-xs tracking-widest mb-4">
            <AlertTriangle className="w-5 h-5" />
            Stock Depletion Alerts
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {lowStock.map((p) => (
              <div key={p.id} className="bg-white border border-red-200 rounded-2xl p-4 flex items-center justify-between">
                <div>
                  <p className="font-bold text-gray-800">{p.name}</p>
                  <p className="text-[10px] font-bold text-gray-400 uppercase mt-1">Reorder at {p.reorder_level} {p.unit}</p>
                </div>
                <div className="text-right">
                  <p className="text-lg font-black text-red-600 tracking-tighter">{p.current_stock}</p>
                  <p className="text-[10px] font-bold text-red-400 uppercase">{p.unit}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
