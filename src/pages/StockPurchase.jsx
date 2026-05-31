import { useState, useEffect } from 'react'
import { ipc } from '../lib/ipc'
import { Plus, ShoppingBag } from 'lucide-react'
import { stockPurchaseSchema } from '../lib/schemas'
import { formatCurrency, formatDate } from '../lib/formatters'
import { toast } from 'sonner'
import Pagination from '../components/Pagination'
import Skeleton from '../components/Skeleton'

const LIMIT = 10

export default function StockPurchase() {
  const [products, setProducts] = useState([])
  const [form, setForm] = useState({ product_id: '', qty: '', total_cost: '', supplier: '', date: new Date().toISOString().slice(0, 10), weight: '', firm_name: '' })
  const [purchases, setPurchases] = useState([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [singleProductMode, setSingleProductMode] = useState(false)

  async function load() {
    setLoading(true)
    const offset = (page - 1) * LIMIT
    const [prods, data, count, singleProductVal] = await Promise.all([
      ipc('products:list', { limit: 1000 }),
      ipc('stock-purchases:list', { limit: LIMIT, offset }),
      ipc('stock-purchases:count'),
      ipc('meta:get', 'single_product_mode')
    ])
    const isSingleProduct = singleProductVal === 'true'
    setSingleProductMode(isSingleProduct)
    const productsList = prods || []
    setProducts(productsList)
    setPurchases(data || [])
    setTotal(Math.ceil((count || 0) / LIMIT))

    if (isSingleProduct && productsList.length > 0) {
      setForm(f => ({ ...f, product_id: String(productsList[0].id) }))
    }

    setLoading(false)
  }

  useEffect(() => { load() }, [page])

  async function handleSubmit(e) {
    e.preventDefault()

    const qty = Number(form.qty) || 0
    const totalCost = Number(form.total_cost) || 0
    const weight = form.weight ? Number(form.weight) : null

    const purchaseData = {
      product_id: Number(form.product_id),
      qty,
      cost_price: qty > 0 ? totalCost / qty : 0,
      supplier: form.supplier || '',
      firm_name: form.firm_name || '',
      date: form.date,
      weight,
    }

    const result = stockPurchaseSchema.safeParse(purchaseData)
    if (!result.success) {
      return toast.error(result.error.errors[0].message)
    }

    setSaving(true)
    await ipc('stock-purchases:add', {
      ...purchaseData,
      cost_price: Math.round(purchaseData.cost_price * 100),
    })
    setForm({ product_id: singleProductMode && products.length > 0 ? String(products[0].id) : '', qty: '', total_cost: '', supplier: '', date: new Date().toISOString().slice(0, 10), weight: '', firm_name: '' })
    setSaving(false)
    setPage(1)
    load()
    toast.success('Stock purchase recorded')
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center gap-2">
        <ShoppingBag className="w-6 h-6 text-gray-700" />
        <h1 className="text-2xl font-bold text-gray-800">Stock Purchase</h1>
      </div>

      <form onSubmit={handleSubmit} className="bg-white border border-gray-200 rounded-xl p-5 space-y-3 shadow-sm">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {singleProductMode ? (
            <div className="px-3 py-2 border border-gray-200 bg-gray-50 rounded-lg text-sm text-gray-600 font-medium flex items-center">
              {products[0] ? `${products[0].name} (${products[0].current_stock} ${products[0].unit} in stock)` : 'Product'}
            </div>
          ) : (
            <select
              value={form.product_id}
              onChange={(e) => setForm({ ...form, product_id: e.target.value })}
              required
              className="px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white"
            >
              <option value="">Select product</option>
              {products.map((p) => <option key={p.id} value={p.id}>{p.name} ({p.current_stock} {p.unit} in stock)</option>)}
            </select>
          )}
          <input
            type="date"
            value={form.date}
            onChange={(e) => setForm({ ...form, date: e.target.value })}
            onClick={(e) => {
              try {
                e.target.showPicker()
              } catch (err) {
                console.error(err)
              }
            }}
            required
            className="px-3 py-2 border border-gray-300 rounded-lg text-sm cursor-pointer"
          />
          <input
            placeholder="Firm Name"
            value={form.firm_name}
            onChange={(e) => setForm({ ...form, firm_name: e.target.value })}
            className="px-3 py-2 border border-gray-300 rounded-lg text-sm"
          />
          <input
            placeholder="Supplier"
            value={form.supplier}
            onChange={(e) => setForm({ ...form, supplier: e.target.value })}
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
            step="any"
            placeholder="Weight (optional)"
            value={form.weight}
            onChange={(e) => setForm({ ...form, weight: e.target.value })}
            className="px-3 py-2 border border-gray-300 rounded-lg text-sm"
          />
          <input
            type="number"
            step="0.01"
            placeholder="Total Cost (₹)"
            value={form.total_cost}
            onChange={(e) => setForm({ ...form, total_cost: e.target.value })}
            required
            className="px-3 py-2 border border-gray-300 rounded-lg text-sm"
          />

        </div>
        <button
          type="submit"
          disabled={saving}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-bold hover:bg-blue-700 disabled:opacity-50 shadow-sm transition-all"
        >
          <Plus className="w-4 h-4" /> {saving ? 'Recording...' : 'Record Purchase'}
        </button>
      </form>

      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden shadow-sm">
        <div className="px-5 py-3 border-b border-gray-200 font-bold text-gray-700 text-sm">Purchase History</div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-gray-500 font-bold uppercase text-[10px] tracking-wider">
              <tr>
                <th className="text-left px-5 py-3">Date</th>
                {!singleProductMode && <th className="text-left px-5 py-3">Product</th>}
                <th className="text-right px-5 py-3">Qty</th>
                <th className="text-right px-5 py-3">Total Cost</th>
                <th className="text-left px-5 py-3">Firm Name</th>
                <th className="text-left px-5 py-3">Supplier</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {loading ? (
                [...Array(5)].map((_, i) => (
                  <tr key={i}><td colSpan={singleProductMode ? 5 : 6} className="px-5 py-3"><Skeleton className="h-6 w-full" /></td></tr>
                ))
              ) : (
                <>
                  {purchases.map((p) => (
                    <tr key={p.id} className="hover:bg-gray-50 transition-colors">
                      <td className="px-5 py-3 text-gray-500 whitespace-nowrap">{formatDate(p.date)}</td>
                      {!singleProductMode && <td className="px-5 py-3 font-medium text-gray-800">{p.product_name}</td>}
                      <td className="px-5 py-3 text-right font-bold">
                        <div>{p.qty} <span className="text-[10px] text-gray-400 uppercase">{p.unit}</span></div>
                        {p.weight > 0 && (
                          <div className="text-[10px] text-gray-400 font-bold lowercase tracking-normal">
                            {p.weight} kg
                          </div>
                        )}
                      </td>
                      <td className="px-5 py-3 text-right text-orange-600 font-bold">{formatCurrency(p.qty * p.cost_price)}</td>
                      <td className="px-5 py-3 text-gray-500 italic text-xs">{p.firm_name || '-'}</td>
                      <td className="px-5 py-3 text-gray-500 italic text-xs">{p.supplier || '-'}</td>
                    </tr>
                  ))}
                  {purchases.length === 0 && (
                    <tr><td colSpan={singleProductMode ? 5 : 6} className="text-center py-12 text-gray-400 italic">No purchases recorded</td></tr>
                  )}
                </>
              )}
            </tbody>
          </table>
        </div>
        <Pagination current={page} total={total} onPageChange={setPage} />
      </div>
    </div>
  )
}
