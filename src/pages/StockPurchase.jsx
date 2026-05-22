import { useState, useEffect } from 'react'
import { ipc } from '../lib/ipc'
import { Plus, Trash2 } from 'lucide-react'

export default function StockPurchase() {
  const [products, setProducts] = useState([])
  const [form, setForm] = useState({ product_id: '', qty: '', cost_price: '', supplier: '', date: new Date().toISOString().slice(0, 10) })
  const [purchases, setPurchases] = useState([])

  async function load() {
    setProducts(await ipc('products:list') || [])
    setPurchases(await ipc('stock-purchases:list') || [])
  }

  useEffect(() => { load() }, [])

  const fmt = (n) => `₹${(n / 100).toLocaleString('en-IN')}`

  async function handleSubmit(e) {
    e.preventDefault()
    await ipc('stock-purchases:add', {
      product_id: Number(form.product_id),
      qty: Number(form.qty),
      cost_price: Math.round(Number(form.cost_price) * 100),
      supplier: form.supplier || null,
      date: form.date,
    })
    setForm({ product_id: '', qty: '', cost_price: '', supplier: '', date: new Date().toISOString().slice(0, 10) })
    load()
  }

  return (
    <div className="p-6 space-y-6">
      <h1 className="text-2xl font-bold text-gray-800">Stock Purchase</h1>

      <form onSubmit={handleSubmit} className="bg-white border border-gray-200 rounded-xl p-5 space-y-3">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <select
            value={form.product_id}
            onChange={(e) => setForm({ ...form, product_id: e.target.value })}
            required
            className="px-3 py-2 border border-gray-300 rounded-lg text-sm"
          >
            <option value="">Select product</option>
            {products.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
          <input
            type="date"
            value={form.date}
            onChange={(e) => setForm({ ...form, date: e.target.value })}
            required
            className="px-3 py-2 border border-gray-300 rounded-lg text-sm"
          />
          <input
            type="number"
            step="any"
            placeholder="Quantity"
            value={form.qty}
            onChange={(e) => setForm({ ...form, qty: e.target.value })}
            required
            className="px-3 py-2 border border-gray-300 rounded-lg text-sm"
          />
          <input
            type="number"
            step="0.01"
            placeholder="Cost price per unit (₹)"
            value={form.cost_price}
            onChange={(e) => setForm({ ...form, cost_price: e.target.value })}
            required
            className="px-3 py-2 border border-gray-300 rounded-lg text-sm"
          />
          <input
            placeholder="Supplier"
            value={form.supplier}
            onChange={(e) => setForm({ ...form, supplier: e.target.value })}
            className="px-3 py-2 border border-gray-300 rounded-lg text-sm"
          />
        </div>
        <button type="submit" className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700">
          <Plus className="w-4 h-4" /> Record Purchase
        </button>
      </form>

      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        <div className="px-5 py-3 border-b border-gray-200 font-semibold text-gray-700 text-sm">Purchase History</div>
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-gray-500">
            <tr>
              <th className="text-left px-4 py-2">Date</th>
              <th className="text-left px-4 py-2">Product</th>
              <th className="text-right px-4 py-2">Qty</th>
              <th className="text-right px-4 py-2">Cost</th>
              <th className="text-left px-4 py-2">Supplier</th>
            </tr>
          </thead>
          <tbody>
            {purchases.map((p) => (
              <tr key={p.id} className="border-t border-gray-100">
                <td className="px-4 py-2 text-gray-500">{p.date}</td>
                <td className="px-4 py-2">{p.product_name}</td>
                <td className="px-4 py-2 text-right">{p.qty} {p.unit}</td>
                <td className="px-4 py-2 text-right">{fmt(p.cost_price)}</td>
                <td className="px-4 py-2">{p.supplier || '-'}</td>
              </tr>
            ))}
            {purchases.length === 0 && (
              <tr><td colSpan={5} className="text-center py-8 text-gray-400">No purchases recorded</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
