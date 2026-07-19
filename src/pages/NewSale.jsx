import { useState, useEffect } from 'react'
import DatePicker from '../components/DatePicker'
import CustomerSelect from '../components/CustomerSelect'
import BulkEntryModal from '../components/BulkEntryModal'
import { ipc } from '../lib/ipc'
import { Plus, Trash2, ShoppingCart, Download, Calendar, Layers } from 'lucide-react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { saleSchema } from '../lib/schemas'
import { toast } from 'sonner'
import { formatDate } from '../lib/formatters'
import { Pencil } from 'lucide-react'

export default function NewSale() {
  const { id } = useParams()
  const navigate = useNavigate()
  const isEditMode = !!id

  const [customers, setCustomers] = useState([])
  const [products, setProducts] = useState([])
  const [customerId, setCustomerId] = useState('')
  const [date, setDate] = useState(() => sessionStorage.getItem('lastSelectedSaleDate') || new Date().toISOString().slice(0, 10))
  const [notes, setNotes] = useState('')
  const [items, setItems] = useState([{ product_id: '', qty: '', rate: '', total_price: '', weight: '' }])
  const [saving, setSaving] = useState(false)
  const [roundingConfig, setRoundingConfig] = useState(null)
  const [recentSales, setRecentSales] = useState([])
  const [discount, setDiscount] = useState('')
  const [finalValue, setFinalValue] = useState('')
  const [singleProductMode, setSingleProductMode] = useState(false)
  const [showRateField, setShowRateField] = useState(true)
  const [showBulkEntry, setShowBulkEntry] = useState(false)

  // Calculate raw subtotal of items in Rupees
  const subtotal = items.reduce((s, item) => {
    const price = Number(item.total_price) || 0
    return s + price
  }, 0)

  const itemsQtyTotal = items.reduce((sum, item) => sum + (Number(item.qty) || 0), 0)
  const itemsWeightTotal = items.reduce((sum, item) => sum + (Number(item.weight) || 0), 0)

  const recentQtyTotal = recentSales.reduce((sum, s) => sum + (Number(s.qty) || 0), 0)
  const recentWeightTotal = recentSales.reduce((sum, s) => sum + (Number(s.weight) || 0), 0)
  const recentSubtotal = recentSales.reduce((sum, s) => sum + (Number(s.total_amount) || 0), 0)
  const recentDiscountTotal = recentSales.reduce((sum, s) => sum + (Number(s.discount) || 0), 0)
  const recentFinalTotal = recentSubtotal - recentDiscountTotal

  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')

  async function loadRecentSales() {
    try {
      const hasFilter = dateFrom || dateTo
      const list = await ipc('sales:list', {
        limit: hasFilter ? 100000 : 50,
        date_from: dateFrom || null,
        date_to: dateTo || null
      })
      setRecentSales(list || [])
    } catch (e) {
      console.error('Failed to load recent sales:', e)
    }
  }

  useEffect(() => {
    loadRecentSales()
  }, [dateFrom, dateTo])

  useEffect(() => {
    async function load() {
      const prods = await ipc('products:list', { limit: 1000 }) || []
      setCustomers(await ipc('customers:list', { limit: 100000 }) || [])
      setProducts(prods)

      const singleProductVal = await ipc('meta:get', 'single_product_mode')
      const isSingleProduct = singleProductVal === 'true'
      setSingleProductMode(isSingleProduct)

      if (isSingleProduct && prods.length > 0 && !isEditMode) {
        setItems([{ product_id: String(prods[0].id), qty: '', rate: '', total_price: '', weight: '' }])
      }

      const rulesVal = await ipc('meta:get', 'rounding_rules')
      if (rulesVal) {
        try {
          setRoundingConfig(JSON.parse(rulesVal))
        } catch (e) {
          console.error('Failed to parse rounding rules:', e)
        }
      }

      const rateFieldVal = await ipc('meta:get', 'show_rate_field')
      setShowRateField(rateFieldVal !== 'false')

      if (isEditMode) {
        try {
          const sale = await ipc('sales:get', Number(id))
          if (sale) {
            setCustomerId(String(sale.customer_id))
            setDate(sale.date)
            setNotes(sale.notes || '')
            setDiscount(sale.discount ? (sale.discount / 100).toFixed(2) : '')

            setItems(sale.items.map(item => ({
              product_id: String(item.product_id),
              qty: String(item.qty),
              rate: String(item.unit_price / 100),
              total_price: item.total_price !== null && item.total_price !== undefined
                ? (item.total_price / 100).toFixed(2)
                : ((item.weight > 0 ? item.weight * item.unit_price : item.qty * item.unit_price) / 100).toFixed(2),
              weight: item.weight ? String(item.weight) : ''
            })))
          } else {
            toast.error('Sale not found')
            navigate('/new-sale')
          }
        } catch (e) {
          console.error(e)
          toast.error('Failed to load sale details')
        }
      }
    }
    load()
  }, [id])

  // Bi-directional auto-calculation: when subtotal changes, adjust discount or finalValue
  useEffect(() => {
    if (discount !== '') {
      const d = Number(discount) || 0
      const f = Math.max(0, subtotal - d)
      setFinalValue(f > 0 ? f.toFixed(2) : '')
    } else if (finalValue !== '') {
      const f = Number(finalValue) || 0
      const d = Math.max(0, subtotal - f)
      setDiscount(d > 0 ? d.toFixed(2) : '')
    }
  }, [subtotal])

  const handleDiscountChange = (val) => {
    setDiscount(val)
    if (val === '') {
      setFinalValue('')
    } else {
      const d = Number(val) || 0
      const f = Math.max(0, subtotal - d)
      setFinalValue(f > 0 ? f.toFixed(2) : '')
    }
  }

  const handleFinalValueChange = (val) => {
    setFinalValue(val)
    if (val === '') {
      setDiscount('')
    } else {
      const f = Number(val) || 0
      const d = Math.max(0, subtotal - f)
      setDiscount(d > 0 ? d.toFixed(2) : '')
    }
  }

  function addItem() {
    setItems([...items, { product_id: singleProductMode && products.length > 0 ? String(products[0].id) : '', qty: '', rate: '', total_price: '', weight: '' }])
  }

  function removeItem(i) {
    setItems(items.filter((_, idx) => idx !== i))
  }

  function updateItem(i, field, value) {
    const next = [...items]
    const item = { ...next[i], [field]: value }

    const w = parseFloat(item.weight) || 0
    const tp = parseFloat(item.total_price) || 0
    const r = parseFloat(item.rate) || 0

    if (w > 0 && tp > 0 && (field === 'weight' || field === 'total_price' || !item.rate || r === 0)) {
      item.rate = String(Math.round((tp / w) * 10000) / 10000)
    } else if (w === 0) {
      item.rate = ''
    }

    next[i] = item
    setItems(next)
  }

  const fmt = (n) => `₹${(n / 100).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

  async function handleSubmit(e) {
    e.preventDefault()

    const saleData = {
      customer_id: Number(customerId),
      date,
      notes: notes || null,
      discount: !roundingConfig?.enabled && discount ? Number(discount) : 0,
      items: items.map((i) => {
        const qty = Number(i.qty) || 0
        const totalPrice = Number(i.total_price) || 0
        const rate = Number(i.rate) || 0
        const weight = i.weight ? Number(i.weight) : null
        return {
          product_id: Number(i.product_id),
          qty,
          unit_price: rate > 0 ? rate : (weight > 0 ? totalPrice / weight : 0),
          total_price: totalPrice,
          weight,
        }
      }),
    }

    const result = saleSchema.safeParse(saleData)
    if (!result.success) {
      return toast.error(result.error.errors[0].message)
    }

    setSaving(true)
    const finalData = {
      ...saleData,
      total_amount: Math.round(subtotal * 100),
      discount: Math.round((saleData.discount || 0) * 100),
      items: saleData.items.map(i => ({
        ...i,
        unit_price: Math.round(i.unit_price * 100),
        total_price: Math.round(i.total_price * 100)
      }))
    }

    try {
      if (isEditMode) {
        await ipc('sales:update', Number(id), finalData)
        toast.success('Sale updated successfully')
        navigate(`/customers/${customerId}`)
      } else {
        await ipc('sales:add', finalData)
        toast.success('Sale saved successfully')
        setCustomerId('')
        setNotes('')
        setItems([{ product_id: singleProductMode && products.length > 0 ? String(products[0].id) : '', qty: '', rate: '', total_price: '', weight: '' }])
        setDiscount('')
        setFinalValue('')
        loadRecentSales()
      }
    } catch (err) {
      console.error(err)
      toast.error(isEditMode ? 'Failed to update sale' : 'Failed to save sale')
    } finally {
      setSaving(false)
    }
  }

  const handleExportExcel = async () => {
    try {
      if (!recentSales || recentSales.length === 0) {
        return toast.error('No sales to export')
      }

      const headers = ["Sale ID", "Date", "Customer Name", "Quantity", "Weight (kg)", "Original Value (₹)", "Discount (₹)", "Final Value (₹)", "Notes"]
      const rows = recentSales.map((sale) => [
        sale.id,
        formatDate(sale.date),
        sale.customer_name,
        sale.qty > 0 ? sale.qty : 0,
        sale.weight > 0 ? sale.weight : 0,
        sale.total_amount / 100,
        (sale.discount || 0) / 100,
        (sale.total_amount - (sale.discount || 0)) / 100,
        sale.notes || ''
      ])

      const success = await ipc('app:export-excel', 'Recent_Sales_History', headers, rows)
      if (success) {
        toast.success('Recent sales history exported successfully')
      }
    } catch (err) {
      console.error(err)
      toast.error('Failed to export recent sales')
    }
  }

  const isSingleRateIncorrect = (() => {
    const item = items[0]
    if (!item) return false
    const w = parseFloat(item.weight) || 0
    const tp = parseFloat(item.total_price) || 0
    const r = parseFloat(item.rate) || 0
    return w > 0 && tp > 0 && r > 0 && Math.abs(w * r - tp) >= 0.01
  })()

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <ShoppingCart className="w-6 h-6 text-gray-700" />
          <h1 className="text-2xl font-bold text-gray-800">
            {isEditMode ? `Edit Sale #${id}` : 'New Sale'}
          </h1>
        </div>
        {!isEditMode && (
          <button
            type="button"
            onClick={() => setShowBulkEntry(true)}
            className="flex items-center gap-2 px-4 py-2.5 bg-gradient-to-r from-indigo-600 to-blue-600 text-white hover:from-indigo-700 hover:to-blue-700 rounded-xl text-xs font-bold uppercase tracking-wider transition-all shadow-md"
          >
            <Layers className="w-4 h-4" />
            Bulk Entry
          </button>
        )}
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="bg-white border border-gray-200 rounded-xl p-5 space-y-3">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <CustomerSelect
              value={customerId}
              onChange={setCustomerId}
              customers={customers}
              required={true}
              className="px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white"
            />
            <DatePicker
              value={date}
              onChange={(e) => {
                setDate(e.target.value)
                if (!isEditMode) sessionStorage.setItem('lastSelectedSaleDate', e.target.value)
              }}
              required
              className="px-3 py-2 border border-gray-300 rounded-lg text-sm cursor-pointer"
            />
          </div>
          <input
            placeholder="Notes (optional)"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
          />
        </div>

        <div className="bg-white border border-gray-200 rounded-xl p-5 space-y-3">
          {singleProductMode ? (
            <>
              <div className="flex items-center justify-between">
                <h2 className="font-bold text-gray-700 uppercase text-xs tracking-widest">Sale Details</h2>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4 pt-2">
                <div className="space-y-1">
                  <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider">Product</label>
                  <div className="px-3 py-2 border border-gray-200 bg-gray-50 rounded-lg text-sm text-gray-650 font-bold h-[38px] flex items-center">
                    {products[0] ? `${products[0].name} (${products[0].unit})` : 'Product'}
                  </div>
                </div>
                <div className="space-y-1">
                  <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider">
                    Quantity {products[0] ? `(${products[0].unit})` : ''}
                  </label>
                  <input
                    type="number"
                    step="any"
                    placeholder="0"
                    value={items[0]?.qty || ''}
                    onChange={(e) => updateItem(0, 'qty', e.target.value)}
                    required
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-blue-500 h-[38px]"
                  />
                </div>
                {showRateField && (
                  <div className="space-y-1">
                    <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider">Rate (₹)</label>
                    <input
                      type="number"
                      step="any"
                      placeholder="0.00"
                      value={items[0]?.rate || ''}
                      onChange={(e) => updateItem(0, 'rate', e.target.value)}
                      className={`w-full px-3 py-2 border rounded-lg text-sm font-semibold focus:outline-none focus:ring-2 h-[38px] ${isSingleRateIncorrect
                        ? 'border-red-500 focus:ring-red-500 focus:border-red-500 border-2'
                        : 'border-gray-300 focus:ring-blue-500 focus:border-blue-500'
                        }`}
                    />
                  </div>
                )}
                <div className="space-y-1">
                  <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider">Weight (kg, optional)</label>
                  <input
                    type="number"
                    step="any"
                    placeholder="0.00"
                    value={items[0]?.weight || ''}
                    onChange={(e) => updateItem(0, 'weight', e.target.value)}
                    required
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-blue-500 h-[38px]"
                  />
                </div>
                <div className="space-y-1 sm:col-span-2 md:col-span-4">
                  <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider">Total Price (₹)</label>
                  <input
                    type="number"
                    step="any"
                    placeholder="0.00"
                    value={items[0]?.total_price || ''}
                    onChange={(e) => updateItem(0, 'total_price', e.target.value)}
                    required
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm font-black text-blue-600 focus:text-blue-700 bg-blue-50/20 focus:outline-none focus:ring-2 focus:ring-blue-500 h-[38px]"
                  />
                </div>
              </div>
            </>
          ) : (
            <>
              <div className="flex items-center justify-between">
                <h2 className="font-semibold text-gray-700">Line Items</h2>
                <button type="button" onClick={addItem} className="flex items-center gap-1 text-sm text-blue-600 hover:underline">
                  <Plus className="w-4 h-4" /> Add Item
                </button>
              </div>

              {items.map((item, i) => {
                const w = parseFloat(item.weight) || 0
                const tp = parseFloat(item.total_price) || 0
                const r = parseFloat(item.rate) || 0
                const isRateIncorrect = w > 0 && tp > 0 && r > 0 && Math.abs(w * r - tp) >= 0.01

                return (
                  <div key={i} className="flex items-end gap-2 border-b border-gray-100 pb-3">
                    <select
                      value={item.product_id}
                      onChange={(e) => updateItem(i, 'product_id', e.target.value)}
                      required
                      className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white"
                    >
                      <option value="">Product</option>
                      {products.map((p) => <option key={p.id} value={p.id}>{p.name} ({p.unit})</option>)}
                    </select>
                    <input
                      type="number"
                      step="any"
                      placeholder="Qty"
                      value={item.qty}
                      onChange={(e) => updateItem(i, 'qty', e.target.value)}
                      required
                      className="w-24 px-3 py-2 border border-gray-300 rounded-lg text-sm"
                    />
                    <input
                      type="number"
                      step="any"
                      placeholder="Rate (₹)"
                      value={item.rate}
                      onChange={(e) => updateItem(i, 'rate', e.target.value)}
                      required
                      className={`w-28 px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 ${isRateIncorrect
                        ? 'border-red-500 focus:ring-red-500 focus:border-red-500 border-2'
                        : 'border-gray-300 focus:ring-blue-500'
                        }`}
                    />
                    <input
                      type="number"
                      step="any"
                      placeholder="Weight"
                      value={item.weight}
                      onChange={(e) => updateItem(i, 'weight', e.target.value)}
                      className="w-24 px-3 py-2 border border-gray-300 rounded-lg text-sm"
                    />
                    <input
                      type="number"
                      step="any"
                      placeholder="Total Price (₹)"
                      value={item.total_price}
                      onChange={(e) => updateItem(i, 'total_price', e.target.value)}
                      required
                      className="w-32 px-3 py-2 border border-gray-300 rounded-lg text-sm"
                    />
                    {items.length > 1 && (
                      <button type="button" onClick={() => removeItem(i)} className="p-2 text-red-400 hover:text-red-600">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                )
              })}

              {items.length > 1 && (
                <div className="flex items-center gap-2 pt-2 text-sm font-bold text-gray-600">
                  <div className="flex-1 text-right pr-2">Total:</div>
                  <div className="w-24 px-3 text-gray-800">
                    {itemsQtyTotal > 0 ? itemsQtyTotal.toLocaleString('en-IN', { maximumFractionDigits: 2 }) : '-'}
                  </div>
                  <div className="w-28 px-3 text-right text-gray-800 font-semibold">
                    {itemsWeightTotal > 0 ? `₹${(subtotal / itemsWeightTotal).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '-'}
                  </div>
                  <div className="w-24 px-3 text-gray-800">
                    {itemsWeightTotal > 0 ? itemsWeightTotal.toLocaleString('en-IN', { maximumFractionDigits: 2 }) : '-'}
                  </div>
                  <div className="w-32 px-3 font-black text-blue-600">
                    ₹{subtotal.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </div>
                  <div className="w-8"></div>
                </div>
              )}
            </>
          )}

          {/* Manual Discount & Final Value inputs - only shown when automatic rules are off */}
          {roundingConfig && !roundingConfig.enabled && (
            <div className="border-t border-gray-100 pt-3 space-y-2 flex flex-col items-end">
              <div className="flex items-center gap-3">
                <span className="text-xs font-bold text-gray-500 uppercase tracking-wider">Discount (₹):</span>
                <input
                  type="number"
                  step="any"
                  min="0"
                  max={subtotal}
                  placeholder="0.00"
                  value={discount}
                  onChange={(e) => handleDiscountChange(e.target.value)}
                  className="w-36 px-3 py-1.5 border border-gray-300 rounded-lg text-sm text-right font-semibold"
                />
              </div>
              <div className="flex items-center gap-3">
                <span className="text-xs font-bold text-gray-500 uppercase tracking-wider">Final Value (₹):</span>
                <input
                  type="number"
                  step="any"
                  min="0"
                  max={subtotal}
                  placeholder="0.00"
                  value={finalValue}
                  onChange={(e) => handleFinalValueChange(e.target.value)}
                  className="w-36 px-3 py-1.5 border border-gray-300 rounded-lg text-sm text-right font-semibold text-blue-600 focus:text-blue-700 focus:ring-blue-500"
                />
              </div>
            </div>
          )}

          {/* Summary Display */}
          <div className="text-right text-lg font-bold text-gray-800 pt-2 border-t border-gray-150">
            {roundingConfig && !roundingConfig.enabled && discount && Number(discount) > 0 ? (
              <div className="space-y-1 text-sm font-semibold">
                <div className="text-gray-500">
                  Subtotal: {fmt(Math.round(subtotal * 100))}
                </div>
                <div className="text-emerald-600">
                  Discount: -{fmt(Math.round(Number(discount) * 100))}
                </div>
                <div className="text-lg font-black text-slate-900 pt-1">
                  Net Total: {fmt(Math.round((subtotal - Number(discount)) * 100))}
                </div>
              </div>
            ) : (
              `Total: ${fmt(Math.round(subtotal * 100))}`
            )}
          </div>
        </div>

        <button
          type="submit"
          disabled={saving}
          className="w-full py-3 bg-blue-600 text-white rounded-xl text-sm font-bold uppercase tracking-wider hover:bg-blue-700 disabled:opacity-50 transition-colors shadow-md"
        >
          {saving ? 'Saving...' : isEditMode ? 'Save Changes' : 'Save Sale'}
        </button>
      </form>

      {/* Recent Sales History Section */}
      <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden shadow-sm">
        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
          <span className="font-black text-gray-900 text-sm uppercase tracking-widest">Recent Sales History</span>
          <button
            type="button"
            onClick={handleExportExcel}
            className="flex items-center gap-1.5 px-3 py-1.5 border border-gray-300 bg-white text-gray-700 hover:bg-gray-50 rounded-xl text-xs font-bold transition-all shadow-sm"
          >
            <Download className="w-3.5 h-3.5" /> Export Excel
          </button>
        </div>
        <div className="px-6 py-2.5 bg-gray-50 border-b border-gray-150 flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2">
            <Calendar className="w-4 h-4 text-gray-455 shrink-0" />
            <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Filter Date:</span>
            <DatePicker
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              className="px-2.5 py-1 border border-gray-300 rounded-xl text-xs cursor-pointer focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white font-semibold text-slate-800"
            />
            <span className="text-xs font-bold text-gray-400">to</span>
            <DatePicker
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              className="px-2.5 py-1 border border-gray-300 rounded-xl text-xs cursor-pointer focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white font-semibold text-slate-800"
            />
            {(dateFrom || dateTo) && (
              <button
                type="button"
                onClick={() => { setDateFrom(''); setDateTo(''); }}
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
                <th className="text-center px-6 py-3.5 w-12">#</th>
                <th className="text-left px-6 py-3.5 w-32">Date</th>
                <th className="text-left px-6 py-3.5">Customer</th>
                <th className="text-right px-6 py-3.5 w-24">Qty</th>
                <th className="text-right px-6 py-3.5 w-28">Weight</th>
                {showRateField && <th className="text-right px-6 py-3.5 w-32">Rate</th>}
                <th className="text-right px-6 py-3.5 w-40">Original Value</th>
                <th className="text-right px-6 py-3.5 w-40">Discount</th>
                <th className="text-right px-6 py-3.5 w-40">Final Value</th>
                <th className="text-left px-6 py-3.5">Notes</th>
                <th className="text-center px-6 py-3.5 w-24">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {recentSales.map((sale, index) => {
                const sub = sale.total_amount
                const disc = sale.discount || 0
                const finalVal = sub - disc

                return (
                  <tr key={sale.id} className="hover:bg-gray-50 transition-colors">
                    <td className="text-center px-6 py-4 text-gray-400 font-medium">
                      {index + 1}
                    </td>
                    <td className="px-6 py-4 text-gray-500 whitespace-nowrap">
                      {formatDate(sale.date)}
                    </td>
                    <td className="px-6 py-4 font-bold text-gray-900">
                      {sale.customer_name}
                    </td>
                    <td className="px-6 py-4 text-right font-semibold text-gray-700 whitespace-nowrap">
                      {sale.qty > 0 ? sale.qty : '-'}
                    </td>
                    <td className="px-6 py-4 text-right font-semibold text-gray-700 whitespace-nowrap">
                      {sale.weight > 0 ? `${sale.weight} kg` : '-'}
                    </td>
                    {showRateField && (
                      <td className="px-6 py-4 text-right font-semibold text-gray-700 whitespace-nowrap">
                        {sale.weight > 0 ? fmt(sub / sale.weight) : '-'}
                      </td>
                    )}
                    <td className="px-6 py-4 text-right font-semibold text-gray-700 whitespace-nowrap">
                      {fmt(sub)}
                    </td>
                    <td className="px-6 py-4 text-right whitespace-nowrap font-bold">
                      {disc > 0 ? (
                        <span className="text-emerald-600">-{fmt(disc)}</span>
                      ) : (
                        <span className="text-gray-400 font-medium">-</span>
                      )}
                    </td>
                    <td className="px-6 py-4 text-right font-black text-slate-900 whitespace-nowrap">
                      {fmt(finalVal)}
                    </td>
                    <td className="px-6 py-4 text-xs text-gray-400 italic font-medium max-w-xs truncate">
                      {sale.notes || '-'}
                    </td>
                    <td className="px-6 py-4 text-center">
                      <Link
                        to={`/sales/edit/${sale.id}`}
                        className="p-1.5 inline-block text-amber-500 hover:text-amber-700 hover:bg-amber-50 rounded-lg transition-colors"
                        title="Edit Sale"
                      >
                        <Pencil className="w-4 h-4" />
                      </Link>
                    </td>
                  </tr>
                )
              })}
              {recentSales.length === 0 && (
                <tr>
                  <td colSpan={showRateField ? 11 : 10} className="text-center py-8 text-gray-400 italic">
                    No sales recorded yet.
                  </td>
                </tr>
              )}
            </tbody>
            {recentSales.length > 0 && (
              <tfoot className="bg-gray-50 border-t-2 border-gray-200 text-xs font-bold text-gray-700">
                <tr>
                  <td className="px-6 py-4 text-gray-900 font-black uppercase tracking-wider" colSpan={3}>
                    Total
                  </td>
                  <td className="px-6 py-4 text-right font-bold text-gray-900 whitespace-nowrap">
                    {recentQtyTotal > 0 ? recentQtyTotal.toLocaleString('en-IN', { maximumFractionDigits: 2 }) : '-'}
                  </td>
                  <td className="px-6 py-4 text-right font-bold text-gray-900 whitespace-nowrap">
                    {recentWeightTotal > 0 ? `${recentWeightTotal.toLocaleString('en-IN', { maximumFractionDigits: 2 })} kg` : '-'}
                  </td>
                  {showRateField && (
                    <td className="px-6 py-4 text-right font-bold text-gray-900 whitespace-nowrap">
                      {recentWeightTotal > 0 ? fmt(recentFinalTotal / recentWeightTotal) : '-'}
                    </td>
                  )}
                  <td className="px-6 py-4 text-right font-bold text-gray-900 whitespace-nowrap">
                    {fmt(recentSubtotal)}
                  </td>
                  <td className="px-6 py-4 text-right font-bold whitespace-nowrap">
                    {recentDiscountTotal > 0 ? (
                      <span className="text-emerald-600">-{fmt(recentDiscountTotal)}</span>
                    ) : (
                      <span className="text-gray-400 font-medium">-</span>
                    )}
                  </td>
                  <td className="px-6 py-4 text-right font-black text-slate-900 whitespace-nowrap">
                    {fmt(recentFinalTotal)}
                  </td>
                  <td className="px-6 py-4" colSpan={2}></td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>

      {/* Bulk Entry Modal */}
      <BulkEntryModal
        isOpen={showBulkEntry}
        onClose={() => setShowBulkEntry(false)}
        mode="sale"
        customers={customers}
        products={products}
        onMergeComplete={loadRecentSales}
      />
    </div>
  )
}
