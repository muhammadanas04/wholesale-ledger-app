import { useState, useEffect } from 'react'
import { ipc } from '../lib/ipc'
import { Plus, Package } from 'lucide-react'
import { productSchema } from '../lib/schemas'
import { toast } from 'sonner'

const units = ['kg', 'g', 'box', 'piece', 'litre', 'bottle', 'bag', 'dozen']

export default function Products() {
  const [products, setProducts] = useState([])
  const [showForm, setShowForm] = useState(false)
  const [editId, setEditId] = useState(null)
  const [sortBy, setSortBy] = useState('name-asc')
  const [form, setForm] = useState({ name: '', unit: 'kg', reorder_level: '' })

  async function load() {
    const data = await ipc('products:list')
    if (!data) return setProducts([])

    const sorted = [...data].sort((a, b) => {
      if (sortBy === 'name-asc') return a.name.localeCompare(b.name)
      if (sortBy === 'name-desc') return b.name.localeCompare(a.name)
      if (sortBy === 'stock-desc') return b.current_stock - a.current_stock
      if (sortBy === 'stock-asc') return a.current_stock - b.current_stock
      return 0
    })
    setProducts(sorted)
  }

  useEffect(() => { load() }, [sortBy])

  function openAdd() {
    setEditId(null)
    setForm({ name: '', unit: 'kg', reorder_level: '' })
    setShowForm(true)
  }

  function openEdit(p) {
    setEditId(p.id)
    setForm({ name: p.name, unit: p.unit, reorder_level: String(p.reorder_level) })
    setShowForm(true)
  }

  async function handleSave(e) {
    e.preventDefault()
    const data = { name: form.name, unit: form.unit, reorder_level: Number(form.reorder_level) || 0 }
    
    const result = productSchema.safeParse(data)
    if (!result.success) {
      return toast.error(result.error.errors[0].message)
    }

    if (editId) {
      await ipc('products:update', editId, data)
      toast.success('Product updated')
    } else {
      await ipc('products:add', data)
      toast.success('Product added')
    }
    setShowForm(false)
    load()
  }

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-800">Products</h1>
        <div className="flex items-center gap-2">
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value)}
            className="px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="name-asc">Name (A-Z)</option>
            <option value="name-desc">Name (Z-A)</option>
            <option value="stock-desc">Stock (High-Low)</option>
            <option value="stock-asc">Stock (Low-High)</option>
          </select>
          <button onClick={openAdd} className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700">
            <Plus className="w-4 h-4" /> Add Product
          </button>
        </div>
      </div>

      {showForm && (
        <form onSubmit={handleSave} className="bg-white border border-gray-200 rounded-xl p-4 space-y-3">
          <input
            placeholder="Product name *"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            required
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
          />
          <select
            value={form.unit}
            onChange={(e) => setForm({ ...form, unit: e.target.value })}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
          >
            {units.map((u) => <option key={u} value={u}>{u}</option>)}
          </select>
          <input
            type="number"
            step="any"
            placeholder="Reorder level"
            value={form.reorder_level}
            onChange={(e) => setForm({ ...form, reorder_level: e.target.value })}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
          />
          <div className="flex gap-2">
            <button type="submit" className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700">
              {editId ? 'Update' : 'Save'}
            </button>
            <button type="button" onClick={() => setShowForm(false)} className="px-4 py-2 bg-gray-100 text-gray-600 rounded-lg text-sm hover:bg-gray-200">
              Cancel
            </button>
          </div>
        </form>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
        {products.map((p) => {
          const low = p.current_stock < p.reorder_level
          return (
            <div key={p.id} className={`bg-white border rounded-xl p-4 ${low ? 'border-red-300 bg-red-50' : 'border-gray-200'}`}>
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-2">
                  <Package className="w-5 h-5 text-gray-400" />
                  <div>
                    <p className="font-medium text-gray-800">{p.name}</p>
                    <p className="text-xs text-gray-400">Unit: {p.unit}</p>
                  </div>
                </div>
                <button onClick={() => openEdit(p)} className="text-xs text-blue-600 hover:underline">Edit</button>
              </div>
              <div className="mt-3 flex items-center justify-between">
                <span className="text-lg font-bold text-gray-800">{p.current_stock} <span className="text-sm font-normal text-gray-400">{p.unit}</span></span>
                {low && <span className="text-xs text-red-600 font-medium">Low stock!</span>}
              </div>
              {p.reorder_level > 0 && (
                <p className="text-xs text-gray-400 mt-1">Reorder at: {p.reorder_level} {p.unit}</p>
              )}
            </div>
          )
        })}
        {products.length === 0 && (
          <p className="text-gray-400 text-sm col-span-full text-center py-8">No products yet</p>
        )}
      </div>
    </div>
  )
}
