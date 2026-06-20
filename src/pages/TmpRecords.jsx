import { useState, useEffect } from 'react'
import { ipc } from '../lib/ipc'
import { Clock, Download, Calendar, Filter } from 'lucide-react'
import { formatCurrency, formatDate } from '../lib/formatters'
import { toast } from 'sonner'
import Pagination from '../components/Pagination'
import Skeleton from '../components/Skeleton'

const LIMIT = 15

export default function TmpRecords() {
  const [records, setRecords] = useState([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(true)

  // Filter States
  const [type, setType] = useState('all')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')

  async function load() {
    setLoading(true)
    const offset = (page - 1) * LIMIT
    const filters = {
      limit: LIMIT,
      offset,
      type: type || 'all',
      date_from: dateFrom || null,
      date_to: dateTo || null
    }

    try {
      const [resList, resCount] = await Promise.all([
        ipc('tmp-records:list', filters),
        ipc('tmp-records:count', { type: type || 'all', date_from: dateFrom || null, date_to: dateTo || null })
      ])

      if (resList !== null) {
        setRecords(resList || [])
      } else {
        toast.error('Failed to load temporary records')
      }

      if (resCount !== null) {
        setTotal(resCount || 0)
      }
    } catch (err) {
      console.error(err)
      toast.error('Error loading temporary records')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [page, type, dateFrom, dateTo])

  const handleExportExcel = async () => {
    try {
      const data = await ipc('tmp-records:list', {
        limit: 100000,
        offset: 0,
        type: type || 'all',
        date_from: dateFrom || null,
        date_to: dateTo || null
      })

      if (!data || data.length === 0) {
        return toast.error('No temporary records data to export')
      }
      const headers = [
        "ID",
        "Type",
        "Customer / Reason",
        "Phone",
        "Qty",
        "Weight (kg)",
        "Rate (₹/kg)",
        "Discount (₹)",
        "Total / Amount (₹)",
        "Date"
      ]

      const rows = data.map((rec) => [
        rec.id,
        rec.type.toUpperCase(),
        rec.type === 'other' ? rec.reason : rec.customer_name,
        rec.customer_phone || '—',
        rec.qty != null ? rec.qty : '—',
        rec.weight != null ? rec.weight : '—',
        rec.rate != null ? rec.rate / 100 : '—',
        rec.discount != null ? rec.discount / 100 : '—',
        rec.type === 'other' ? (rec.amount || 0) / 100 : (rec.total_value || 0) / 100,
        formatDate(rec.date)
      ])

      const success = await ipc('app:export-excel', 'Temporary_Records', headers, rows)
      if (success) {
        toast.success('Temporary records list exported successfully')
      }
    } catch (err) {
      console.error(err)
      toast.error('Failed to export temporary records list')
    }
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center gap-2">
        <Clock className="w-6 h-6 text-gray-700" />
        <h1 className="text-2xl font-bold text-gray-800">Temporary Records</h1>
      </div>

      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden shadow-sm">
        <div className="px-5 py-3 border-b border-gray-200 flex items-center justify-between">
          <span className="font-bold text-gray-700 text-sm">Informational Logs</span>
          <button
            type="button"
            onClick={handleExportExcel}
            className="flex items-center gap-1.5 px-3 py-1.5 border border-gray-300 bg-white text-gray-700 hover:bg-gray-50 rounded-xl text-xs font-bold transition-all shadow-sm"
          >
            <Download className="w-3.5 h-3.5" /> Export Excel
          </button>
        </div>

        {/* Filter Toolbar */}
        <div className="px-5 py-2.5 bg-gray-50 border-b border-gray-150 flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-3">
            {/* Type Filter */}
            <div className="flex items-center gap-2">
              <Filter className="w-4 h-4 text-gray-450 shrink-0" />
              <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Type:</span>
              <select
                value={type}
                onChange={(e) => { setType(e.target.value); setPage(1); }}
                className="px-2.5 py-1 border border-gray-300 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white font-semibold text-slate-800"
              >
                <option value="all">All</option>
                <option value="sale">Sale</option>
                <option value="payment">Payment</option>
                <option value="other">Other</option>
              </select>
            </div>

            {/* Date Range Filter */}
            <div className="flex items-center gap-2">
              <Calendar className="w-4 h-4 text-gray-450 shrink-0" />
              <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Filter Date:</span>
              <input
                type="date"
                value={dateFrom}
                onChange={(e) => { setDateFrom(e.target.value); setPage(1); }}
                className="px-2.5 py-1 border border-gray-300 rounded-xl text-xs cursor-pointer focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white font-semibold text-slate-800"
              />
              <span className="text-xs font-bold text-gray-400">to</span>
              <input
                type="date"
                value={dateTo}
                onChange={(e) => { setDateTo(e.target.value); setPage(1); }}
                className="px-2.5 py-1 border border-gray-300 rounded-xl text-xs cursor-pointer focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white font-semibold text-slate-800"
              />
              {(dateFrom || dateTo || type !== 'all') && (
                <button
                  type="button"
                  onClick={() => { setDateFrom(''); setDateTo(''); setType('all'); setPage(1); }}
                  className="px-3 py-1 bg-red-50 hover:bg-red-100 text-red-650 hover:text-red-750 rounded-xl text-xs font-bold transition-colors uppercase tracking-wider shadow-sm"
                >
                  Clear Filters
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Table view */}
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-gray-500 font-bold uppercase text-[10px] tracking-wider">
              <tr>
                <th className="text-left px-5 py-3 w-28">Type</th>
                <th className="text-left px-5 py-3">Customer / Reason</th>
                <th className="text-left px-5 py-3 w-36">Phone</th>
                <th className="text-right px-5 py-3 w-24">Qty</th>
                <th className="text-right px-5 py-3 w-28">Weight</th>
                <th className="text-right px-5 py-3 w-28">Rate</th>
                <th className="text-right px-5 py-3 w-28">Discount</th>
                <th className="text-right px-5 py-3 w-32">Total / Amount</th>
                <th className="text-left px-5 py-3 w-32">Date</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {loading ? (
                [...Array(LIMIT)].map((_, i) => (
                  <tr key={i}>
                    <td colSpan={9} className="px-5 py-3">
                      <Skeleton className="h-6 w-full" />
                    </td>
                  </tr>
                ))
              ) : (
                <>
                  {records.map((rec) => {
                    let badgeClass = "bg-blue-50 text-blue-700 border border-blue-200"
                    let displayType = "Sale"
                    if (rec.type === 'payment') {
                      badgeClass = "bg-green-50 text-green-700 border border-green-200"
                      displayType = "Payment"
                    } else if (rec.type === 'other') {
                      badgeClass = "bg-orange-50 text-orange-700 border border-orange-200"
                      displayType = "Other"
                    }

                    const isOther = rec.type === 'other'

                    return (
                      <tr key={rec.id} className="hover:bg-gray-50 transition-colors">
                        <td className="px-5 py-3 whitespace-nowrap">
                          <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${badgeClass}`}>
                            {displayType}
                          </span>
                        </td>
                        <td className="px-5 py-3 font-semibold text-gray-800">
                          {isOther ? rec.reason : rec.customer_name}
                        </td>
                        <td className="px-5 py-3 text-gray-600 whitespace-nowrap">
                          {rec.customer_phone || '—'}
                        </td>
                        <td className="px-5 py-3 text-right text-gray-700">
                          {rec.qty != null ? rec.qty : '—'}
                        </td>
                        <td className="px-5 py-3 text-right text-gray-700">
                          {rec.weight != null ? `${rec.weight} kg` : '—'}
                        </td>
                        <td className="px-5 py-3 text-right text-gray-750">
                          {rec.rate != null ? formatCurrency(rec.rate) + '/kg' : '—'}
                        </td>
                        <td className="px-5 py-3 text-right text-red-650">
                          {rec.discount > 0 ? formatCurrency(rec.discount) : '—'}
                        </td>
                        <td className="px-5 py-3 text-right font-bold text-slate-800">
                          {isOther ? formatCurrency(rec.amount || 0) : formatCurrency(rec.total_value || 0)}
                        </td>
                        <td className="px-5 py-3 text-gray-500 whitespace-nowrap">
                          {formatDate(rec.date)}
                        </td>
                      </tr>
                    )
                  })}
                  {records.length === 0 && (
                    <tr>
                      <td colSpan={9} className="text-center py-12 text-gray-400 italic">
                        No temporary records found
                      </td>
                    </tr>
                  )}
                </>
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination bar */}
        {!loading && total > LIMIT && (
          <div className="px-5 py-3 border-t border-gray-200">
            <Pagination
              current={page}
              total={total}
              limit={LIMIT}
              onChange={setPage}
            />
          </div>
        )}
      </div>
    </div>
  )
}
