import { useState, useEffect } from 'react'
import { useParams, Link } from 'react-router-dom'
import { ipc } from '../lib/ipc'
import { ArrowLeft, Phone, MapPin, Trash2, Download } from 'lucide-react'
import { formatCurrency, formatDate, formatPhone } from '../lib/formatters'
import Skeleton from '../components/Skeleton'
import ConfirmDialog from '../components/ConfirmDialog'
import { toast } from 'sonner'

export default function CustomerDetail() {
  const { id } = useParams()
  const [customer, setCustomer] = useState(null)
  const [sales, setSales] = useState([])
  const [payments, setPayments] = useState([])
  const [loading, setLoading] = useState(true)

  // Confirm dialog state
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [deleteSaleId, setDeleteSaleId] = useState(null)
  const [showPrices, setShowPrices] = useState(true)

  useEffect(() => {
    async function checkPricePref() {
      const val = await ipc('meta:get', 'show_price_customers')
      setShowPrices(val !== 'false')
    }
    checkPricePref()
  }, [])

  async function load() {
    setLoading(true)
    const [c, allSales, p] = await Promise.all([
      ipc('customers:get', Number(id)),
      ipc('sales:list', { limit: 1000 }), // Filter locally for simple ledger
      ipc('payments:by-customer', Number(id))
    ])
    
    setCustomer(c)
    setSales((allSales || []).filter((s) => s.customer_id === Number(id)))
    setPayments(p || [])
    setLoading(false)
  }

  useEffect(() => { load() }, [id])

  async function confirmDeleteSale(saleId) {
    setDeleteSaleId(saleId)
    setConfirmOpen(true)
  }

  async function handleDeleteSale() {
    await ipc('sales:delete', deleteSaleId)
    setConfirmOpen(false)
    load()
    toast.success('Sale deleted')
  }

  async function handleDownloadPDF() {
    await ipc('app:print-to-pdf', `Ledger_${customer.name.replace(/\s+/g, '_')}`)
  }

  if (loading) return (
    <div className="p-6 space-y-6">
      <Skeleton className="h-32 w-full" />
      <Skeleton className="h-64 w-full" />
    </div>
  )

  if (!customer) return <div className="p-6 text-gray-400">Customer not found</div>

  const transactions = [
    ...sales.map((s) => ({
      type: 'sale',
      date: s.date,
      desc: s.weight > 0 ? `Sale #${s.id} (${s.weight} kg)` : `Sale #${s.id}`,
      amount: s.total_amount,
      id: s.id
    })),
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
        <h1 className="text-3xl font-black text-gray-900 tracking-tight">Customer Ledger</h1>
        <p className="text-xl font-bold mt-1 text-gray-700">{customer.name}</p>
        <div className="flex gap-4 text-xs font-bold text-gray-400 mt-2 uppercase tracking-wider">
          {customer.phone && <span>Phone: {formatPhone(customer.phone)}</span>}
          {customer.address && <span>Address: {customer.address}</span>}
        </div>
      </div>

      <div className="flex items-center justify-between no-print">
        <Link to="/customers" className="flex items-center gap-1 text-sm font-bold text-blue-600 hover:text-blue-700 transition-colors">
          <ArrowLeft className="w-4 h-4" /> Back to Customers
        </Link>
        <button
          onClick={handleDownloadPDF}
          className="flex items-center gap-2 px-4 py-2 bg-gray-900 text-white rounded-xl text-sm font-bold hover:bg-black transition-all shadow-md"
        >
          <Download className="w-4 h-4" /> Download PDF
        </button>
      </div>

      <div className="bg-white border border-gray-200 rounded-2xl p-6 shadow-sm">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-black text-gray-900 tracking-tight no-print">{customer.name}</h1>
            <div className="flex items-center gap-4 text-xs font-bold text-gray-400 mt-2 no-print uppercase tracking-wider">
              {customer.phone && <span className="flex items-center gap-1.5"><Phone className="w-3.5 h-3.5" />{formatPhone(customer.phone)}</span>}
              {customer.address && <span className="flex items-center gap-1.5"><MapPin className="w-3.5 h-3.5" />{customer.address}</span>}
            </div>
          </div>
          <div className="bg-gray-50 rounded-2xl p-4 border border-gray-100 min-w-[200px]">
            <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">Outstanding Balance</p>
            <p className={`text-2xl font-black tracking-tighter ${customer.balance > 0 ? 'text-orange-600' : 'text-green-600'}`}>
              {showPrices ? formatCurrency(customer.balance) : '***'}
            </p>
          </div>
        </div>
      </div>

      <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden shadow-sm">
        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
          <span className="font-black text-gray-900 text-sm uppercase tracking-widest">Transaction History</span>
          <Link to={`/ledger?customer_id=${customer.id}`} className="text-xs font-bold text-blue-600 hover:text-blue-700 hover:underline uppercase tracking-wider no-print">
            View in Ledger →
          </Link>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-gray-500 font-bold uppercase text-[10px] tracking-wider">
              <tr>
                <th className="text-left px-6 py-3">Date</th>
                <th className="text-left px-6 py-3">Description</th>
                <th className="text-right px-6 py-3">Amount</th>
                <th className="text-right px-6 py-3">Balance</th>
                <th className="text-center px-6 py-3 no-print">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {rows.map((r, i) => (
                <tr key={i} className="hover:bg-gray-50 transition-colors">
                  <td className="px-6 py-4 text-gray-500 whitespace-nowrap">{formatDate(r.date)}</td>
                  <td className="px-6 py-4 font-medium text-gray-800">{r.desc}</td>
                  <td className={`px-6 py-4 text-right font-bold ${r.amount > 0 ? 'text-orange-600' : 'text-green-600'}`}>
                    {showPrices ? (r.amount > 0 ? formatCurrency(r.amount) : `-${formatCurrency(-r.amount)}`) : '***'}
                  </td>
                  <td className="px-6 py-4 text-right font-black tracking-tight text-gray-700">
                    {showPrices ? formatCurrency(Math.abs(r.running)) : '***'}
                    <span className="text-[10px] ml-1 uppercase">{r.running > 0 ? 'Dr' : 'Cr'}</span>
                  </td>
                  <td className="px-6 py-4 text-center no-print">
                    {r.type === 'sale' && (
                      <button onClick={() => confirmDeleteSale(r.id)} className="p-1.5 text-red-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr><td colSpan={5} className="text-center py-12 text-gray-400 italic">No transactions yet</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <ConfirmDialog
        isOpen={confirmOpen}
        title="Delete Sale?"
        message="This will reverse the sale, return items to stock, and update the customer balance. Are you sure?"
        onConfirm={handleDeleteSale}
        onCancel={() => setConfirmOpen(false)}
        confirmText="Delete Sale"
      />
    </div>
  )
}
