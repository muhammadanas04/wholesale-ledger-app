import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { ipc } from '../lib/ipc'
import { Search, Plus, Phone, MapPin, Download } from 'lucide-react'
import { customerSchema } from '../lib/schemas'
import { formatCurrency, formatPhone } from '../lib/formatters'
import { toast } from 'sonner'
import Pagination from '../components/Pagination'
import Skeleton from '../components/Skeleton'

const LIMIT = 10

export default function Customers() {
  const [customers, setCustomers] = useState([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState(() => {
    return localStorage.getItem('customers_search') || ''
  })
  const [sortBy, setSortBy] = useState(() => {
    return localStorage.getItem('customers_sort_by') || 'name'
  })
  const [order, setOrder] = useState(() => {
    return localStorage.getItem('customers_order') || 'ASC'
  })

  useEffect(() => {
    localStorage.setItem('customers_search', search)
  }, [search])

  useEffect(() => {
    localStorage.setItem('customers_sort_by', sortBy)
  }, [sortBy])

  useEffect(() => {
    localStorage.setItem('customers_order', order)
  }, [order])
  const [showForm, setShowForm] = useState(false)
  const [editId, setEditId] = useState(null)
  const [form, setForm] = useState({ name: '', phone: '', address: '' })

  async function load() {
    setLoading(true)
    const offset = (page - 1) * LIMIT
    
    const [data, count] = await Promise.all([
      search 
        ? ipc('customers:search', search, { limit: LIMIT, offset, sortBy, order })
        : ipc('customers:list', { limit: LIMIT, offset, sortBy, order }),
      ipc('customers:count', search)
    ])
    
    setCustomers(data || [])
    setTotal(Math.ceil((count || 0) / LIMIT))
    setLoading(false)
  }

  useEffect(() => { load() }, [page, search, sortBy, order])

  // Reset page on search/sort
  useEffect(() => { setPage(1) }, [search, sortBy, order])

  function handleSort(val) {
    const [s, o] = val.split('-')
    setSortBy(s)
    setOrder(o.toUpperCase())
  }

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

  const handleExportExcel = async () => {
    try {
      const data = search 
        ? await ipc('customers:search', search, { limit: 100000, offset: 0, sortBy, order })
        : await ipc('customers:list', { limit: 100000, offset: 0, sortBy, order })

      if (!data || data.length === 0) {
        return toast.error('No customers to export')
      }

      const headers = ["ID", "Name", "Phone", "Address", "Outstanding Balance (₹)"]
      const rows = data.map((c) => [
        c.id,
        c.name,
        c.phone ? formatPhone(c.phone) : '-',
        c.address || '-',
        c.balance / 100
      ])

      const success = await ipc('app:export-excel', 'Customers_List', headers, rows)
      if (success) {
        toast.success('Customers list exported successfully')
      }
    } catch (err) {
      console.error(err)
      toast.error('Failed to export customers')
    }
  }

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-800">Customers</h1>
        <div className="flex items-center gap-2">
          <button
            onClick={handleExportExcel}
            className="flex items-center gap-2 px-4 py-2 border border-gray-300 bg-white text-gray-700 hover:bg-gray-50 rounded-lg text-sm font-medium transition-all shadow-sm"
          >
            <Download className="w-4 h-4" /> Export Excel
          </button>
          <button onClick={openAdd} className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700">
            <Plus className="w-4 h-4" /> Add Customer
          </button>
        </div>
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
          value={`${sortBy}-${order.toLowerCase()}`}
          onChange={(e) => handleSort(e.target.value)}
          className="px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <option value="name-asc">Name (A-Z)</option>
          <option value="name-desc">Name (Z-A)</option>
          <option value="balance-desc">Balance (High-Low)</option>
          <option value="balance-asc">Balance (Low-High)</option>
          <option value="created_at-desc">Newest First</option>
        </select>
      </div>

      {showForm && (
        <form onSubmit={handleSave} className="bg-white border border-gray-200 rounded-xl p-4 space-y-3 shadow-sm">
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
        {loading ? (
          [...Array(5)].map((_, i) => <Skeleton key={i} className="h-20 w-full" />)
        ) : (
          <>
            {customers.map((c) => (
              <Link key={c.id} to={`/customers/${c.id}`} className="bg-white border border-gray-200 rounded-xl p-4 flex items-center justify-between hover:border-blue-200 transition-colors shadow-sm">
                <div>
                  <p className="font-bold text-gray-800">{c.name}</p>
                  <div className="flex items-center gap-4 text-sm text-gray-500 mt-1">
                    {c.phone && <span className="flex items-center gap-1"><Phone className="w-3 h-3" />{formatPhone(c.phone)}</span>}
                    {c.address && <span className="flex items-center gap-1"><MapPin className="w-3 h-3" />{c.address}</span>}
                  </div>
                </div>
                <div className="flex items-center gap-4">
                  <span className={`font-bold ${c.balance > 0 ? 'text-orange-600' : 'text-green-600'}`}>
                    {formatCurrency(c.balance)}
                  </span>
                  <button onClick={(e) => { e.preventDefault(); openEdit(c) }} className="text-sm text-blue-600 font-bold hover:underline">Edit</button>
                </div>
              </Link>
            ))}
            {customers.length === 0 && (
              <p className="text-gray-400 text-sm text-center py-8 bg-white border border-dashed border-gray-200 rounded-xl">No customers found</p>
            )}
            <Pagination current={page} total={total} onPageChange={setPage} />
          </>
        )}
      </div>
    </div>
  )
}
