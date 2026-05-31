import { useState, useEffect } from 'react'
import { ipc } from '../lib/ipc'
import { Plus, Wallet, Trash2 } from 'lucide-react'
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
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10))
  const [notes, setNotes] = useState('')
  const [discount, setDiscount] = useState('')
  const [saving, setSaving] = useState(false)

  // Confirm dialog state
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [deleteId, setDeleteId] = useState(null)

  async function load() {
    setLoading(true)
    const offset = (page - 1) * LIMIT
    const [custs, data, count] = await Promise.all([
      ipc('customers:list', { limit: 1000 }), // Load more for select
      ipc('payments:list', { limit: LIMIT, offset }),
      ipc('payments:count')
    ])
    setCustomers(custs || [])
    setPayments(data || [])
    setTotal(Math.ceil((count || 0) / LIMIT))
    setLoading(false)
  }

  useEffect(() => { load() }, [page])

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
    setDate(new Date().toISOString().slice(0, 10))
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

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center gap-2">
        <Wallet className="w-6 h-6 text-gray-700" />
        <h1 className="text-2xl font-bold text-gray-800">Record Payment</h1>
      </div>

      <form onSubmit={handleSubmit} className="bg-white border border-gray-200 rounded-xl p-5 space-y-3 shadow-sm">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <select
            value={customerId}
            onChange={(e) => setCustomerId(e.target.value)}
            required
            className="px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white"
          >
            <option value="">Select customer</option>
            {customers.map((c) => <option key={c.id} value={c.id}>{c.name} (₹{(c.balance / 100).toFixed(2)})</option>)}
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
          <input
            type="number"
            step="0.01"
            placeholder="Amount Paid (₹)"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            required
            className="px-3 py-2 border border-gray-300 rounded-lg text-sm"
          />
          <input
            type="number"
            step="0.01"
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
        <div className="px-5 py-3 border-b border-gray-200 font-bold text-gray-700 text-sm">Recent Payments</div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-gray-500 font-bold uppercase text-[10px] tracking-wider">
              <tr>
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
                  <tr key={i}><td colSpan={7} className="px-5 py-3"><Skeleton className="h-6 w-full" /></td></tr>
                ))
              ) : (
                <>
                  {payments.map((p) => (
                    <tr key={p.id} className="hover:bg-gray-50 transition-colors">
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
                    <tr><td colSpan={7} className="text-center py-12 text-gray-400 italic">No payments recorded</td></tr>
                  )}
                </>
              )}
            </tbody>
          </table>
        </div>
        <Pagination current={page} total={total} onPageChange={setPage} />
      </div>

      <ConfirmDialog
        isOpen={confirmOpen}
        title="Delete Payment?"
        message="This will reverse the payment and increase the customer's outstanding balance. Are you sure?"
        onConfirm={handleDelete}
        onCancel={() => setConfirmOpen(false)}
        confirmText="Delete Record"
      />
    </div>
  )
}
