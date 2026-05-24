import { useState, useEffect } from 'react'
import { ipc } from '../lib/ipc'
import { Plus, Wallet, Trash2 } from 'lucide-react'
import { paymentSchema } from '../lib/schemas'
import { toast } from 'sonner'

export default function Payments() {
  const [customers, setCustomers] = useState([])
  const [payments, setPayments] = useState([])
  const [customerId, setCustomerId] = useState('')
  const [amount, setAmount] = useState('')
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10))
  const [notes, setNotes] = useState('')
  const [saving, setSaving] = useState(false)

  async function load() {
    setCustomers(await ipc('customers:list') || [])
    setPayments(await ipc('payments:list') || [])
  }

  useEffect(() => { load() }, [])

  const fmt = (n) => `₹${(n / 100).toLocaleString('en-IN')}`

  async function handleSubmit(e) {
    e.preventDefault()
    
    const paymentData = {
      customer_id: Number(customerId),
      amount: Number(amount),
      date,
      notes: notes || null,
    }

    const result = paymentSchema.safeParse(paymentData)
    if (!result.success) {
      return toast.error(result.error.errors[0].message)
    }

    setSaving(true)
    await ipc('payments:add', {
      ...paymentData,
      amount: Math.round(paymentData.amount * 100),
    })
    setCustomerId('')
    setAmount('')
    setDate(new Date().toISOString().slice(0, 10))
    setNotes('')
    setSaving(false)
    load()
    toast.success('Payment recorded')
  }

  async function handleDeletePayment(id) {
    if (!confirm('Are you sure you want to delete this payment record? Customer balance will be reversed.')) return
    await ipc('payments:delete', id)
    load()
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center gap-2">
        <Wallet className="w-6 h-6 text-gray-700" />
        <h1 className="text-2xl font-bold text-gray-800">Record Payment</h1>
      </div>

      <form onSubmit={handleSubmit} className="bg-white border border-gray-200 rounded-xl p-5 space-y-3">
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
          <input
            type="number"
            step="0.01"
            placeholder="Amount (₹)"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            required
            className="px-3 py-2 border border-gray-300 rounded-lg text-sm"
          />
          <input
            placeholder="Notes (optional)"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            className="px-3 py-2 border border-gray-300 rounded-lg text-sm"
          />
        </div>
        <button
          type="submit"
          disabled={saving}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
        >
          <Plus className="w-4 h-4" /> {saving ? 'Recording...' : 'Record Payment'}
        </button>
      </form>

      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        <div className="px-5 py-3 border-b border-gray-200 font-semibold text-gray-700 text-sm">Recent Payments</div>
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-gray-500">
            <tr>
              <th className="text-left px-4 py-2">Date</th>
              <th className="text-left px-4 py-2">Customer</th>
              <th className="text-right px-4 py-2">Amount</th>
              <th className="text-left px-4 py-2">Notes</th>
              <th className="text-center px-4 py-2">Action</th>
            </tr>
          </thead>
          <tbody>
            {payments.map((p) => (
              <tr key={p.id} className="border-t border-gray-100">
                <td className="px-4 py-2 text-gray-500">{p.date}</td>
                <td className="px-4 py-2">{p.customer_name}</td>
                <td className="px-4 py-2 text-right text-green-600 font-medium">{fmt(p.amount)}</td>
                <td className="px-4 py-2 text-gray-500">{p.notes || '-'}</td>
                <td className="px-4 py-2 text-center">
                  <button onClick={() => handleDeletePayment(p.id)} className="p-1 text-red-400 hover:text-red-600">
                    <Trash2 className="w-4 h-4" />
                  </button>
                </td>
              </tr>
            ))}
            {payments.length === 0 && (
              <tr><td colSpan={5} className="text-center py-8 text-gray-400">No payments recorded</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
