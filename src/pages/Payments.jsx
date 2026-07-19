import { useState, useEffect } from 'react'
import DatePicker from '../components/DatePicker'
import CustomerSelect from '../components/CustomerSelect'
import BulkEntryModal from '../components/BulkEntryModal'
import { ipc } from '../lib/ipc'
import { Plus, Wallet, Trash2, Download, Calendar, Layers } from 'lucide-react'
import { paymentSchema } from '../lib/schemas'
import { formatCurrency, formatDate } from '../lib/formatters'
import { toast } from 'sonner'
import Pagination from '../components/Pagination'
import Skeleton from '../components/Skeleton'
import ConfirmDialog from '../components/ConfirmDialog'

const LIMIT = 10

export default function Payments() {
  const [customers, setCustomers] = useState([])
  const [payments, setPayments] = useState([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(true)
  const [customerId, setCustomerId] = useState('')
  const [amount, setAmount] = useState('')
  const [date, setDate] = useState(() => sessionStorage.getItem('lastSelectedPaymentDate') || new Date().toISOString().slice(0, 10))
  const [notes, setNotes] = useState('')
  const [discount, setDiscount] = useState('')
  const [saving, setSaving] = useState(false)
  const [showBulkEntry, setShowBulkEntry] = useState(false)

  // Confirm dialog state
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [deleteId, setDeleteId] = useState(null)

  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')

  async function load() {
    setLoading(true)
    const hasFilter = dateFrom || dateTo
    const filters = {
      limit: hasFilter ? 100000 : 50,
      offset: 0,
      date_from: dateFrom || null,
      date_to: dateTo || null
    }
    const [custs, data, count] = await Promise.all([
      ipc('customers:list', { limit: 100000 }), // Load more for select
      ipc('payments:list', filters),
      ipc('payments:count', { date_from: dateFrom || null, date_to: dateTo || null })
    ])
    setCustomers(custs || [])
    setPayments(data || [])
    setTotal(1)
    setLoading(false)
  }

  useEffect(() => { load() }, [page, dateFrom, dateTo])

  async function handleSubmit(e) {
    e.preventDefault()

    const paymentData = {
      customer_id: Number(customerId),
      amount: Number(amount),
      date,
      notes: notes || null,
      discount: discount ? Number(discount) : 0,
    }

    const result = paymentSchema.safeParse(paymentData)
    if (!result.success) {
      return toast.error(result.error.errors[0].message)
    }

    setSaving(true)
    await ipc('payments:add', {
      ...paymentData,
      amount: Math.round(paymentData.amount * 100),
      discount: Math.round(paymentData.discount * 100),
    })
    setCustomerId('')
    setAmount('')
    setDiscount('')
    setNotes('')
    setSaving(false)
    setPage(1)
    load()
    toast.success('Payment recorded')
  }

  async function confirmDelete(id) {
    setDeleteId(id)
    setConfirmOpen(true)
  }

  async function handleDelete() {
    await ipc('payments:delete', deleteId)
    setConfirmOpen(false)
    load()
    toast.success('Payment deleted')
  }

  const handleExportExcel = async () => {
    try {
      const data = await ipc('payments:list', {
        limit: 100000,
        date_from: dateFrom || null,
        date_to: dateTo || null
      })
      if (!data || data.length === 0) {
        return toast.error('No payments to export')
      }

      const headers = ["Payment ID", "Date", "Customer Name", "Amount Paid (₹)", "Discount Given (₹)", "Final Payment (₹)", "Notes"]
      const rows = data.map((p) => [
        p.id,
        formatDate(p.date),
        p.customer_name,
        p.amount / 100,
        (p.discount || 0) / 100,
        (p.amount - (p.discount || 0)) / 100,
        p.notes || ''
      ])

      const success = await ipc('app:export-excel', 'Recent_Payments', headers, rows)
      if (success) {
        toast.success('Payments list exported successfully')
      }
    } catch (err) {
      console.error(err)
      toast.error('Failed to export payments')
    }
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Wallet className="w-6 h-6 text-gray-700" />
          <h1 className="text-2xl font-bold text-gray-800">Record Payment</h1>
        </div>
        <button
          type="button"
          onClick={() => setShowBulkEntry(true)}
          className="flex items-center gap-2 px-4 py-2.5 bg-gradient-to-r from-indigo-600 to-blue-600 text-white hover:from-indigo-700 hover:to-blue-700 rounded-xl text-xs font-bold uppercase tracking-wider transition-all shadow-md"
        >
          <Layers className="w-4 h-4" />
          Bulk Entry
        </button>
      </div>

      <form onSubmit={handleSubmit} className="bg-white border border-gray-200 rounded-xl p-5 space-y-3 shadow-sm">
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
              sessionStorage.setItem('lastSelectedPaymentDate', e.target.value)
            }}
            required
            className="px-3 py-2 border border-gray-300 rounded-lg text-sm cursor-pointer"
          />
          <input
            type="number"
            step="any"
            placeholder="Amount Paid (₹)"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            required
            className="px-3 py-2 border border-gray-300 rounded-lg text-sm"
          />
          <input
            type="number"
            step="any"
            placeholder="Discount (₹, optional)"
            value={discount}
            onChange={(e) => setDiscount(e.target.value)}
            className="px-3 py-2 border border-gray-300 rounded-lg text-sm"
          />
          <input
            placeholder="Notes (optional)"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            className="px-3 py-2 border border-gray-300 rounded-lg text-sm md:col-span-2"
          />
        </div>
        <button
          type="submit"
          disabled={saving}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-bold hover:bg-blue-700 disabled:opacity-50 shadow-sm"
        >
          <Plus className="w-4 h-4" /> {saving ? 'Recording...' : 'Record Payment'}
        </button>
      </form>

      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden shadow-sm">
        <div className="px-5 py-3 border-b border-gray-200 flex items-center justify-between">
          <span className="font-bold text-gray-700 text-sm">Recent Payments</span>
          <button
            type="button"
            onClick={handleExportExcel}
            className="flex items-center gap-1.5 px-3 py-1.5 border border-gray-300 bg-white text-gray-700 hover:bg-gray-50 rounded-xl text-xs font-bold transition-all shadow-sm"
          >
            <Download className="w-3.5 h-3.5" /> Export Excel
          </button>
        </div>
        <div className="px-5 py-2.5 bg-gray-50 border-b border-gray-150 flex flex-wrap items-center gap-3">
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
                className="px-3 py-1 bg-red-50 hover:bg-red-100 text-red-600 hover:text-red-700 rounded-xl text-xs font-bold transition-colors uppercase tracking-wider shadow-sm"
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
                <th className="text-center px-5 py-3 w-12">#</th>
                <th className="text-left px-5 py-3">Date</th>
                <th className="text-left px-5 py-3">Customer</th>
                <th className="text-right px-5 py-3">Amount</th>
                <th className="text-right px-5 py-3">Discount</th>
                <th className="text-right px-5 py-3">Final Payment</th>
                <th className="text-left px-5 py-3">Notes</th>
                <th className="text-center px-5 py-3">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {loading ? (
                [...Array(5)].map((_, i) => (
                  <tr key={i}><td colSpan={8} className="px-5 py-3"><Skeleton className="h-6 w-full" /></td></tr>
                ))
              ) : (
                <>
                  {payments.map((p, index) => (
                    <tr key={p.id} className="hover:bg-gray-50 transition-colors">
                      <td className="text-center px-5 py-3 text-gray-400 font-medium">{index + 1}</td>
                      <td className="px-5 py-3 text-gray-500 whitespace-nowrap">{formatDate(p.date)}</td>
                      <td className="px-5 py-3 font-medium text-gray-800">{p.customer_name}</td>
                      <td className="px-5 py-3 text-right text-green-600 font-bold">{formatCurrency(p.amount)}</td>
                      <td className="px-5 py-3 text-right text-red-600 font-bold">
                        {p.discount > 0 ? (
                          <span>-{formatCurrency(p.discount)}</span>
                        ) : (
                          <span className="text-gray-400 font-medium">-</span>
                        )}
                      </td>
                      <td className="px-5 py-3 text-right text-slate-900 font-black whitespace-nowrap">
                        {formatCurrency(p.amount - (p.discount || 0))}
                      </td>
                      <td className="px-5 py-3 text-gray-500 italic text-xs">{p.notes || '-'}</td>
                      <td className="px-5 py-3 text-center">
                        <button onClick={() => confirmDelete(p.id)} className="p-1.5 text-red-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors">
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </td>
                    </tr>
                  ))}
                  {payments.length === 0 && (
                    <tr><td colSpan={8} className="text-center py-12 text-gray-400 italic">No payments recorded</td></tr>
                  )}
                </>
              )}
            </tbody>
            {!loading && payments.length > 0 && (
              <tfoot className="bg-slate-100 font-black text-slate-900 border-t-2 border-slate-300">
                <tr className="hover:bg-slate-50 transition-colors">
                  <td colSpan={3} className="px-5 py-3 text-slate-800 font-black text-right whitespace-nowrap">Total (Page)</td>
                  <td className="px-5 py-3 text-right font-black text-green-600 whitespace-nowrap">
                    {formatCurrency(payments.reduce((sum, p) => sum + p.amount, 0))}
                  </td>
                  <td className="px-5 py-3 text-right whitespace-nowrap">
                    {payments.reduce((sum, p) => sum + (p.discount || 0), 0) > 0 ? (
                      <span className="text-red-500 font-bold">
                        -{formatCurrency(payments.reduce((sum, p) => sum + (p.discount || 0), 0))}
                      </span>
                    ) : (
                      <span className="text-gray-400 font-medium">-</span>
                    )}
                  </td>
                  <td className="px-5 py-3 text-right font-black whitespace-nowrap text-slate-900">
                    {formatCurrency(payments.reduce((sum, p) => sum + p.amount - (p.discount || 0), 0))}
                  </td>
                  <td colSpan={2}></td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>

      <ConfirmDialog
        isOpen={confirmOpen}
        title="Delete Payment?"
        message="This will reverse the payment and increase the customer's outstanding balance. Are you sure?"
        onConfirm={handleDelete}
        onCancel={() => setConfirmOpen(false)}
        confirmText="Delete Record"
      />

      {/* Bulk Entry Modal */}
      <BulkEntryModal
        isOpen={showBulkEntry}
        onClose={() => setShowBulkEntry(false)}
        mode="payment"
        customers={customers}
        onMergeComplete={load}
      />
    </div>
  )
}
