import { useState, useEffect } from 'react'
import { useParams, Link } from 'react-router-dom'
import { ipc } from '../lib/ipc'
import { ArrowLeft, Phone, MapPin, Trash2, Download } from 'lucide-react'

const fmt = (n) => `₹${(n / 100).toLocaleString('en-IN')}`

export default function CustomerDetail() {
  const { id } = useParams()
  const [customer, setCustomer] = useState(null)
  const [sales, setSales] = useState([])
  const [payments, setPayments] = useState([])

  async function load() {
    const c = await ipc('customers:get', Number(id))
    setCustomer(c)

    const allSales = await ipc('sales:list') || []
    setSales(allSales.filter((s) => s.customer_id === Number(id)))

    const p = await ipc('payments:by-customer', Number(id)) || []
    setPayments(p)
  }

  useEffect(() => {
    load()
  }, [id])

  async function handleDeleteSale(saleId) {
    if (!confirm('Are you sure you want to delete this sale? Stock levels and customer balance will be reversed.')) return
    await ipc('sales:delete', saleId)
    load()
  }

  async function handleDownloadPDF() {
    await ipc('app:print-to-pdf', `Ledger_${customer.name.replace(/\s+/g, '_')}`)
  }

  if (!customer) return <div className="p-6 text-gray-400">Loading...</div>

  const transactions = [
    ...sales.map((s) => ({ type: 'sale', date: s.date, desc: `Sale #${s.id}`, amount: s.total_amount, id: s.id })),
    ...payments.map((p) => ({ type: 'payment', date: p.date, desc: p.notes || 'Payment', amount: -p.amount, id: p.id })),
  ].sort((a, b) => b.date.localeCompare(a.date))

  let running = customer.balance
  const rows = transactions.map((t) => {
    const current = running
    running -= t.amount
    return { ...t, running: current }
  })

  return (
    <div className="p-6 space-y-6">
      <div className="print-only mb-6 border-b pb-4">
        <h1 className="text-3xl font-bold text-gray-800">Customer Ledger</h1>
        <p className="text-xl font-medium mt-1">{customer.name}</p>
        <div className="flex gap-4 text-sm text-gray-500 mt-1">
          {customer.phone && <span>Phone: {customer.phone}</span>}
          {customer.address && <span>Address: {customer.address}</span>}
        </div>
      </div>

      <div className="flex items-center justify-between no-print">
        <Link to="/customers" className="flex items-center gap-1 text-sm text-blue-600 hover:underline">
          <ArrowLeft className="w-4 h-4" /> Back to Customers
        </Link>
        <button
          onClick={handleDownloadPDF}
          className="flex items-center gap-2 px-4 py-2 bg-gray-100 text-gray-600 rounded-lg text-sm font-medium hover:bg-gray-200"
        >
          <Download className="w-4 h-4" /> Print Ledger
        </button>
      </div>

      <div className="bg-white border border-gray-200 rounded-xl p-5">
        <h1 className="text-2xl font-bold text-gray-800 no-print">{customer.name}</h1>
        <div className="flex items-center gap-4 text-sm text-gray-500 mt-2 no-print">
          {customer.phone && <span className="flex items-center gap-1"><Phone className="w-3 h-3" />{customer.phone}</span>}
          {customer.address && <span className="flex items-center gap-1"><MapPin className="w-3 h-3" />{customer.address}</span>}
        </div>
        <p className="text-lg font-bold mt-3">
          Outstanding Balance: <span className={customer.balance > 0 ? 'text-orange-600' : 'text-green-600'}>{fmt(customer.balance)}</span>
        </p>
      </div>

      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        <div className="px-5 py-3 border-b border-gray-200 font-semibold text-gray-700 text-sm">Ledger</div>
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-gray-500">
            <tr>
              <th className="text-left px-4 py-2">Date</th>
              <th className="text-left px-4 py-2">Description</th>
              <th className="text-right px-4 py-2">Amount</th>
              <th className="text-right px-4 py-2">Balance</th>
              <th className="text-center px-4 py-2 no-print">Action</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i} className="border-t border-gray-100">
                <td className="px-4 py-2 text-gray-500">{r.date}</td>
                <td className="px-4 py-2">{r.desc}</td>
                <td className={`px-4 py-2 text-right ${r.amount > 0 ? 'text-orange-600' : 'text-green-600'}`}>
                  {r.amount > 0 ? fmt(r.amount) : `-${fmt(-r.amount)}`}
                </td>
                <td className="px-4 py-2 text-right font-medium">{fmt(Math.abs(r.running))}{r.running > 0 ? ' Dr' : ' Cr'}</td>
                <td className="px-4 py-2 text-center no-print">
                  {r.type === 'sale' && (
                    <button onClick={() => handleDeleteSale(r.id)} className="p-1 text-red-400 hover:text-red-600">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr><td colSpan={5} className="text-center py-8 text-gray-400">No transactions yet</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
