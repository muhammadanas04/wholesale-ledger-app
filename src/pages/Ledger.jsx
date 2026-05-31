import { useState, useEffect } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { ipc } from '../lib/ipc'
import { BookOpen, Download, Trash2, Calendar, Users, RefreshCw, Printer } from 'lucide-react'
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
  const [datePreset, setDatePreset] = useState('current_month')

  const handlePresetChange = (preset) => {
    setDatePreset(preset)
    const today = new Date()
    const year = today.getFullYear()
    
    if (preset === 'current_month') {
      const firstDay = new Date(year, today.getMonth(), 1).toISOString().slice(0, 10)
      const lastDay = today.toISOString().slice(0, 10)
      setDateFrom(firstDay)
      setDateTo(lastDay)
    } else if (preset === 'custom') {
      // Keep custom dates
    } else {
      const monthMap = {
        january: 0, february: 1, march: 2, april: 3, may: 4, june: 5,
        july: 6, august: 7, september: 8, october: 9, november: 10, december: 11
      }
      const monthIdx = monthMap[preset]
      if (monthIdx !== undefined) {
        const firstDay = new Date(year, monthIdx, 1).toISOString().slice(0, 10)
        const lastDay = new Date(year, monthIdx + 1, 0).toISOString().slice(0, 10)
        setDateFrom(firstDay)
        setDateTo(lastDay)
      }
    }
    setPage(1)
  }

  const [type, setType] = useState('sale') // 'all', 'sale', 'payment'

  // Data States
  const [entries, setEntries] = useState([])
  const [summary, setSummary] = useState({ total_sales: 0, total_payments: 0, net_outstanding: 0, entry_count: 0 })
  const [page, setPage] = useState(1)
  const [totalPages, setTotalPages] = useState(0)
  const [loading, setLoading] = useState(true)

  // Dialog States
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState(null) // { id, type }
  const [roundingConfig, setRoundingConfig] = useState(null)

  useEffect(() => {
    async function loadConfig() {
      const rulesVal = await ipc('meta:get', 'rounding_rules')
      if (rulesVal) {
        try {
          setRoundingConfig(JSON.parse(rulesVal))
        } catch (e) {
          console.error('Failed to parse rounding rules:', e)
        }
      }
    }
    loadConfig()
  }, [])

  // Auto-detect modulus from rule range values
  function getModulus(from, to) {
    const maxVal = Math.max(Math.abs(from), Math.abs(to))
    if (maxVal < 1) return 1        // decimal rules: 0.0-0.9 → mod 1
    if (maxVal < 10) return 10       // ones digit: 0-9 → mod 10
    if (maxVal < 100) return 100     // tens: 10-99 → mod 100
    if (maxVal < 1000) return 1000   // hundreds: 100-999 → mod 1000
    return 10
  }

  // Apply rounding based on ceil/floor rules
  function applyRounding(amountInt, config) {
    const amount = Number(amountInt)
    if (isNaN(amount) || !config || !(config.enabled === true || config.enabled === 'true')) {
      return { discountInt: 0, finalInt: isNaN(amount) ? amountInt : amount }
    }

    const isNegative = amount < 0
    const absVal = Math.abs(amount)
    const amountDecimal = absVal / 100

    // Try each rule: ceil first, then floor
    const rules = [
      { ...config.ceil, action: 'ceil' },
      { ...config.floor, action: 'floor' }
    ]

    for (const rule of rules) {
      const fromVal = parseFloat(rule.from)
      const toVal = parseFloat(rule.to)
      if (isNaN(fromVal) || isNaN(toVal)) continue

      const modulus = getModulus(fromVal, toVal)
      const relevantPart = amountDecimal % modulus
      const eps = 0.0001

      if (relevantPart >= fromVal - eps && relevantPart <= toVal + eps) {
        let finalDecimal
        if (rule.action === 'ceil') {
          finalDecimal = amountDecimal - relevantPart
        } else {
          finalDecimal = amountDecimal - relevantPart + modulus
        }

        const finalInt = Math.round(finalDecimal * 100) * (isNegative ? -1 : 1)
        const discountInt = finalInt - amount
        return { discountInt, finalInt }
      }
    }

    return { discountInt: 0, finalInt: amount }
  }


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
    setDatePreset('current_month')
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

  // Calculate visible page column totals
  let pageDebit = 0
  let pageCredit = 0
  let pageDiscount = 0
  let pageFinalValue = 0

  entries.forEach((entry) => {
    const isSale = entry.type === 'sale'
    if (isSale) {
      pageDebit += entry.amount
      let discountInt = 0
      let finalInt = 0
      if (roundingConfig && roundingConfig.enabled) {
        const rounded = applyRounding(entry.amount, roundingConfig)
        discountInt = rounded.discountInt
        finalInt = rounded.finalInt
      } else {
        discountInt = -(entry.discount || 0)
        finalInt = entry.amount - (entry.discount || 0)
      }
      pageDiscount += discountInt
      pageFinalValue += finalInt
    } else {
      pageCredit += -entry.amount
      pageDiscount += entry.discount || 0
      pageFinalValue += -entry.amount + (entry.discount || 0)
    }
  })

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
            {customerId && (
              <Link
                to={`/customers/${customerId}`}
                className="text-xs font-bold text-blue-600 hover:text-blue-700 hover:underline flex items-center gap-1 mt-2 no-print"
                title="Go to customer profile to generate or print bills"
              >
                <Printer className="w-3.5 h-3.5 shrink-0" /> Print bills from customer section →
              </Link>
            )}
          </div>

          {/* Date Period preset select */}
          <div className="space-y-1.5">
            <label className="text-xs font-bold text-gray-500 uppercase tracking-wider">Date Period</label>
            <select
              value={datePreset}
              onChange={(e) => handlePresetChange(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-xl text-sm bg-white font-semibold text-slate-800"
            >
              <option value="current_month">Current Month</option>
              <option value="custom">Custom Dates...</option>
              <option disabled>──────────</option>
              <option value="january">January</option>
              <option value="february">February</option>
              <option value="march">March</option>
              <option value="april">April</option>
              <option value="may">May</option>
              <option value="june">June</option>
              <option value="july">July</option>
              <option value="august">August</option>
              <option value="september">September</option>
              <option value="october">October</option>
              <option value="november">November</option>
              <option value="december">December</option>
            </select>
          </div>

          {/* Date range filters (Rendered only for Custom Dates Preset) */}
          {datePreset === 'custom' && (
            <>
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-gray-500 uppercase tracking-wider">Date From</label>
                <div className="relative">
                  <Calendar className="w-4 h-4 text-gray-400 absolute left-3 top-2.5" />
                  <input
                    type="date"
                    value={dateFrom}
                    onChange={(e) => handleFilterChange(() => setDateFrom(e.target.value))}
                    onClick={(e) => {
                      try {
                        e.target.showPicker()
                      } catch (err) {
                        console.error(err)
                      }
                    }}
                    className="w-full pl-9 pr-3 py-2 border border-gray-300 rounded-xl text-sm cursor-pointer"
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
                    onClick={(e) => {
                      try {
                        e.target.showPicker()
                      } catch (err) {
                        console.error(err)
                      }
                    }}
                    className="w-full pl-9 pr-3 py-2 border border-gray-300 rounded-xl text-sm cursor-pointer"
                  />
                </div>
              </div>
            </>
          )}
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
                  className={`px-4 py-1.5 rounded-lg text-xs font-bold uppercase tracking-wider transition-all ${type === t
                      ? 'bg-white text-gray-900 shadow-sm'
                      : 'text-gray-500 hover:text-gray-800'
                    }`}
                >
                  {t === 'all' ? 'All' : t === 'sale' ? 'Sales' : 'Payments'}
                </button>
              ))}
            </div>
          </div>

          <div className="flex items-center gap-3 no-print">
            <button
              onClick={handleClearFilters}
              className="py-1.5 px-4 border border-gray-200 text-gray-650 rounded-xl text-xs font-bold hover:bg-gray-50 transition-colors uppercase tracking-wider shadow-sm"
            >
              Clear Filters
            </button>
          </div>

          {loading && (
            <div className="flex items-center gap-1.5 text-xs text-gray-400 italic">
              <RefreshCw className="w-3.5 h-3.5 animate-spin" /> Syncing view...
            </div>
          )}
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
                <th className="text-right px-6 py-3.5 w-36">Discount</th>
                <th className="text-right px-6 py-3.5 w-36">Final Value</th>
                <th className="text-left px-6 py-3.5">Notes</th>
                <th className="text-center px-6 py-3.5 w-20 no-print">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {loading ? (
                [...Array(10)].map((_, idx) => (
                  <tr key={idx}>
                    <td colSpan={10} className="px-6 py-4">
                      <Skeleton className="h-6 w-full" />
                    </td>
                  </tr>
                ))
              ) : (
                <>
                  {entries.map((entry, idx) => {
                    const isSale = entry.type === 'sale'

                    // Calculate rounding/discount for sale amount
                    let discountInt = 0
                    let finalInt = 0
                    if (isSale) {
                      if (roundingConfig && roundingConfig.enabled) {
                        const result = applyRounding(entry.amount, roundingConfig)
                        discountInt = result.discountInt
                        finalInt = result.finalInt
                      } else {
                        discountInt = -(entry.discount || 0)
                        finalInt = entry.amount - (entry.discount || 0)
                      }
                    }

                    return (
                      <tr key={idx} className="hover:bg-gray-50 transition-colors">
                        <td className="px-6 py-4 text-gray-500 whitespace-nowrap">{formatDate(entry.date)}</td>
                        <td className="px-6 py-4 font-semibold text-gray-900">
                          <Link to={`/customers/${entry.customer_id}`} className="hover:text-blue-600 transition-colors">
                            {entry.customer_name}
                          </Link>
                        </td>
                        <td className="px-6 py-4 text-center whitespace-nowrap">
                          <span className={`px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider ${isSale
                              ? 'bg-orange-50 text-orange-700 border border-orange-100'
                              : 'bg-green-50 text-green-700 border border-green-100'
                            }`}>
                            {entry.type}
                          </span>
                        </td>
                        <td className="px-6 py-4 text-gray-500 whitespace-nowrap font-medium uppercase text-xs">
                          <div>{isSale ? `Sale #${entry.id}` : `Pay #${entry.id}`}</div>
                          {isSale && entry.weight > 0 && (
                            <span className="text-[10px] font-bold text-gray-400 block mt-0.5 lowercase tracking-normal">
                              {entry.weight} kg
                            </span>
                          )}
                        </td>
                        <td className="px-6 py-4 text-right font-bold text-orange-600">
                          {isSale ? formatCurrency(entry.amount) : '-'}
                        </td>
                        <td className="px-6 py-4 text-right font-bold text-green-600">
                          {!isSale ? formatCurrency(-entry.amount) : '-'}
                        </td>
                        <td className="px-6 py-4 text-right whitespace-nowrap">
                          {isSale ? (
                            discountInt < 0 ? (
                              <span className="font-bold text-red-500">
                                {formatCurrency(discountInt)}
                              </span>
                            ) : discountInt > 0 ? (
                              <span className="font-bold text-emerald-600">
                                +{formatCurrency(discountInt)}
                              </span>
                            ) : (
                              <span className="text-gray-400 font-medium">-</span>
                            )
                          ) : (
                            entry.discount > 0 ? (
                              <span className="font-bold text-emerald-600">
                                +{formatCurrency(entry.discount)}
                              </span>
                            ) : (
                              <span className="text-gray-400 font-medium">-</span>
                            )
                          )}
                        </td>
                        <td className="px-6 py-4 text-right font-bold text-gray-800 whitespace-nowrap">
                          {isSale ? formatCurrency(finalInt) : formatCurrency(-entry.amount + entry.discount)}
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
                      <td colSpan={10} className="text-center py-16 text-gray-400 italic">
                        No entries found for the selected filters.
                      </td>
                    </tr>
                  )}
                </>
              )}
              </tbody>
              {!loading && entries.length > 0 && (
                <tfoot className="bg-slate-100 font-black text-slate-900 border-t-2 border-slate-300">
                  <tr className="bg-slate-55 hover:bg-slate-50 transition-colors">
                    <td className="px-6 py-4 text-slate-800 font-black whitespace-nowrap">Total (Page)</td>
                    <td className="px-6 py-4"></td>
                    <td className="px-6 py-4"></td>
                    <td className="px-6 py-4"></td>
                    <td className="px-6 py-4 text-right font-black text-orange-600 whitespace-nowrap">
                      {formatCurrency(pageDebit)}
                    </td>
                    <td className="px-6 py-4 text-right font-black text-green-600 whitespace-nowrap">
                      {formatCurrency(pageCredit)}
                    </td>
                    <td className="px-6 py-4 text-right whitespace-nowrap font-black">
                      {pageDiscount < 0 ? (
                        <span className="text-red-500">
                          {formatCurrency(pageDiscount)}
                        </span>
                      ) : pageDiscount > 0 ? (
                        <span className="text-emerald-600">
                          +{formatCurrency(pageDiscount)}
                        </span>
                      ) : (
                        <span className="text-gray-400 font-medium">-</span>
                      )}
                    </td>
                    <td className="px-6 py-4 text-right font-black text-slate-950 whitespace-nowrap">
                      {formatCurrency(pageFinalValue)}
                    </td>
                    <td className="px-6 py-4"></td>
                    <td className="px-6 py-4 no-print"></td>
                  </tr>
                </tfoot>
              )}
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
