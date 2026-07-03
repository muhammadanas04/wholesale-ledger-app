import { useState, useEffect } from 'react'
import DatePicker from '../components/DatePicker'
import { ipc } from '../lib/ipc'
import { Plus, ShoppingBag, Download, Trash2, Calendar } from 'lucide-react'
import { stockPurchaseSchema } from '../lib/schemas'
import { formatCurrency, formatDate } from '../lib/formatters'
import { toast } from 'sonner'
import Pagination from '../components/Pagination'
import Skeleton from '../components/Skeleton'
import ConfirmDialog from '../components/ConfirmDialog'
import SuggestionInput from '../components/SuggestionInput'

const LIMIT = 10

export default function StockPurchase() {
  const [products, setProducts] = useState([])
  const [form, setForm] = useState({ product_id: '', qty: '', rate: '', total_cost: '', supplier: '', date: new Date().toISOString().slice(0, 10), weight: '', firm_name: '', location: '', bill_no: '', vehicle_number: '', driver_name: '' })
  const [purchases, setPurchases] = useState([])
  const [suggestions, setSuggestions] = useState({ firmNames: [], suppliers: [], locations: [] })

  const handleQtyChange = (val) => {
    setForm(f => ({ ...f, qty: val }))
  }

  const handleRateChange = (val) => {
    setForm(f => ({ ...f, rate: val }))
  }

  const handleWeightChange = (val) => {
    const weightNum = parseFloat(val) || 0
    const totalNum = parseFloat(form.total_cost) || 0

    let newRate = form.rate
    if (weightNum > 0 && totalNum > 0) {
      newRate = String(Math.round((totalNum / weightNum) * 10000) / 10000)
    } else if (weightNum === 0) {
      newRate = ''
    }
    setForm(f => ({ ...f, weight: val, rate: newRate }))
  }

  const handleTotalCostChange = (val) => {
    const totalNum = parseFloat(val) || 0
    const weightNum = parseFloat(form.weight) || 0

    let newRate = form.rate
    if (weightNum > 0 && totalNum > 0) {
      newRate = String(Math.round((totalNum / weightNum) * 10000) / 10000)
    } else if (weightNum === 0) {
      newRate = ''
    }
    setForm(f => ({ ...f, total_cost: val, rate: newRate }))
  }
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [singleProductMode, setSingleProductMode] = useState(false)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [deleteId, setDeleteId] = useState(null)
  const [showRateField, setShowRateField] = useState(true)

  const [adjProductId, setAdjProductId] = useState('')
  const [adjStock, setAdjStock] = useState('')
  const [adjusting, setAdjusting] = useState(false)

  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')

  async function load() {
    setLoading(true)
    const hasFilter = dateFrom || dateTo
    const filters = {
      limit: hasFilter ? 100000 : 50,
      offset: 0,
      date_from: dateFrom || null,
      date_to: dateTo || null
    }
    const [prods, data, count, singleProductVal, rateFieldVal, suggestionsData] = await Promise.all([
      ipc('products:list', { limit: 1000 }),
      ipc('stock-purchases:list', filters),
      ipc('stock-purchases:count', { date_from: dateFrom || null, date_to: dateTo || null }),
      ipc('meta:get', 'single_product_mode'),
      ipc('meta:get', 'show_rate_field'),
      ipc('stock-purchases:suggestions')
    ])
    const isSingleProduct = singleProductVal === 'true'
    setSingleProductMode(isSingleProduct)
    setShowRateField(rateFieldVal !== 'false')
    const productsList = prods || []
    setProducts(productsList)
    setPurchases(data || [])
    setSuggestions(suggestionsData || { firmNames: [], suppliers: [], locations: [] })
    setTotal(1)

    if (isSingleProduct && productsList.length > 0) {
      setForm(f => ({ ...f, product_id: String(productsList[0].id) }))
      setAdjProductId(String(productsList[0].id))
      setAdjStock(String(productsList[0].current_stock))
    } else {
      setAdjProductId('')
      setAdjStock('')
    }

    setLoading(false)
  }

  useEffect(() => { load() }, [page, dateFrom, dateTo])

  async function handleSubmit(e) {
    e.preventDefault()

    const qty = Number(form.qty) || 0
    const totalCost = Number(form.total_cost) || 0
    const weight = form.weight ? Number(form.weight) : null

    const purchaseData = {
      product_id: Number(form.product_id),
      qty,
      cost_price: form.rate ? Number(form.rate) : (weight > 0 ? totalCost / weight : 0),
      total_cost: totalCost,
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
      total_cost: Math.round(purchaseData.total_cost * 100),
    })
    setForm({ product_id: singleProductMode && products.length > 0 ? String(products[0].id) : '', qty: '', rate: '', total_cost: '', supplier: '', date: new Date().toISOString().slice(0, 10), weight: '', firm_name: '', location: '', bill_no: '', vehicle_number: '', driver_name: '' })
    setSaving(false)
    setPage(1)
    load()
    toast.success('Stock purchase recorded')
  }

  const handleExportExcel = async () => {
    try {
      const data = await ipc('stock-purchases:list', {
        limit: 100000,
        date_from: dateFrom || null,
        date_to: dateTo || null
      })
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
        p.weight > 0 ? (p.total_cost / p.weight) / 100 : '',
        p.total_cost !== null && p.total_cost !== undefined ? p.total_cost / 100 : (p.weight > 0 ? p.weight * p.cost_price : p.qty * p.cost_price) / 100,
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

  async function confirmDelete(id) {
    setDeleteId(id)
    setConfirmOpen(true)
  }

  async function handleDelete() {
    try {
      await ipc('stock-purchases:delete', deleteId)
      setConfirmOpen(false)
      setPage(1)
      load()
      toast.success('Stock purchase deleted and stock level reverted')
    } catch (e) {
      console.error(e)
      toast.error('Failed to delete stock purchase')
    }
  }

  const handleAdjustStock = async (e) => {
    e.preventDefault()
    if (!adjProductId) {
      return toast.error('Please select a product')
    }
    if (adjStock === '') {
      return toast.error('Please enter a stock value')
    }

    setAdjusting(true)
    try {
      await ipc('products:adjust-stock', Number(adjProductId), Number(adjStock))
      toast.success('Stock adjusted successfully')
      load()
    } catch (err) {
      console.error(err)
      toast.error('Failed to adjust stock')
    } finally {
      setAdjusting(false)
    }
  }

  const isRateIncorrect = (() => {
    const w = parseFloat(form.weight) || 0
    const tc = parseFloat(form.total_cost) || 0
    const r = parseFloat(form.rate) || 0
    return w > 0 && tc > 0 && r > 0 && Math.abs(w * r - tc) >= 0.01
  })()

  const purchasesQtyTotal = purchases.reduce((sum, p) => sum + (Number(p.qty) || 0), 0)
  const purchasesWeightTotal = purchases.reduce((sum, p) => sum + (Number(p.weight) || 0), 0)
  const purchasesTotalCost = purchases.reduce((sum, p) => sum + (p.total_cost !== null && p.total_cost !== undefined ? p.total_cost : (p.weight > 0 ? p.weight * p.cost_price : p.qty * p.cost_price)), 0)

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center gap-2">
        <ShoppingBag className="w-6 h-6 text-gray-700" />
        <h1 className="text-2xl font-bold text-gray-800">Stock Purchase</h1>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <form onSubmit={handleSubmit} className="lg:col-span-2 bg-white border border-gray-200 rounded-xl p-5 space-y-3 shadow-sm flex flex-col justify-between">
          <div>
            <h2 className="font-bold text-gray-800 text-sm uppercase tracking-wider mb-3">Record Stock Purchase</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {singleProductMode ? (
                <div className="px-3 py-2 border border-gray-200 bg-gray-50 rounded-lg text-sm text-gray-650 font-semibold flex items-center">
                  {products[0] ? `${products[0].name} (${products[0].current_stock} ${products[0].unit} in stock)` : 'Product'}
                </div>
              ) : (
                <select
                  value={form.product_id}
                  onChange={(e) => setForm({ ...form, product_id: e.target.value })}
                  required
                  className="px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">Select product</option>
                  {products.map((p) => <option key={p.id} value={p.id}>{p.name} ({p.current_stock} {p.unit} in stock)</option>)}
                </select>
              )}
              <DatePicker
                value={form.date}
                onChange={(e) => setForm({ ...form, date: e.target.value })}
                required
                className="px-3 py-2 border border-gray-300 rounded-lg text-sm cursor-pointer focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <SuggestionInput
                placeholder="Firm Name"
                value={form.firm_name}
                onChange={(val) => setForm({ ...form, firm_name: val })}
                suggestions={suggestions.firmNames}
                className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <SuggestionInput
                placeholder="Supplier"
                value={form.supplier}
                onChange={(val) => setForm({ ...form, supplier: val })}
                suggestions={suggestions.suppliers}
                className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <SuggestionInput
                placeholder="Location"
                value={form.location}
                onChange={(val) => setForm({ ...form, location: val })}
                suggestions={suggestions.locations}
                className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <input
                placeholder="Bill No"
                value={form.bill_no}
                onChange={(e) => setForm({ ...form, bill_no: e.target.value })}
                className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <input
                placeholder="Vehicle Number"
                value={form.vehicle_number}
                onChange={(e) => setForm({ ...form, vehicle_number: e.target.value })}
                className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <input
                placeholder="Driver Name"
                value={form.driver_name}
                onChange={(e) => setForm({ ...form, driver_name: e.target.value })}
                className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <input
                type="number"
                step="any"
                placeholder="Quantity"
                value={form.qty}
                onChange={(e) => handleQtyChange(e.target.value)}
                required
                className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <input
                type="number"
                step="any"
                placeholder="Weight (optional)"
                value={form.weight}
                onChange={(e) => handleWeightChange(e.target.value)}
                className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              {showRateField && (
                <input
                  type="number"
                  step="any"
                  placeholder="Rate (₹)"
                  value={form.rate}
                  onChange={(e) => handleRateChange(e.target.value)}
                  className={`px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 ${isRateIncorrect
                    ? 'border-red-500 focus:ring-red-500 focus:border-red-500 border-2'
                    : 'border-gray-300 focus:ring-blue-500'
                    }`}
                />
              )}
              <input
                type="number"
                step="any"
                placeholder="Total Cost (₹)"
                value={form.total_cost}
                onChange={(e) => handleTotalCostChange(e.target.value)}
                required
                className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>
          <button
            type="submit"
            disabled={saving}
            className="flex items-center justify-center gap-2 px-4 py-2.5 bg-blue-600 text-white rounded-lg text-sm font-bold hover:bg-blue-700 disabled:opacity-50 shadow-sm transition-all mt-4 self-start"
          >
            <Plus className="w-4 h-4" /> {saving ? 'Recording...' : 'Record Purchase'}
          </button>
        </form>

        <form onSubmit={handleAdjustStock} className="bg-white border border-gray-200 rounded-xl p-5 shadow-sm flex flex-col justify-between">
          <div>
            <h2 className="font-bold text-gray-800 text-sm uppercase tracking-wider mb-2">Adjust Current Stock</h2>
            <p className="text-xs text-gray-400 mb-4">Directly overwrite the physical inventory level for a product.</p>
            <div className="space-y-4">
              {singleProductMode ? (
                <div className="px-3 py-2 border border-gray-200 bg-gray-50 rounded-lg text-sm text-gray-650 font-bold h-[38px] flex items-center">
                  {products[0] ? `${products[0].name}` : 'Product'}
                </div>
              ) : (
                <div className="space-y-1">
                  <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-wider">Select Product</label>
                  <select
                    value={adjProductId}
                    onChange={(e) => {
                      setAdjProductId(e.target.value)
                      const p = products.find(prod => String(prod.id) === e.target.value)
                      setAdjStock(p ? String(p.current_stock) : '')
                    }}
                    required
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 h-[38px]"
                  >
                    <option value="">Select product</option>
                    {products.map((p) => <option key={p.id} value={p.id}>{p.name} ({p.current_stock} {p.unit} in stock)</option>)}
                  </select>
                </div>
              )}
              <div className="space-y-1">
                <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-wider">New Stock Value</label>
                <input
                  type="number"
                  step="any"
                  placeholder="0.00"
                  value={adjStock}
                  onChange={(e) => setAdjStock(e.target.value)}
                  required
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-blue-500 h-[38px]"
                />
              </div>
            </div>
          </div>
          <button
            type="submit"
            disabled={adjusting}
            className="w-full py-2.5 bg-gray-800 hover:bg-gray-950 text-white rounded-lg text-sm font-bold uppercase tracking-wider shadow-sm transition-all mt-6"
          >
            {adjusting ? 'Updating...' : 'Update Stock'}
          </button>
        </form>
      </div>

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
        <div className="px-5 py-2.5 bg-gray-50 border-b border-gray-150 flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2">
            <Calendar className="w-4 h-4 text-gray-450 shrink-0" />
            <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Filter Date:</span>
            <DatePicker
              value={dateFrom}
              onChange={(e) => { setDateFrom(e.target.value); setPage(1); }}
              className="px-2.5 py-1 border border-gray-300 rounded-xl text-xs cursor-pointer focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white font-semibold text-slate-800"
            />
            <span className="text-xs font-bold text-gray-400">to</span>
            <DatePicker
              value={dateTo}
              onChange={(e) => { setDateTo(e.target.value); setPage(1); }}
              className="px-2.5 py-1 border border-gray-300 rounded-xl text-xs cursor-pointer focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white font-semibold text-slate-800"
            />
            {(dateFrom || dateTo) && (
              <button
                type="button"
                onClick={() => { setDateFrom(''); setDateTo(''); setPage(1); }}
                className="px-3 py-1 bg-red-50 hover:bg-red-100 text-red-650 hover:text-red-700 rounded-xl text-xs font-bold transition-colors uppercase tracking-wider shadow-sm"
              >
                Clear
              </button>
            )}
          </div>
        </div>
        <div className="overflow-auto max-h-[calc(100vh-200px)]">
          <table className="w-full text-sm relative">
            <thead className="sticky top-0 z-10 bg-gray-50 text-gray-500 font-bold uppercase text-[10px] tracking-wider shadow-[0_1px_0_0_#e5e7eb]">
              <tr>
                <th className="text-left px-5 py-3">Date</th>
                {!singleProductMode && <th className="text-left px-5 py-3">Product</th>}
                <th className="text-right px-5 py-3">Qty</th>
                {showRateField && <th className="text-right px-5 py-3">Rate</th>}
                <th className="text-right px-5 py-3">Total Cost</th>
                <th className="text-left px-5 py-3">Location</th>
                <th className="text-left px-5 py-3">Bill No</th>
                <th className="text-left px-5 py-3">Vehicle No</th>
                <th className="text-left px-5 py-3">Driver</th>
                <th className="text-left px-5 py-3">Firm Name</th>
                <th className="text-left px-5 py-3">Supplier</th>
                <th className="text-center px-5 py-3">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {loading ? (
                [...Array(5)].map((_, i) => (
                  <tr key={i}><td colSpan={singleProductMode ? (showRateField ? 11 : 10) : (showRateField ? 12 : 11)} className="px-5 py-3"><Skeleton className="h-6 w-full" /></td></tr>
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
                      {showRateField && (
                        <td className="px-5 py-3 text-right text-gray-700 font-semibold">
                          {p.weight > 0 ? formatCurrency(p.total_cost / p.weight) : '-'}
                        </td>
                      )}
                      <td className="px-5 py-3 text-right text-orange-600 font-bold">
                        {p.total_cost !== null && p.total_cost !== undefined ? formatCurrency(p.total_cost) : formatCurrency(p.qty * p.cost_price)}
                      </td>
                      <td className="px-5 py-3 text-gray-500 italic text-xs whitespace-nowrap">{p.location || '-'}</td>
                      <td className="px-5 py-3 text-gray-500 font-semibold text-xs whitespace-nowrap">{p.bill_no || '-'}</td>
                      <td className="px-5 py-3 text-gray-500 font-medium text-xs whitespace-nowrap">{p.vehicle_number || '-'}</td>
                      <td className="px-5 py-3 text-gray-500 italic text-xs whitespace-nowrap">{p.driver_name || '-'}</td>
                      <td className="px-5 py-3 text-gray-500 italic text-xs">{p.firm_name || '-'}</td>
                      <td className="px-5 py-3 text-gray-500 italic text-xs">{p.supplier || '-'}</td>
                      <td className="px-5 py-3 text-center">
                        <button
                          type="button"
                          onClick={() => confirmDelete(p.id)}
                          className="p-1.5 text-red-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </td>
                    </tr>
                  ))}
                  {purchases.length === 0 && (
                    <tr><td colSpan={singleProductMode ? (showRateField ? 11 : 10) : (showRateField ? 12 : 11)} className="text-center py-12 text-gray-400 italic">No purchases recorded</td></tr>
                  )}
                </>
              )}
            </tbody>
            {!loading && purchases.length > 0 && (
              <tfoot className="bg-gray-50 border-t-2 border-gray-200 text-xs font-bold text-gray-700">
                <tr>
                  <td className="px-5 py-3 text-gray-900 font-black uppercase tracking-wider" colSpan={singleProductMode ? 1 : 2}>
                    Total
                  </td>
                  <td className="px-5 py-3 text-right font-bold text-gray-900 whitespace-nowrap">
                    <div>{purchasesQtyTotal.toLocaleString('en-IN', { maximumFractionDigits: 2 })}</div>
                    {purchasesWeightTotal > 0 && (
                      <div className="text-[10px] text-gray-400 font-bold lowercase tracking-normal">
                        {purchasesWeightTotal.toLocaleString('en-IN', { maximumFractionDigits: 2 })} kg
                      </div>
                    )}
                  </td>
                  {showRateField && (
                    <td className="px-5 py-3 text-right font-bold text-gray-900 whitespace-nowrap">
                      {purchasesWeightTotal > 0 ? formatCurrency(purchasesTotalCost / purchasesWeightTotal) : '-'}
                    </td>
                  )}
                  <td className="px-5 py-3 text-right font-bold text-orange-600 whitespace-nowrap">
                    {formatCurrency(purchasesTotalCost)}
                  </td>
                  <td colSpan={7}></td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>

      <ConfirmDialog
        isOpen={confirmOpen}
        title="Delete Stock Purchase?"
        message="This will delete the stock purchase record and deduct the purchase quantity from the product inventory. Are you sure?"
        onConfirm={handleDelete}
        onCancel={() => setConfirmOpen(false)}
        confirmText="Delete Purchase"
      />
    </div>
  )
}
