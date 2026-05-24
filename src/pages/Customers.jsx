import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { ipc } from '../lib/ipc'
import { Search, Plus, Phone, MapPin } from 'lucide-react'
import { customerSchema } from '../lib/schemas'
import { toast } from 'sonner'

export default function Customers() {
  const [customers, setCustomers] = useState([])
  const [search, setSearch] = useState('')
  const [sortBy, setSortBy] = useState('name-asc')
  const [showForm, setShowForm] = useState(false)
  const [editId, setEditId] = useState(null)
  const [form, setForm] = useState({ name: '', phone: '', address: '' })

  async function load() {
    let data = search
      ? await ipc('customers:search', search)
      : await ipc('customers:list')
    
    if (!data) return setCustomers([])

    const sorted = [...data].sort((a, b) => {
      if (sortBy === 'name-asc') return a.name.localeCompare(b.name)
      if (sortBy === 'name-desc') return b.name.localeCompare(a.name)
      if (sortBy === 'balance-desc') return b.balance - a.balance
      if (sortBy === 'balance-asc') return a.balance - b.balance
      return 0
    })

    setCustomers(sorted)
  }

  useEffect(() => { load() }, [search, sortBy])

  function openAdd() {
    setEditId(null)
    setForm({ name: '', phone: '', address: '' })
    setShowForm(true)
  }

  function openEdit(c) {
    setEditId(c.id)
    setForm({ name: c.name, phone: c.phone || '', address: c.address || '' })
    setShowForm(true)
  }

  async function handleSave(e) {
    e.preventDefault()

    const result = customerSchema.safeParse(form)
    if (!result.success) {
      return toast.error(result.error.errors[0].message)
    }

    if (editId) {
      await ipc('customers:update', editId, form)
      toast.success('Customer updated')
    } else {
      await ipc('customers:add', form)
      toast.success('Customer added')
    }
    setShowForm(false)
    load()
  }

  const fmt = (n) => `₹${(n / 100).toLocaleString('en-IN')}`

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-800">Customers</h1>
        <button onClick={openAdd} className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700">
          <Plus className="w-4 h-4" /> Add Customer
        </button>
      </div>

      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            placeholder="Search by name or phone..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        <select
          value={sortBy}
          onChange={(e) => setSortBy(e.target.value)}
          className="px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <option value="name-asc">Name (A-Z)</option>
          <option value="name-desc">Name (Z-A)</option>
          <option value="balance-desc">Balance (High-Low)</option>
          <option value="balance-asc">Balance (Low-High)</option>
        </select>
      </div>

      {showForm && (
        <form onSubmit={handleSave} className="bg-white border border-gray-200 rounded-xl p-4 space-y-3">
          <input
            placeholder="Name *"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            required
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
          />
          <input
            placeholder="Phone"
            value={form.phone}
            onChange={(e) => setForm({ ...form, phone: e.target.value })}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
          />
          <input
            placeholder="Address"
            value={form.address}
            onChange={(e) => setForm({ ...form, address: e.target.value })}
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

      <div className="space-y-2">
        {customers.map((c) => (
          <Link key={c.id} to={`/customers/${c.id}`} className="bg-white border border-gray-200 rounded-xl p-4 flex items-center justify-between hover:border-blue-200 transition-colors">
            <div>
              <p className="font-medium text-gray-800">{c.name}</p>
              <div className="flex items-center gap-4 text-sm text-gray-500 mt-1">
                {c.phone && <span className="flex items-center gap-1"><Phone className="w-3 h-3" />{c.phone}</span>}
                {c.address && <span className="flex items-center gap-1"><MapPin className="w-3 h-3" />{c.address}</span>}
              </div>
            </div>
            <div className="flex items-center gap-4">
              <span className={`font-semibold ${c.balance > 0 ? 'text-orange-600' : 'text-green-600'}`}>
                {fmt(c.balance)}
              </span>
              <button onClick={(e) => { e.preventDefault(); openEdit(c) }} className="text-sm text-blue-600 hover:underline">Edit</button>
            </div>
          </Link>
        ))}
        {customers.length === 0 && (
          <p className="text-gray-400 text-sm text-center py-8">No customers found</p>
        )}
      </div>
    </div>
  )
}
