import { useState, useEffect } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { ipc } from '../lib/ipc'
import { BookOpen, Download, Trash2, Calendar, Users, RefreshCw } from 'lucide-react'
import { formatCurrency, formatDate } from '../lib/formatters'
import { toast } from 'sonner'
import ConfirmDialog from '../components/ConfirmDialog'
import Pagination from '../components/Pagination'
import Skeleton from '../components/Skeleton'

const LIMIT = 20

export default function Ledger() {
  const [searchParams, setSearchParams] = useSearchParams()
  
  // Filter States
  const [customers, setCustomers] = useState([])
  const [customerId, setCustomerId] = useState(searchParams.get('customer_id') || '')
  
  // Default date range: current calendar month
  const getDefaultDateRange = () => {
    const today = new Date()
    const firstDay = new Date(today.getFullYear(), today.getMonth(), 1).toISOString().slice(0, 10)
    const lastDay = today.toISOString().slice(0, 10) // or end of month, but today is cleaner
    return { from: firstDay, to: lastDay }
  }
  
  const initialDates = getDefaultDateRange()
  const [dateFrom, setDateFrom] = useState(initialDates.from)
  const [dateTo, setDateTo] = useState(initialDates.to)
  const [type, setType] = useState('all') // 'all', 'sale', 'payment'
  
  // Data States
  const [entries, setEntries] = useState([])
  const [summary, setSummary] = useState({ total_sales: 0, total_payments: 0, net_outstanding: 0, entry_count: 0 })
  const [page, setPage] = useState(1)
  const [totalPages, setTotalPages] = useState(0)
  const [loading, setLoading] = useState(true)
  
  // Dialog States
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState(null) // { id, type }

  // Load URL query params on mount/change
  useEffect(() => {
    const paramCustId = searchParams.get('customer_id')
    const paramDate = searchParams.get('date')
    
    if (paramCustId) {
      setCustomerId(paramCustId)
    }
    if (paramDate === 'today') {
      const todayStr = new Date().toISOString().slice(0, 10)
      setDateFrom(todayStr)
      setDateTo(todayStr)
    }
  }, [searchParams])

  // Load customers dropdown list
  useEffect(() => {
    async function loadCustomers() {
      const list = await ipc('customers:list', { limit: 1000 })
      setCustomers(list || [])
    }
    loadCustomers()
  }, [])

  // Main loader triggered by filters or page changes
  async function loadData() {
    setLoading(true)
    const filters = {
      customer_id: customerId ? Number(customerId) : null,
      date_from: dateFrom || null,
      date_to: dateTo || null,
      type: type,
      limit: LIMIT,
      offset: (page - 1) * LIMIT
    }

    try {
      const [list, count, sum] = await Promise.all([
        ipc('ledger:list', filters),
        ipc('ledger:count', filters),
        ipc('ledger:summary', filters)
      ])

      setEntries(list || [])
      setTotalPages(Math.ceil((count || 0) / LIMIT))
      if (sum) setSummary(sum)
    } catch (err) {
      toast.error('Failed to load ledger data')
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadData()
  }, [customerId, dateFrom, dateTo, type, page])

  // Reset page to 1 on filter changes
  const handleFilterChange = (updaterFn) => {
    updaterFn()
    setPage(1)
  }

  const handleClearFilters = () => {
    setCustomerId('')
    const defaults = getDefaultDateRange()
    setDateFrom(defaults.from)
    setDateTo(defaults.to)
    setType('all')
    setPage(1)
    setSearchParams({})
  }

  // Delete handlers
  const handleConfirmDelete = (id, entryType) => {
    setDeleteTarget({ id, type: entryType })
    setConfirmOpen(true)
  }

  const handleDelete = async () => {
    if (!deleteTarget) return
    const { id, type: entryType } = deleteTarget
    
    setConfirmOpen(false)
    try {
      if (entryType === 'sale') {
        await ipc('sales:delete', id)
      } else {
        await ipc('payments:delete', id)
      }
      toast.success(`${entryType === 'sale' ? 'Sale' : 'Payment'} deleted successfully`)
      loadData()
    } catch (err) {
      toast.error('Failed to delete entry')
      console.error(err)
    } finally {
      setDeleteTarget(null)
    }
  }

  // Export to PDF
  const handleDownloadPDF = async () => {
    const range = `${dateFrom}_to_${dateTo}`
    await ipc('app:print-to-pdf', `Ledger_${range}`)
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header section (printed on PDF but hidden locally, or vice versa) */}
      <div className="print-only mb-6 border-b pb-4">
        <h1 className="text-3xl font-black text-gray-900 tracking-tight">Ledger Statement</h1>
        <p className="text-sm font-bold text-gray-500 mt-1 uppercase tracking-wider">
          Period: {dateFrom} to {dateTo} | Filter: {type.toUpperCase()}
        </p>
      </div>

      <div className="flex items-center justify-between no-print">
        <div className="flex items-center gap-2">
          <BookOpen className="w-6 h-6 text-gray-700" />
          <h1 className="text-2xl font-bold text-gray-800">Ledger</h1>
        </div>
        <button
          onClick={handleDownloadPDF}
          className="flex items-center gap-2 px-4 py-2 bg-gray-900 text-white rounded-xl text-sm font-bold hover:bg-black transition-all shadow-md"
        >
          <Download className="w-4 h-4" /> Download PDF
        </button>
      </div>

      {/* Filter Bar */}
      <div className="bg-white border border-gray-200 rounded-2xl p-5 shadow-sm space-y-4 no-print">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 items-end">
          {/* Customer filter */}
          <div className="space-y-1.5">
            <label className="text-xs font-bold text-gray-500 uppercase tracking-wider">Customer</label>
            <select
              value={customerId}
              onChange={(e) => handleFilterChange(() => setCustomerId(e.target.value))}
              className="w-full px-3 py-2 border border-gray-300 rounded-xl text-sm bg-white"
            >
              <option value="">All Customers</option>
              {customers.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>

          {/* Date range filters */}
          <div className="space-y-1.5">
            <label className="text-xs font-bold text-gray-500 uppercase tracking-wider">Date From</label>
            <div className="relative">
              <Calendar className="w-4 h-4 text-gray-400 absolute left-3 top-2.5" />
              <input
                type="date"
                value={dateFrom}
                onChange={(e) => handleFilterChange(() => setDateFrom(e.target.value))}
                className="w-full pl-9 pr-3 py-2 border border-gray-300 rounded-xl text-sm"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-bold text-gray-500 uppercase tracking-wider">Date To</label>
            <div className="relative">
              <Calendar className="w-4 h-4 text-gray-400 absolute left-3 top-2.5" />
              <input
                type="date"
                value={dateTo}
                onChange={(e) => handleFilterChange(() => setDateTo(e.target.value))}
                className="w-full pl-9 pr-3 py-2 border border-gray-300 rounded-xl text-sm"
              />
            </div>
          </div>

          {/* Action buttons (Clear) */}
          <div className="flex gap-2">
            <button
              onClick={handleClearFilters}
              className="flex-1 py-2 px-4 border border-gray-200 text-gray-600 rounded-xl text-sm font-semibold hover:bg-gray-50 transition-colors"
            >
              Clear Filters
            </button>
          </div>
        </div>

        {/* Type toggle buttons */}
        <div className="pt-2 border-t border-gray-100 flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <span className="text-xs font-bold text-gray-500 uppercase tracking-wider mr-2">Show:</span>
            <div className="flex bg-gray-100 p-1 rounded-xl">
              {['all', 'sale', 'payment'].map((t) => (
                <button
                  key={t}
                  onClick={() => handleFilterChange(() => setType(t))}
                  className={`px-4 py-1.5 rounded-lg text-xs font-bold uppercase tracking-wider transition-all ${
                    type === t
                      ? 'bg-white text-gray-900 shadow-sm'
                      : 'text-gray-500 hover:text-gray-800'
                  }`}
                >
                  {t === 'all' ? 'All' : t === 'sale' ? 'Sales' : 'Payments'}
                </button>
              ))}
            </div>
          </div>
          
          {loading && (
            <div className="flex items-center gap-1.5 text-xs text-gray-400 italic">
              <RefreshCw className="w-3.5 h-3.5 animate-spin" /> Syncing view...
            </div>
          )}
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
        {/* Total Sales (debit aggregate) */}
        <div className="bg-white rounded-2xl border border-gray-200 p-5 shadow-sm flex items-center gap-4 transition-all hover:border-orange-200">
          <div className="p-3.5 rounded-xl bg-orange-500 text-white shadow-sm flex-shrink-0">
            <BookOpen className="w-6 h-6" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-0.5 truncate" title="Total Sales (Dr)">Total Sales (Dr)</p>
            <p className="text-lg sm:text-xl font-black text-orange-600 tracking-tighter truncate" title={formatCurrency(summary.total_sales)}>{formatCurrency(summary.total_sales)}</p>
          </div>
        </div>

        {/* Total Payments (credit aggregate) */}
        <div className="bg-white rounded-2xl border border-gray-200 p-5 shadow-sm flex items-center gap-4 transition-all hover:border-green-200">
          <div className="p-3.5 rounded-xl bg-emerald-500 text-white shadow-sm flex-shrink-0">
            <Users className="w-6 h-6" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-0.5 truncate" title="Total Payments (Cr)">Total Payments (Cr)</p>
            <p className="text-lg sm:text-xl font-black text-green-600 tracking-tighter truncate" title={formatCurrency(summary.total_payments)}>{formatCurrency(summary.total_payments)}</p>
          </div>
        </div>

        {/* Net Outstanding balance */}
        <div className={`bg-white rounded-2xl border border-gray-200 p-5 shadow-sm flex items-center gap-4 transition-all ${
          summary.net_outstanding > 0 ? 'hover:border-red-200' : 'hover:border-blue-200'
        }`}>
          <div className={`p-3.5 rounded-xl shadow-sm text-white flex-shrink-0 ${
            summary.net_outstanding > 0 ? 'bg-rose-500' : 'bg-blue-600'
          }`}>
            <RefreshCw className="w-6 h-6" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-0.5 truncate" title="Net Outstanding">Net Outstanding</p>
            <p className={`text-lg sm:text-xl font-black tracking-tighter truncate ${
              summary.net_outstanding > 0 ? 'text-red-600' : 'text-blue-600'
            }`} title={formatCurrency(summary.net_outstanding)}>
              {formatCurrency(summary.net_outstanding)}
            </p>
          </div>
        </div>

        {/* Entries Count */}
        <div className="bg-white rounded-2xl border border-gray-200 p-5 shadow-sm flex items-center gap-4 transition-all hover:border-gray-300">
          <div className="p-3.5 rounded-xl bg-gray-500 text-white shadow-sm flex-shrink-0">
            <Calendar className="w-6 h-6" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-0.5 truncate" title="Total Entries">Total Entries</p>
            <p className="text-lg sm:text-xl font-black text-gray-800 tracking-tighter truncate" title={summary.entry_count}>{summary.entry_count}</p>
          </div>
        </div>
      </div>

      {/* Ledger Table */}
      <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden shadow-sm">
        <div className="px-6 py-4 border-b border-gray-100 font-black text-gray-900 text-sm uppercase tracking-widest no-print">Running Account Log</div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-gray-500 font-bold uppercase text-[10px] tracking-wider border-b border-gray-200">
              <tr>
                <th className="text-left px-6 py-3.5 w-32">Date</th>
                <th className="text-left px-6 py-3.5">Customer</th>
                <th className="text-center px-6 py-3.5 w-24">Type</th>
                <th className="text-left px-6 py-3.5 w-32">Reference</th>
                <th className="text-right px-6 py-3.5 w-36">Debit (Dr)</th>
                <th className="text-right px-6 py-3.5 w-36">Credit (Cr)</th>
                <th className="text-left px-6 py-3.5">Notes</th>
                <th className="text-center px-6 py-3.5 w-20 no-print">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {loading ? (
                [...Array(10)].map((_, idx) => (
                  <tr key={idx}>
                    <td colSpan={8} className="px-6 py-4">
                      <Skeleton className="h-6 w-full" />
                    </td>
                  </tr>
                ))
              ) : (
                <>
                  {entries.map((entry, idx) => {
                    const isSale = entry.type === 'sale'
                    return (
                      <tr key={idx} className="hover:bg-gray-50 transition-colors">
                        <td className="px-6 py-4 text-gray-500 whitespace-nowrap">{formatDate(entry.date)}</td>
                        <td className="px-6 py-4 font-semibold text-gray-900">
                          <Link to={`/customers/${entry.customer_id}`} className="hover:text-blue-600 transition-colors">
                            {entry.customer_name}
                          </Link>
                        </td>
                        <td className="px-6 py-4 text-center whitespace-nowrap">
                          <span className={`px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider ${
                            isSale 
                              ? 'bg-orange-50 text-orange-700 border border-orange-100' 
                              : 'bg-green-50 text-green-700 border border-green-100'
                          }`}>
                            {entry.type}
                          </span>
                        </td>
                        <td className="px-6 py-4 text-gray-500 whitespace-nowrap font-medium uppercase text-xs">
                          {isSale ? `Sale #${entry.id}` : `Pay #${entry.id}`}
                        </td>
                        <td className="px-6 py-4 text-right font-bold text-orange-600">
                          {isSale ? formatCurrency(entry.amount) : '-'}
                        </td>
                        <td className="px-6 py-4 text-right font-bold text-green-600">
                          {!isSale ? formatCurrency(-entry.amount) : '-'}
                        </td>
                        <td className="px-6 py-4 text-xs text-gray-400 italic font-medium max-w-xs truncate">
                          {entry.notes || '-'}
                        </td>
                        <td className="px-6 py-4 text-center no-print">
                          <button
                            onClick={() => handleConfirmDelete(entry.reference_id, entry.type)}
                            className="p-1.5 text-red-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                          >
                            <Trash2 className="w-4.5 h-4.5" />
                          </button>
                        </td>
                      </tr>
                    )
                  })}
                  {entries.length === 0 && (
                    <tr>
                      <td colSpan={8} className="text-center py-16 text-gray-400 italic">
                        No entries found for the selected filters.
                      </td>
                    </tr>
                  )}
                </>
              )}
            </tbody>
          </table>
        </div>
        
        {/* Pagination */}
        {!loading && totalPages > 1 && (
          <div className="no-print border-t border-gray-100">
            <Pagination current={page} total={totalPages} onPageChange={setPage} />
          </div>
        )}
      </div>

      {/* Confirm Dialog */}
      <ConfirmDialog
        isOpen={confirmOpen}
        title={deleteTarget?.type === 'sale' ? 'Delete Sale?' : 'Delete Payment?'}
        message={
          deleteTarget?.type === 'sale'
            ? 'This will reverse the sale, return items to stock, and update the customer balance. Are you sure?'
            : 'This will reverse the payment and increase the customer\'s outstanding balance. Are you sure?'
        }
        onConfirm={handleDelete}
        onCancel={() => setConfirmOpen(false)}
        confirmText="Delete"
      />
    </div>
  )
}
