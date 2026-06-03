import { useState, useEffect } from 'react'
import { ipc } from '../lib/ipc'
import { Plus, ShoppingBag, Download } from 'lucide-react'
import { stockPurchaseSchema } from '../lib/schemas'
import { formatCurrency, formatDate } from '../lib/formatters'
import { toast } from 'sonner'
import Pagination from '../components/Pagination'
import Skeleton from '../components/Skeleton'

const LIMIT = 10

export default function StockPurchase() {
  const [products, setProducts] = useState([])
  const [form, setForm] = useState({ product_id: '', qty: '', rate: '', total_cost: '', supplier: '', date: new Date().toISOString().slice(0, 10), weight: '', firm_name: '', location: '', bill_no: '', vehicle_number: '', driver_name: '' })
  const [purchases, setPurchases] = useState([])

  const handleQtyChange = (val) => {
    const qtyNum = parseFloat(val)
    const rateNum = parseFloat(form.rate)
    
    let newTotal = form.total_cost
    if (!isNaN(qtyNum) && !isNaN(rateNum)) {
      newTotal = String(Math.round(qtyNum * rateNum * 100) / 100)
    }
    setForm(f => ({ ...f, qty: val, total_cost: newTotal }))
  }

  const handleRateChange = (val) => {
    const rateNum = parseFloat(val)
    const qtyNum = parseFloat(form.qty)

    let newTotal = form.total_cost
    if (!isNaN(rateNum) && !isNaN(qtyNum)) {
      newTotal = String(Math.round(qtyNum * rateNum * 100) / 100)
    }
    setForm(f => ({ ...f, rate: val, total_cost: newTotal }))
  }

  const handleTotalCostChange = (val) => {
    const totalNum = parseFloat(val)
    const qtyNum = parseFloat(form.qty)

    let newRate = form.rate
    if (!isNaN(totalNum) && !isNaN(qtyNum) && qtyNum > 0) {
      newRate = String(Math.round((totalNum / qtyNum) * 10000) / 10000)
    }
    setForm(f => ({ ...f, total_cost: val, rate: newRate }))
  }
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
      cost_price: form.rate ? Number(form.rate) : (qty > 0 ? totalCost / qty : 0),
      supplier: form.supplier || '',
      firm_name: form.firm_name || '',
      date: form.date,
      weight,
      location: form.location || '',
      bill_no: form.bill_no || '',
      vehicle_number: form.vehicle_number || '',
      driver_name: form.driver_name || '',
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
    setForm({ product_id: singleProductMode && products.length > 0 ? String(products[0].id) : '', qty: '', rate: '', total_cost: '', supplier: '', date: new Date().toISOString().slice(0, 10), weight: '', firm_name: '', location: '', bill_no: '', vehicle_number: '', driver_name: '' })
    setSaving(false)
    setPage(1)
    load()
    toast.success('Stock purchase recorded')
  }

  const handleExportExcel = async () => {
    try {
      const data = await ipc('stock-purchases:list', { limit: 100000 })
      if (!data || data.length === 0) {
        return toast.error('No purchases to export')
      }

      const headers = [
        "Purchase ID", "Date", "Product", "Quantity", "Unit", "Weight (kg)", 
        "Rate (₹)", "Total Cost (₹)", "Supplier", "Firm Name", "Bill No", 
        "Vehicle No", "Driver Name", "Location"
      ]
      const rows = data.map((p) => [
        p.id,
        formatDate(p.date),
        p.product_name,
        p.qty,
        p.unit,
        p.weight > 0 ? p.weight : 0,
        p.cost_price / 100,
        (p.qty * p.cost_price) / 100,
        p.supplier || '',
        p.firm_name || '',
        p.bill_no || '',
        p.vehicle_number || '',
        p.driver_name || '',
        p.location || ''
      ])

      const success = await ipc('app:export-excel', 'Purchase_History', headers, rows)
      if (success) {
        toast.success('Purchase history exported successfully')
      }
    } catch (err) {
      console.error(err)
      toast.error('Failed to export purchase history')
    }
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
            placeholder="Location"
            value={form.location}
            onChange={(e) => setForm({ ...form, location: e.target.value })}
            className="px-3 py-2 border border-gray-300 rounded-lg text-sm"
          />
          <input
            placeholder="Bill No"
            value={form.bill_no}
            onChange={(e) => setForm({ ...form, bill_no: e.target.value })}
            className="px-3 py-2 border border-gray-300 rounded-lg text-sm"
          />
          <input
            placeholder="Vehicle Number"
            value={form.vehicle_number}
            onChange={(e) => setForm({ ...form, vehicle_number: e.target.value })}
            className="px-3 py-2 border border-gray-300 rounded-lg text-sm"
          />
          <input
            placeholder="Driver Name"
            value={form.driver_name}
            onChange={(e) => setForm({ ...form, driver_name: e.target.value })}
            className="px-3 py-2 border border-gray-300 rounded-lg text-sm"
          />
          <input
            type="number"
            step="any"
            placeholder="Quantity"
            value={form.qty}
            onChange={(e) => handleQtyChange(e.target.value)}
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
            step="any"
            placeholder="Rate (₹)"
            value={form.rate}
            onChange={(e) => handleRateChange(e.target.value)}
            required
            className="px-3 py-2 border border-gray-300 rounded-lg text-sm"
          />
          <input
            type="number"
            step="0.01"
            placeholder="Total Cost (₹)"
            value={form.total_cost}
            onChange={(e) => handleTotalCostChange(e.target.value)}
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
        <div className="px-5 py-3 border-b border-gray-200 flex items-center justify-between">
          <span className="font-bold text-gray-700 text-sm">Purchase History</span>
          <button
            type="button"
            onClick={handleExportExcel}
            className="flex items-center gap-1.5 px-3 py-1.5 border border-gray-300 bg-white text-gray-700 hover:bg-gray-50 rounded-xl text-xs font-bold transition-all shadow-sm"
          >
            <Download className="w-3.5 h-3.5" /> Export Excel
          </button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-gray-500 font-bold uppercase text-[10px] tracking-wider">
              <tr>
                <th className="text-left px-5 py-3">Date</th>
                {!singleProductMode && <th className="text-left px-5 py-3">Product</th>}
                <th className="text-right px-5 py-3">Qty</th>
                <th className="text-right px-5 py-3">Rate</th>
                <th className="text-right px-5 py-3">Total Cost</th>
                <th className="text-left px-5 py-3">Location</th>
                <th className="text-left px-5 py-3">Bill No</th>
                <th className="text-left px-5 py-3">Vehicle No</th>
                <th className="text-left px-5 py-3">Driver</th>
                <th className="text-left px-5 py-3">Firm Name</th>
                <th className="text-left px-5 py-3">Supplier</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {loading ? (
                [...Array(5)].map((_, i) => (
                  <tr key={i}><td colSpan={singleProductMode ? 10 : 11} className="px-5 py-3"><Skeleton className="h-6 w-full" /></td></tr>
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
                      <td className="px-5 py-3 text-right text-gray-700 font-semibold">{formatCurrency(p.cost_price)}</td>
                      <td className="px-5 py-3 text-right text-orange-600 font-bold">{formatCurrency(p.qty * p.cost_price)}</td>
                      <td className="px-5 py-3 text-gray-500 italic text-xs whitespace-nowrap">{p.location || '-'}</td>
                      <td className="px-5 py-3 text-gray-500 font-semibold text-xs whitespace-nowrap">{p.bill_no || '-'}</td>
                      <td className="px-5 py-3 text-gray-500 font-medium text-xs whitespace-nowrap">{p.vehicle_number || '-'}</td>
                      <td className="px-5 py-3 text-gray-500 italic text-xs whitespace-nowrap">{p.driver_name || '-'}</td>
                      <td className="px-5 py-3 text-gray-500 italic text-xs">{p.firm_name || '-'}</td>
                      <td className="px-5 py-3 text-gray-500 italic text-xs">{p.supplier || '-'}</td>
                    </tr>
                  ))}
                  {purchases.length === 0 && (
                    <tr><td colSpan={singleProductMode ? 10 : 11} className="text-center py-12 text-gray-400 italic">No purchases recorded</td></tr>
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
