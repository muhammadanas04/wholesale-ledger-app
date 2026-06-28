import { useState, useEffect } from 'react'
import DatePicker from '../components/DatePicker'
import { ipc } from '../lib/ipc'
import { Plus, Receipt, Trash2, Download, Calendar, Search } from 'lucide-react'
import { otherExpenseSchema } from '../lib/schemas'
import { formatCurrency, formatDate } from '../lib/formatters'
import { toast } from 'sonner'
import Pagination from '../components/Pagination'
import Skeleton from '../components/Skeleton'
import ConfirmDialog from '../components/ConfirmDialog'

const LIMIT = 10

export default function OtherExpenses() {
  const [expenses, setExpenses] = useState([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(true)
  
  // Form States
  const [moneySpent, setMoneySpent] = useState('')
  const [moneyGained, setMoneyGained] = useState('')
  const [reason, setReason] = useState('')
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10))
  const [saving, setSaving] = useState(false)

  // Confirm dialog state
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [deleteId, setDeleteId] = useState(null)

  // Filter States
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [search, setSearch] = useState('')

  async function load() {
    setLoading(true)
    const hasFilter = dateFrom || dateTo || search
    const filters = {
      limit: hasFilter ? 100000 : 50,
      offset: 0,
      date_from: dateFrom || null,
      date_to: dateTo || null,
      search: search || null
    }
    const [data, count] = await Promise.all([
      ipc('other-expenses:list', filters),
      ipc('other-expenses:count', { date_from: dateFrom || null, date_to: dateTo || null, search: search || null })
    ])
    setExpenses(data || [])
    setTotal(1)
    setLoading(false)
  }

  useEffect(() => { load() }, [page, dateFrom, dateTo, search])

  async function handleSubmit(e) {
    e.preventDefault()

    const expenseData = {
      money_spent: moneySpent ? Number(moneySpent) : 0,
      money_gained: moneyGained ? Number(moneyGained) : 0,
      reason,
      date,
    }

    const result = otherExpenseSchema.safeParse(expenseData)
    if (!result.success) {
      return toast.error(result.error.errors[0].message)
    }

    if (expenseData.money_spent === 0 && expenseData.money_gained === 0) {
      return toast.error('You must specify either money spent or money gained')
    }

    setSaving(true)
    try {
      await ipc('other-expenses:add', {
        ...expenseData,
        money_spent: Math.round(expenseData.money_spent * 100),
        money_gained: Math.round(expenseData.money_gained * 100),
      })
      setMoneySpent('')
      setMoneyGained('')
      setReason('')
      setDate(new Date().toISOString().slice(0, 10))
      setSaving(false)
      setPage(1)
      load()
      toast.success('Expense record added successfully')
    } catch (err) {
      console.error(err)
      toast.error('Failed to add expense')
      setSaving(false)
    }
  }

  async function confirmDelete(id) {
    setDeleteId(id)
    setConfirmOpen(true)
  }

  async function handleDelete() {
    try {
      await ipc('other-expenses:delete', deleteId)
      setConfirmOpen(false)
      load()
      toast.success('Expense record deleted')
    } catch (e) {
      console.error(e)
      toast.error('Failed to delete expense record')
    }
  }

  const handleExportExcel = async () => {
    try {
      const data = await ipc('other-expenses:list', {
        limit: 100000,
        date_from: dateFrom || null,
        date_to: dateTo || null,
        search: search || null
      })
      if (!data || data.length === 0) {
        return toast.error('No expense data to export')
      }

      const headers = ["ID", "Date", "Reason", "Money Spent (₹)", "Money Gained (₹)"]
      const rows = data.map((exp) => [
        exp.id,
        formatDate(exp.date),
        exp.reason,
        exp.money_spent / 100,
        exp.money_gained / 100
      ])

      const success = await ipc('app:export-excel', 'Other_Expenses', headers, rows)
      if (success) {
        toast.success('Other expenses list exported successfully')
      }
    } catch (err) {
      console.error(err)
      toast.error('Failed to export expenses list')
    }
  }

  // Calculate totals for currently displayed page entries
  const pageSpentTotal = expenses.reduce((sum, e) => sum + (Number(e.money_spent) || 0), 0)
  const pageGainedTotal = expenses.reduce((sum, e) => sum + (Number(e.money_gained) || 0), 0)

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center gap-2">
        <Receipt className="w-6 h-6 text-gray-700" />
        <h1 className="text-2xl font-bold text-gray-800">Other Expenses</h1>
      </div>

      <form onSubmit={handleSubmit} className="bg-white border border-gray-200 rounded-xl p-5 space-y-3 shadow-sm">
        <h2 className="font-bold text-gray-800 text-sm uppercase tracking-wider mb-2">Record Expense/Income</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <input
            type="number"
            step="0.01"
            placeholder="Money Spent (₹)"
            value={moneySpent}
            onChange={(e) => setMoneySpent(e.target.value)}
            className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <input
            type="number"
            step="0.01"
            placeholder="Money Gained (₹)"
            value={moneyGained}
            onChange={(e) => setMoneyGained(e.target.value)}
            className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <input
            placeholder="Reason / Description"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            required
            className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <DatePicker
            value={date}
            onChange={(e) => setDate(e.target.value)}
            required
            className="px-3 py-2 border border-gray-300 rounded-lg text-sm cursor-pointer focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        <button
          type="submit"
          disabled={saving}
          className="flex items-center gap-2 px-4 py-2.5 bg-blue-600 text-white rounded-lg text-sm font-bold hover:bg-blue-700 disabled:opacity-50 shadow-sm transition-all"
        >
          <Plus className="w-4 h-4" /> {saving ? 'Recording...' : 'Record Entry'}
        </button>
      </form>

      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden shadow-sm">
        <div className="px-5 py-3 border-b border-gray-200 flex items-center justify-between">
          <span className="font-bold text-gray-700 text-sm">Expenses Log</span>
          <button
            type="button"
            onClick={handleExportExcel}
            className="flex items-center gap-1.5 px-3 py-1.5 border border-gray-300 bg-white text-gray-700 hover:bg-gray-50 rounded-xl text-xs font-bold transition-all shadow-sm"
          >
            <Download className="w-3.5 h-3.5" /> Export Excel
          </button>
        </div>
        
        <div className="px-5 py-2.5 bg-gray-50 border-b border-gray-150 flex flex-wrap items-center justify-between gap-3">
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
                className="px-3 py-1 bg-red-50 hover:bg-red-100 text-red-650 hover:text-red-750 rounded-xl text-xs font-bold transition-colors uppercase tracking-wider shadow-sm"
              >
                Clear
              </button>
            )}
          </div>

          <div className="relative w-full sm:w-64">
            <Search className="w-4 h-4 text-gray-400 absolute left-3 top-2.5" />
            <input
              type="text"
              placeholder="Search by reason..."
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(1); }}
              className="w-full pl-9 pr-3 py-1.5 border border-gray-300 rounded-xl text-xs bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 font-semibold"
            />
          </div>
        </div>

        <div className="overflow-auto max-h-[calc(100vh-200px)]">
          <table className="w-full text-sm relative">
            <thead className="sticky top-0 z-10 bg-gray-50 text-gray-500 font-bold uppercase text-[10px] tracking-wider shadow-[0_1px_0_0_#e5e7eb]">
              <tr>
                <th className="text-left px-5 py-3 w-32">Date</th>
                <th className="text-left px-5 py-3">Reason</th>
                <th className="text-right px-5 py-3 w-40">Money Spent</th>
                <th className="text-right px-5 py-3 w-40">Money Gained</th>
                <th className="text-center px-5 py-3 w-24">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {loading ? (
                [...Array(5)].map((_, i) => (
                  <tr key={i}><td colSpan={5} className="px-5 py-3"><Skeleton className="h-6 w-full" /></td></tr>
                ))
              ) : (
                <>
                  {expenses.map((exp) => (
                    <tr key={exp.id} className="hover:bg-gray-50 transition-colors">
                      <td className="px-5 py-3 text-gray-500 whitespace-nowrap">{formatDate(exp.date)}</td>
                      <td className="px-5 py-3 font-semibold text-gray-800">{exp.reason}</td>
                      <td className="px-5 py-3 text-right text-red-650 font-bold">
                        {exp.money_spent > 0 ? formatCurrency(exp.money_spent) : '-'}
                      </td>
                      <td className="px-5 py-3 text-right text-green-600 font-bold">
                        {exp.money_gained > 0 ? formatCurrency(exp.money_gained) : '-'}
                      </td>
                      <td className="px-5 py-3 text-center">
                        <button onClick={() => confirmDelete(exp.id)} className="p-1.5 text-red-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors">
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </td>
                    </tr>
                  ))}
                  {expenses.length === 0 && (
                    <tr><td colSpan={5} className="text-center py-12 text-gray-400 italic">No entries recorded</td></tr>
                  )}
                </>
              )}
            </tbody>
            {!loading && expenses.length > 0 && (
              <tfoot className="bg-gray-50 border-t-2 border-gray-200 text-xs font-bold text-gray-700">
                <tr>
                  <td className="px-5 py-3 text-gray-900 font-black uppercase tracking-wider" colSpan={2}>
                    Total
                  </td>
                  <td className="px-5 py-3 text-right font-black text-red-650 whitespace-nowrap">
                    {formatCurrency(pageSpentTotal)}
                  </td>
                  <td className="px-5 py-3 text-right font-black text-green-600 whitespace-nowrap">
                    {formatCurrency(pageGainedTotal)}
                  </td>
                  <td></td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>

      <ConfirmDialog
        isOpen={confirmOpen}
        title="Delete Expense Entry?"
        message="Are you sure you want to delete this expense record? This action cannot be undone."
        onConfirm={handleDelete}
        onCancel={() => setConfirmOpen(false)}
        confirmText="Delete Record"
      />
    </div>
  )
}
