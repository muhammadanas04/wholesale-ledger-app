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
  const [items, setItems] = useState([{ product_id: '', qty: '', unit_price: '' }])
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    async function load() {
      setCustomers(await ipc('customers:list') || [])
      setProducts(await ipc('products:list') || [])
    }
    load()
  }, [])

  function addItem() {
    setItems([...items, { product_id: '', qty: '', unit_price: '' }])
  }

  function removeItem(i) {
    setItems(items.filter((_, idx) => idx !== i))
  }

  function updateItem(i, field, value) {
    const next = [...items]
    next[i] = { ...next[i], [field]: value }
    setItems(next)
  }

  const total = items.reduce((s, item) => {
    const qty = Number(item.qty) || 0
    const price = Number(item.unit_price) || 0
    return s + qty * price
  }, 0)

  const fmt = (n) => `₹${(n / 100).toLocaleString('en-IN')}`

  async function handleSubmit(e) {
    e.preventDefault()
    
    const saleData = {
      customer_id: Number(customerId),
      date,
      notes: notes || null,
      items: items.map((i) => ({
        product_id: Number(i.product_id),
        qty: Number(i.qty),
        unit_price: Number(i.unit_price),
      })),
    }

    const result = saleSchema.safeParse(saleData)
    if (!result.success) {
      return toast.error(result.error.errors[0].message)
    }

    setSaving(true)
    const finalData = {
      ...saleData,
      items: saleData.items.map(i => ({
        ...i,
        unit_price: Math.round(i.unit_price * 100)
      }))
    }

    await ipc('sales:add', finalData)
    toast.success('Sale saved successfully')
    setCustomerId('')
    setDate(new Date().toISOString().slice(0, 10))
    setNotes('')
    setItems([{ product_id: '', qty: '', unit_price: '' }])
    setSaving(false)
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
              className="px-3 py-2 border border-gray-300 rounded-lg text-sm"
            >
              <option value="">Select customer</option>
              {customers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              required
              className="px-3 py-2 border border-gray-300 rounded-lg text-sm"
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
              <select
                value={item.product_id}
                onChange={(e) => updateItem(i, 'product_id', e.target.value)}
                required
                className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm"
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
                step="0.01"
                placeholder="Price"
                value={item.unit_price}
                onChange={(e) => updateItem(i, 'unit_price', e.target.value)}
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

          <div className="text-right text-lg font-bold text-gray-800 pt-2">
            Total: {fmt(Math.round(total * 100))}
          </div>
        </div>

        <button
          type="submit"
          disabled={saving}
          className="w-full py-3 bg-blue-600 text-white rounded-xl text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
        >
          {saving ? 'Saving...' : 'Save Sale'}
        </button>
      </form>
    </div>
  )
}
