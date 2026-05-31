import { useState, useEffect } from 'react'
import { ipc } from '../lib/ipc'
import { Plus, Trash2, ShoppingCart } from 'lucide-react'
import { saleSchema } from '../lib/schemas'
import { toast } from 'sonner'

export default function NewSale() {
  const [customers, setCustomers] = useState([])
  const [products, setProducts] = useState([])
  const [customerId, setCustomerId] = useState('')
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10))
  const [notes, setNotes] = useState('')
  const [items, setItems] = useState([{ product_id: '', qty: '', rate: '', total_price: '', weight: '' }])
  const [saving, setSaving] = useState(false)
  const [roundingConfig, setRoundingConfig] = useState(null)
  const [recentSales, setRecentSales] = useState([])
  const [discount, setDiscount] = useState('')
  const [finalValue, setFinalValue] = useState('')
  const [singleProductMode, setSingleProductMode] = useState(false)
  const [showRateField, setShowRateField] = useState(true)

  // Calculate raw subtotal of items in Rupees
  const subtotal = items.reduce((s, item) => {
    const price = Number(item.total_price) || 0
    return s + price
  }, 0)

  async function loadRecentSales() {
    try {
      const list = await ipc('sales:list', { limit: 10 })
      setRecentSales(list || [])
    } catch (e) {
      console.error('Failed to load recent sales:', e)
    }
  }

  useEffect(() => {
    async function load() {
      const prods = await ipc('products:list', { limit: 1000 }) || []
      setCustomers(await ipc('customers:list') || [])
      setProducts(prods)
      loadRecentSales()
      
      const singleProductVal = await ipc('meta:get', 'single_product_mode')
      const isSingleProduct = singleProductVal === 'true'
      setSingleProductMode(isSingleProduct)
      
      if (isSingleProduct && prods.length > 0) {
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
    }
    load()
  }, [])

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

    if (field === 'qty' || field === 'rate') {
      const q = Number(field === 'qty' ? value : item.qty) || 0
      const r = Number(field === 'rate' ? value : item.rate) || 0
      if (q > 0 && r > 0) {
        item.total_price = (q * r).toFixed(2)
      } else {
        item.total_price = ''
      }
    } else if (field === 'total_price') {
      const q = Number(item.qty) || 0
      const tp = Number(value) || 0
      if (q > 0 && tp > 0) {
        item.rate = (tp / q).toFixed(2)
      } else {
        item.rate = ''
      }
    }

    next[i] = item
    setItems(next)
  }

  const fmt = (n) => `₹${(n / 100).toLocaleString('en-IN')}`

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
          unit_price: rate > 0 ? rate : (qty > 0 ? totalPrice / qty : 0),
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
        unit_price: Math.round(i.unit_price * 100)
      }))
    }

    try {
      await ipc('sales:add', finalData)
      toast.success('Sale saved successfully')
      setCustomerId('')
      setDate(new Date().toISOString().slice(0, 10))
      setNotes('')
      setItems([{ product_id: singleProductMode && products.length > 0 ? String(products[0].id) : '', qty: '', rate: '', total_price: '', weight: '' }])
      setDiscount('')
      setFinalValue('')
      loadRecentSales()
    } catch (err) {
      console.error(err)
      toast.error('Failed to save sale')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center gap-2">
        <ShoppingCart className="w-6 h-6 text-gray-700" />
        <h1 className="text-2xl font-bold text-gray-800">New Sale</h1>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="bg-white border border-gray-200 rounded-xl p-5 space-y-3">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <select
              value={customerId}
              onChange={(e) => setCustomerId(e.target.value)}
              required
              className="px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white"
            >
              <option value="">Select customer</option>
              {customers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
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
          </div>
          <input
            placeholder="Notes (optional)"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
          />
        </div>

        <div className="bg-white border border-gray-200 rounded-xl p-5 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold text-gray-700">Line Items</h2>
            <button type="button" onClick={addItem} className="flex items-center gap-1 text-sm text-blue-600 hover:underline">
              <Plus className="w-4 h-4" /> Add Item
            </button>
          </div>

          {items.map((item, i) => (
            <div key={i} className="flex items-end gap-2 border-b border-gray-100 pb-3">
              {singleProductMode ? (
                <div className="flex-1 px-3 py-2 border border-gray-200 bg-gray-50 rounded-lg text-sm text-gray-600 font-medium">
                  {products[0] ? `${products[0].name} (${products[0].unit})` : 'Product'}
                </div>
              ) : (
                <select
                  value={item.product_id}
                  onChange={(e) => updateItem(i, 'product_id', e.target.value)}
                  required
                  className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white"
                >
                  <option value="">Product</option>
                  {products.map((p) => <option key={p.id} value={p.id}>{p.name} ({p.unit})</option>)}
                </select>
              )}
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
                className="w-28 px-3 py-2 border border-gray-300 rounded-lg text-sm"
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
                step="0.01"
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
          ))}

          {/* Manual Discount & Final Value inputs - only shown when automatic rules are off */}
          {roundingConfig && !roundingConfig.enabled && (
            <div className="border-t border-gray-100 pt-3 space-y-2 flex flex-col items-end">
              <div className="flex items-center gap-3">
                <span className="text-xs font-bold text-gray-500 uppercase tracking-wider">Discount (₹):</span>
                <input
                  type="number"
                  step="0.01"
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
                  step="0.01"
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
          {saving ? 'Saving...' : 'Save Sale'}
        </button>
      </form>

      {/* Recent Sales History Section */}
      <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden shadow-sm">
        <div className="px-6 py-4 border-b border-gray-100 font-black text-gray-900 text-sm uppercase tracking-widest">
          Recent Sales History
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-gray-500 font-bold uppercase text-[10px] tracking-wider border-b border-gray-200">
              <tr>
                <th className="text-left px-6 py-3.5 w-32">Date</th>
                <th className="text-left px-6 py-3.5">Customer</th>
                <th className="text-right px-6 py-3.5 w-24">Qty</th>
                <th className="text-right px-6 py-3.5 w-28">Weight</th>
                {showRateField && <th className="text-right px-6 py-3.5 w-32">Rate</th>}
                <th className="text-right px-6 py-3.5 w-40">Original Value</th>
                <th className="text-right px-6 py-3.5 w-40">Discount</th>
                <th className="text-right px-6 py-3.5 w-40">Final Value</th>
                <th className="text-left px-6 py-3.5">Notes</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {recentSales.map((sale) => {
                const sub = sale.total_amount
                const disc = sale.discount || 0
                const finalVal = sub - disc

                return (
                  <tr key={sale.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-6 py-4 text-gray-500 whitespace-nowrap">
                      {sale.date}
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
                        {sale.rate ? fmt(sale.rate) : '-'}
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
                  </tr>
                )
              })}
              {recentSales.length === 0 && (
                <tr>
                  <td colSpan={showRateField ? 9 : 8} className="text-center py-8 text-gray-400 italic">
                    No sales recorded yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
