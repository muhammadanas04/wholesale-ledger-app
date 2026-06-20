import { useState, useEffect } from 'react'
import { useParams, Link, useNavigate } from 'react-router-dom'
import { ipc } from '../lib/ipc'
import { ArrowLeft, Phone, MapPin, Trash2, Download, FileText, Printer, Pencil } from 'lucide-react'
import { formatCurrency, formatDate, formatPhone, applyRounding } from '../lib/formatters'
import Skeleton from '../components/Skeleton'
import ConfirmDialog from '../components/ConfirmDialog'
import { toast } from 'sonner'

function BillInvoice({ 
  sale, 
  customer, 
  roundingConfig, 
  shopName, 
  shopAddress, 
  shopPhone,
  gstEnabled,
  gstNumber,
  gstPercentage,
  gstType,
  showRateField = true
}) {
  const items = sale.items || []
  const payments = sale.payments || []

  // Format date and time
  const saleDate = new Date(sale.created_at || sale.date)
  const formattedDate = !isNaN(saleDate) ? formatDate(saleDate) : sale.date
  const formattedTime = !isNaN(saleDate) ? saleDate.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }) : ''

  // GST & Rounding Calculations
  let subtotal = sale.total_amount
  let gstAmount = 0
  let gstIncluded = 0
  let taxableSubtotal = 0
  let preRoundingTotal = sale.total_amount
  let discountInt = 0
  const manualDiscount = sale.discount || 0
  let finalInt = sale.total_amount - manualDiscount

  if (gstEnabled) {
    if (gstType === 'exclusive') {
      subtotal = sale.total_amount
      gstAmount = Math.round(subtotal * (gstPercentage / 100))
      preRoundingTotal = subtotal + gstAmount
      const rounded = applyRounding(preRoundingTotal, roundingConfig)
      discountInt = rounded.discountInt
      finalInt = rounded.finalInt - manualDiscount
    } else {
      // Inclusive GST
      preRoundingTotal = sale.total_amount
      const rounded = applyRounding(preRoundingTotal, roundingConfig)
      discountInt = rounded.discountInt
      finalInt = rounded.finalInt - manualDiscount
      
      taxableSubtotal = Math.round((preRoundingTotal - manualDiscount) / (1 + gstPercentage / 100))
      gstIncluded = (preRoundingTotal - manualDiscount) - taxableSubtotal
    }
  } else {
    preRoundingTotal = sale.total_amount
    const rounded = applyRounding(preRoundingTotal, roundingConfig)
    discountInt = rounded.discountInt
    finalInt = rounded.finalInt - manualDiscount
  }

  const totalPayments = payments.reduce((sum, p) => sum + p.amount - (p.discount || 0), 0)
  const grandTotalDue = finalInt - totalPayments

  return (
    <div className="mt-8 bg-white border border-gray-300 rounded-2xl p-8 text-gray-800 font-sans max-w-2xl mx-auto print:border-0 print:p-0">
      {/* Header Section */}
      <div className="flex justify-between items-start border-b border-gray-300 pb-6 mb-6">
        <div>
          <h1 className="text-2xl font-black text-slate-900 tracking-tight uppercase">
            {shopName || 'SHOP NAME'}
          </h1>
          {shopAddress && (
            <p className="text-xs font-semibold text-gray-500 mt-1 whitespace-pre-line max-w-xs leading-relaxed">
              {shopAddress}
            </p>
          )}
          {shopPhone && (
            <p className="text-xs font-semibold text-gray-500 mt-1">
              Ph: {shopPhone}
            </p>
          )}
          {gstEnabled && gstNumber && (
            <p className="text-xs font-black text-slate-700 mt-1 uppercase tracking-wider">
              GSTIN: {gstNumber}
            </p>
          )}
        </div>
        <div className="text-right">
          <h2 className="text-xl font-black text-slate-400 tracking-wider uppercase">INVOICE</h2>
          <div className="text-xs font-bold text-gray-600 mt-2">
            Bill No: <span className="font-extrabold text-slate-900">{sale.id}</span>
          </div>
          <p className="text-xs text-gray-500 mt-1">
            Date: {formattedDate}
          </p>
          {formattedTime && (
            <p className="text-xs text-gray-500">
              Time: {formattedTime}
            </p>
          )}
        </div>
      </div>

      {/* Billed To Section */}
      <div className="mb-8 bg-slate-50/50 border border-slate-100 rounded-xl p-5">
        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5">
          BILLED TO:
        </p>
        <h3 className="text-lg font-black text-slate-900">
          {customer.name}
        </h3>
        {customer.phone && (
          <p className="text-xs text-gray-600 mt-1">
            Ph: <span className="font-semibold">{formatPhone(customer.phone)}</span>
          </p>
        )}
        {customer.address && (
          <p className="text-xs text-gray-600 mt-1 font-semibold">
            {customer.address}
          </p>
        )}
      </div>

      {/* Items Table */}
      {items.length > 0 && (
        <div className="mb-8 border border-gray-200 rounded-xl overflow-hidden shadow-sm">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-white text-black font-bold text-[10px] uppercase tracking-wider">
                <th className="text-center px-4 py-3.5 w-12">#</th>
                <th className="text-left px-4 py-3.5">Item</th>
                <th className="text-right px-4 py-3.5 w-24">Quantity</th>
                {showRateField && <th className="text-right px-4 py-3.5 w-24">Rate</th>}
                <th className="text-right px-4 py-3.5 w-24">Weight</th>
                <th className="text-right px-4 py-3.5 w-28">Amount</th>
                <th className="text-right px-4 py-3.5 w-24">Discount</th>
                <th className="text-right px-4 py-3.5 w-28">Final Value</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 bg-white">
              {items.map((item, idx) => {
                const amount = item.total_price !== null && item.total_price !== undefined ? item.total_price : (item.weight > 0 ? item.weight * item.unit_price : item.qty * item.unit_price)
                const isSingleItem = items.length === 1
                const rowDiscount = isSingleItem
                  ? (discountInt !== 0 ? discountInt : (manualDiscount > 0 ? -manualDiscount : 0))
                  : 0
                const rowFinalValue = isSingleItem
                  ? (discountInt !== 0 ? finalInt : amount - manualDiscount)
                  : amount

                return (
                  <tr key={idx} className="hover:bg-slate-50/50 transition-colors">
                    <td className="text-center px-4 py-3.5 text-gray-400 font-medium">{idx + 1}</td>
                    <td className="px-4 py-3.5 font-bold text-slate-900">{item.product_name}</td>
                    <td className="text-right px-4 py-3.5 font-semibold text-slate-700 whitespace-nowrap">
                      {item.qty} {item.unit}
                    </td>
                    {showRateField && (
                      <td className="text-right px-4 py-3.5 font-semibold text-slate-700 whitespace-nowrap">
                        {item.weight > 0 ? formatCurrency(item.total_price / item.weight) : '-'}
                      </td>
                    )}
                    <td className="text-right px-4 py-3.5 font-medium text-slate-500">
                      {item.weight > 0 ? `${item.weight} kg` : '-'}
                    </td>
                    <td className="text-right px-4 py-3.5 font-bold text-slate-800">
                      {formatCurrency(amount)}
                    </td>
                    <td className="text-right px-4 py-3.5 text-gray-400 font-medium">
                      {isSingleItem && rowDiscount !== 0 ? (
                        <span className={rowDiscount > 0 ? 'text-emerald-600 font-bold' : 'text-rose-605 font-bold text-red-500'}>
                          {rowDiscount > 0 ? '+' : ''}{formatCurrency(rowDiscount)}
                        </span>
                      ) : '-'}
                    </td>
                    <td className="text-right px-4 py-3.5 font-black text-slate-950">
                      {formatCurrency(rowFinalValue)}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Selected Payments Table */}
      {payments.length > 0 && (
        <div className="mb-8">
          <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5 ml-1">
            PAYMENTS APPLIED:
          </p>
          <div className="border border-gray-200 rounded-xl overflow-hidden shadow-sm">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-50 text-slate-500 font-bold text-[10px] uppercase tracking-wider">
                  <th className="text-center px-4 py-2.5 w-12">#</th>
                  <th className="text-left px-4 py-2.5 w-28">Date</th>
                  <th className="text-left px-4 py-2.5">Notes</th>
                  <th className="text-right px-4 py-2.5 w-36">Total Amount</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 bg-white">
                {payments.map((p, idx) => (
                  <tr key={idx} className="hover:bg-slate-50/50 transition-colors">
                    <td className="text-center px-4 py-2.5 text-gray-400 font-medium">{idx + 1}</td>
                    <td className="px-4 py-2.5 text-slate-700 font-semibold">{formatDate(p.date)}</td>
                    <td className="px-4 py-2.5 text-xs text-gray-400 italic font-medium">{p.notes || `Payment #${p.id}`}</td>
                    <td className="text-right px-4 py-2.5 font-bold text-green-700">
                      {formatCurrency(p.amount - (p.discount || 0))}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Footer / Grand Total Section */}
      <div className="border-t-2 border-slate-900 pt-6 flex flex-col md:flex-row md:justify-between items-end gap-6">
        <div className="space-y-1">
          <p className="text-xs text-gray-500 font-bold uppercase">
            Payment Method: <span className="text-slate-900 font-black">CASH</span>
          </p>
          {items.length > 0 && (
            <p className="text-xs text-gray-500 font-bold uppercase">
              Total Items: <span className="text-slate-900 font-black">{items.length}</span>
            </p>
          )}
        </div>
        <div className="w-full md:w-72 space-y-2 text-right">
          {items.length > 0 ? (
            gstEnabled ? (
              gstType === 'exclusive' ? (
                <>
                  <div className="flex justify-between text-xs font-bold text-gray-500 uppercase">
                    <span>Subtotal:</span>
                    <span className="text-slate-800">
                      {formatCurrency(subtotal)}
                    </span>
                  </div>
                  <div className="flex justify-between text-xs font-bold text-gray-500 uppercase">
                    <span>GST ({gstPercentage}%):</span>
                    <span className="text-slate-800 font-extrabold">
                      {formatCurrency(gstAmount)}
                    </span>
                  </div>
                </>
              ) : (
                <>
                  <div className="flex justify-between text-xs font-bold text-gray-500 uppercase">
                    <span>Taxable Value:</span>
                    <span className="text-slate-800">
                      {formatCurrency(taxableSubtotal)}
                    </span>
                  </div>
                  <div className="flex justify-between text-xs font-bold text-gray-500 uppercase">
                    <span>GST Included ({gstPercentage}%):</span>
                    <span className="text-slate-800 font-semibold">
                      {formatCurrency(gstIncluded)}
                    </span>
                  </div>
                  <div className="flex justify-between text-xs font-bold text-gray-500 uppercase">
                    <span>Subtotal:</span>
                    <span className="text-slate-855 text-slate-800">
                      {formatCurrency(preRoundingTotal)}
                    </span>
                  </div>
                </>
              )
            ) : (
              <div className="flex justify-between text-xs font-bold text-gray-500 uppercase">
                <span>Subtotal:</span>
                <span className="text-slate-800">
                  {formatCurrency(sale.total_amount)}
                </span>
              </div>
            )
          ) : (
            <div className="flex justify-between text-xs font-bold text-gray-500 uppercase">
              <span>Total Sales:</span>
              <span className="text-slate-800">
                {formatCurrency(0)}
              </span>
            </div>
          )}
          
          {items.length > 0 && roundingConfig && roundingConfig.enabled && discountInt !== 0 && (
            <div className="flex justify-between text-xs font-bold text-gray-500 uppercase">
              <span>Rounding Discount:</span>
              <span className={discountInt > 0 ? 'text-emerald-600 font-extrabold' : 'text-rose-600 font-extrabold'}>
                {discountInt > 0 ? '+' : ''}{formatCurrency(discountInt)}
              </span>
            </div>
          )}
          {items.length > 0 && manualDiscount > 0 && (
            <div className="flex justify-between text-xs font-bold text-gray-500 uppercase">
              <span>Discount:</span>
              <span className="text-emerald-600 font-extrabold">
                -{formatCurrency(manualDiscount)}
              </span>
            </div>
          )}
          <div className="flex justify-between items-baseline pt-2 border-t border-gray-200">
            <span className="text-sm font-black text-slate-500 uppercase tracking-wider">TOTAL SALES</span>
            <span className="text-3xl font-black text-slate-950 tracking-tighter">
              {formatCurrency(finalInt)}
            </span>
          </div>

          {totalPayments > 0 && (
            <>
              <div className="flex justify-between text-xs font-bold text-gray-500 uppercase pt-2">
                <span>Less: Total Payments:</span>
                <span className="text-green-600 font-extrabold">
                  -{formatCurrency(totalPayments)}
                </span>
              </div>
              <div className="flex justify-between items-baseline pt-2 border-t-2 border-slate-900 mt-2">
                <span className="text-sm font-black text-slate-700 uppercase tracking-wider">BALANCE DUE</span>
                <span className="text-3xl font-black text-slate-950 tracking-tighter">
                  {formatCurrency(grandTotalDue)}
                </span>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

export default function CustomerDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [customer, setCustomer] = useState(null)
  const [sales, setSales] = useState([])
  const [payments, setPayments] = useState([])
  const [loading, setLoading] = useState(true)

  // Meta details for headers and rules
  const [roundingConfig, setRoundingConfig] = useState(null)
  const [shopName, setShopName] = useState('')
  const [shopAddress, setShopAddress] = useState('')
  const [shopPhone, setShopPhone] = useState('')

  // GST Config States
  const [gstEnabled, setGstEnabled] = useState(false)
  const [gstNumber, setGstNumber] = useState('')
  const [gstPercentage, setGstPercentage] = useState(18)
  const [gstType, setGstType] = useState('exclusive')

  // Confirm dialog and view bill states
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [deleteCustomerConfirmOpen, setDeleteCustomerConfirmOpen] = useState(false)
  const [deleteSaleId, setDeleteSaleId] = useState(null)
  const [activeBill, setActiveBill] = useState(null)
  const [selectedSaleIds, setSelectedSaleIds] = useState([])
  const [selectedPaymentIds, setSelectedPaymentIds] = useState([])
  const [showRateField, setShowRateField] = useState(true)


  const [singleProductMode, setSingleProductMode] = useState(false)
  const [productUnit, setProductUnit] = useState('')

  useEffect(() => {
    async function loadMeta() {
      const name = await ipc('meta:get', 'shop_name')
      if (name) setShopName(name)

      const addr = await ipc('meta:get', 'shop_address')
      if (addr) setShopAddress(addr)

      const phone = await ipc('meta:get', 'shop_phone')
      if (phone) setShopPhone(phone)

      const rulesVal = await ipc('meta:get', 'rounding_rules')
      if (rulesVal) {
        try {
          setRoundingConfig(JSON.parse(rulesVal))
        } catch (e) {
          console.error('Failed to parse rounding rules:', e)
        }
      }

      const gstEn = await ipc('meta:get', 'gst_enabled')
      setGstEnabled(gstEn === 'true')

      const gstNum = await ipc('meta:get', 'gst_number')
      if (gstNum) setGstNumber(gstNum)

      const gstPct = await ipc('meta:get', 'gst_percentage')
      if (gstPct) setGstPercentage(parseFloat(gstPct) || 18)

      const gstTy = await ipc('meta:get', 'gst_type')
      if (gstTy) setGstType(gstTy)

      const rateFieldVal = await ipc('meta:get', 'show_rate_field')
      setShowRateField(rateFieldVal !== 'false')

      const singleProductVal = await ipc('meta:get', 'single_product_mode')
      const isSingle = singleProductVal === 'true'
      setSingleProductMode(isSingle)

      if (isSingle) {
        try {
          const prods = await ipc('products:list', { limit: 1 })
          if (prods && prods.length > 0) {
            setProductUnit(prods[0].unit)
          }
        } catch (e) {
          console.error('Failed to load single product unit:', e)
        }
      }
    }
    loadMeta()
  }, [])

  async function load() {
    setLoading(true)
    const [c, allSales, p] = await Promise.all([
      ipc('customers:get', Number(id)),
      ipc('sales:list', { limit: 100000 }), // Filter locally for simple ledger
      ipc('payments:by-customer', Number(id))
    ])

    setCustomer(c)
    setSales((allSales || []).filter((s) => s.customer_id === Number(id)))
    setPayments(p || [])
    setLoading(false)
  }

  useEffect(() => {
    setSelectedSaleIds([])
    setSelectedPaymentIds([])
    load()
  }, [id])

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

  async function handleDeleteCustomer() {
    await ipc('customers:delete', customer.id)
    setDeleteCustomerConfirmOpen(false)
    toast.success('Customer deleted')
    navigate('/customers')
  }

  async function handleDownloadPDF() {
    await ipc('app:print-to-pdf', `Ledger_${customer.name.replace(/\s+/g, '_')}`)
  }

  async function handlePrintBill() {
    if (!activeBill) return
    const filename = `Bill_${customer.name.replace(/\s+/g, '_')}_#${activeBill.id}`
    await ipc('app:print-to-pdf', filename)
  }

  if (loading) return (
    <div className="p-6 space-y-6">
      <Skeleton className="h-32 w-full" />
      <Skeleton className="h-64 w-full" />
    </div>
  )

  if (!customer) return <div className="p-6 text-gray-400">Customer not found</div>

  const transactions = [
    ...sales.map((s) => {
      let roundingDiscount = 0
      let finalRounded = s.total_amount
      if (roundingConfig && roundingConfig.enabled) {
        const rounded = applyRounding(s.total_amount, roundingConfig)
        roundingDiscount = rounded.discountInt
        finalRounded = rounded.finalInt
      }

      const manualDiscount = s.discount || 0
      const isManual = !roundingConfig || !roundingConfig.enabled

      const originalVal = s.total_amount
      const discountVal = isManual ? manualDiscount : -roundingDiscount
      const finalVal = isManual ? (originalVal - manualDiscount) : finalRounded
      const balanceAmount = isManual ? (originalVal - manualDiscount) : originalVal

      return {
        type: 'sale',
        date: s.date,
        desc: singleProductMode
          ? `Sale #${s.id} (${s.qty} ${productUnit || 'units'}${s.weight > 0 ? `, ${s.weight} kg` : ''})`
          : (s.weight > 0 ? `Sale #${s.id} (${s.weight} kg)` : `Sale #${s.id}`),
        original_amount: originalVal,
        discount: discountVal,
        final_amount: finalVal,
        amount: balanceAmount,
        id: s.id,
        rate: s.weight > 0 ? (s.total_amount / s.weight) : 0
      }
    }),
    ...payments.map((p) => ({
      type: 'payment',
      date: p.date,
      desc: p.notes || 'Payment',
      original_amount: p.amount,
      discount: p.discount || 0,
      final_amount: p.amount - (p.discount || 0),
      amount: -(p.amount - (p.discount || 0)),
      id: p.id
    })),
  ].sort((a, b) => {
    const dateComp = b.date.localeCompare(a.date)
    if (dateComp !== 0) return dateComp
    return b.id - a.id
  })

  let running = customer.balance
  const rows = transactions.map((t) => {
    const current = running
    running -= t.amount
    return { ...t, running: current }
  })

  return (
    <div className="relative">
      {/* Normal screen page content */}
      <div className={`p-6 space-y-6 ${activeBill ? 'no-print' : ''}`}>
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
          <div className="flex items-center gap-3">
            <button
              onClick={() => setDeleteCustomerConfirmOpen(true)}
              className="flex items-center gap-2 px-4 py-2 bg-red-50 text-red-600 rounded-xl text-sm font-bold hover:bg-red-100 transition-all shadow-sm"
            >
              <Trash2 className="w-4 h-4" /> Delete Customer
            </button>
            <button
              onClick={handleDownloadPDF}
              className="flex items-center gap-2 px-4 py-2 bg-gray-900 text-white rounded-xl text-sm font-bold hover:bg-black transition-all shadow-md"
            >
              <Download className="w-4 h-4" /> Download PDF
            </button>
          </div>
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
                {formatCurrency(customer.balance)}
              </p>
            </div>
          </div>
        </div>

        <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden shadow-sm">
          <div className="px-6 py-4 border-b border-gray-100 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <span className="font-black text-gray-900 text-sm uppercase tracking-widest">Transaction History</span>
              {(selectedSaleIds.length > 0 || selectedPaymentIds.length > 0) && (
                <button
                  onClick={async () => {
                    try {
                      const saleObjects = await Promise.all(
                        selectedSaleIds.map(id => ipc('sales:get', id))
                      )

                      const validSales = saleObjects.filter(Boolean)
                      const selectedPayments = payments.filter(p => selectedPaymentIds.includes(p.id))

                      const combinedSale = {
                        id: validSales.length > 0 
                          ? `Combined (${validSales.map(s => `#${s.id}`).join(', ')})`
                          : `Statement`,
                        total_amount: validSales.reduce((sum, s) => sum + s.total_amount, 0),
                        discount: validSales.reduce((sum, s) => sum + s.discount, 0),
                        date: validSales.length > 0 ? validSales[0].date : new Date().toISOString().slice(0, 10),
                        created_at: new Date().toISOString(),
                        items: validSales.flatMap(s => s.items || []),
                        payments: selectedPayments
                      }

                      setActiveBill(combinedSale)
                    } catch (e) {
                      toast.error('Failed to combine invoices')
                      console.error(e)
                    }
                  }}
                  className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-black uppercase tracking-wider transition-all shadow-sm flex items-center gap-1.5 no-print"
                >
                  <Printer className="w-3.5 h-3.5" /> Print Selected ({selectedSaleIds.length + selectedPaymentIds.length})
                </button>
              )}
            </div>
            <Link to={`/ledger?customer_id=${customer.id}`} className="text-xs font-bold text-blue-600 hover:text-blue-700 hover:underline uppercase tracking-wider no-print">
              View in Ledger →
            </Link>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-gray-500 font-bold uppercase text-[10px] tracking-wider">
                <tr>
                  <th className="w-12 px-6 py-3 text-center no-print">
                    <input
                      type="checkbox"
                      checked={
                        (sales.length === 0 || selectedSaleIds.length === sales.length) &&
                        (payments.length === 0 || selectedPaymentIds.length === payments.length) &&
                        (sales.length > 0 || payments.length > 0)
                      }
                      onChange={(e) => {
                        if (e.target.checked) {
                          setSelectedSaleIds(sales.map(s => s.id))
                          setSelectedPaymentIds(payments.map(p => p.id))
                        } else {
                          setSelectedSaleIds([])
                          setSelectedPaymentIds([])
                        }
                      }}
                      className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded cursor-pointer"
                    />
                  </th>
                  <th className="text-left px-6 py-3">Date</th>
                  <th className="text-left px-6 py-3">Description</th>
                  {showRateField && <th className="text-right px-6 py-3 w-32">Rate</th>}
                  <th className="text-right px-6 py-3">Original Value</th>
                  <th className="text-right px-6 py-3">Discount</th>
                  <th className="text-right px-6 py-3">Final Value</th>
                  <th className="text-center px-6 py-3 no-print">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {rows.map((r, i) => (
                  <tr key={i} className="hover:bg-gray-50 transition-colors">
                    <td className="w-12 px-6 py-4 text-center no-print">
                      {r.type === 'sale' ? (
                        <input
                           type="checkbox"
                          checked={selectedSaleIds.includes(r.id)}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setSelectedSaleIds([...selectedSaleIds, r.id])
                            } else {
                              setSelectedSaleIds(selectedSaleIds.filter(id => id !== r.id))
                            }
                          }}
                          className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded cursor-pointer"
                        />
                      ) : (
                        <input
                           type="checkbox"
                          checked={selectedPaymentIds.includes(r.id)}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setSelectedPaymentIds([...selectedPaymentIds, r.id])
                            } else {
                              setSelectedPaymentIds(selectedPaymentIds.filter(id => id !== r.id))
                            }
                          }}
                          className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded cursor-pointer"
                        />
                      )}
                    </td>
                    <td className="px-6 py-4 text-gray-500 whitespace-nowrap">{formatDate(r.date)}</td>
                    <td className="px-6 py-4 font-medium text-gray-800">{r.desc}</td>
                    {showRateField && (
                      <td className="px-6 py-4 text-right font-semibold text-gray-700 whitespace-nowrap">
                        {r.type === 'sale' && r.rate ? formatCurrency(r.rate) : '-'}
                      </td>
                    )}
                    <td className="px-6 py-4 text-right font-semibold text-gray-700 whitespace-nowrap">
                      {r.type === 'sale' ? formatCurrency(r.original_amount) : '-'}
                    </td>
                    <td className="px-6 py-4 text-right whitespace-nowrap font-bold">
                      {r.type === 'sale' ? (
                        r.discount > 0 ? (
                          <span className="text-emerald-600">-{formatCurrency(r.discount)}</span>
                        ) : r.discount < 0 ? (
                          <span className="text-red-500">+{formatCurrency(-r.discount)}</span>
                        ) : (
                          <span className="text-gray-400 font-medium">-</span>
                        )
                      ) : (
                        r.discount > 0 ? (
                          <span className="text-red-500">-{formatCurrency(r.discount)}</span>
                        ) : (
                          <span className="text-gray-400 font-medium">-</span>
                        )
                      )}
                    </td>
                    <td className={`px-6 py-4 text-right font-black whitespace-nowrap ${r.type === 'sale' ? 'text-slate-900' : 'text-green-600'}`}>
                      {r.type === 'sale' ? formatCurrency(r.final_amount) : `-${formatCurrency(r.final_amount)}`}
                    </td>
                    <td className="px-6 py-4 text-center no-print flex items-center justify-center gap-2">
                      {r.type === 'sale' && (
                        <>
                          <button
                            onClick={async () => {
                              const res = await ipc('sales:get', r.id)
                              if (res) {
                                setActiveBill(res)
                              } else {
                                toast.error('Failed to load bill details')
                              }
                            }}
                            className="p-1.5 text-blue-500 hover:text-blue-700 hover:bg-blue-50 rounded-lg transition-all"
                            title="Generate Bill"
                          >
                            <FileText className="w-4 h-4" />
                          </button>
                          <Link
                            to={`/sales/edit/${r.id}`}
                            className="p-1.5 text-amber-500 hover:text-amber-700 hover:bg-amber-50 rounded-lg transition-all"
                            title="Edit Sale"
                          >
                            <Pencil className="w-4 h-4" />
                          </Link>
                          <button
                            onClick={() => confirmDeleteSale(r.id)}
                            className="p-1.5 text-red-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-all"
                            title="Delete Sale"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </>
                      )}
                    </td>
                  </tr>
                ))}
                {rows.length === 0 && (
                  <tr><td colSpan={showRateField ? 8 : 7} className="text-center py-12 text-gray-400 italic">No transactions yet</td></tr>
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

        <ConfirmDialog
          isOpen={deleteCustomerConfirmOpen}
          title="Delete Customer?"
          message="This will permanently delete this customer and ALL of their sales, payments, and ledger records. Stock will be returned for any associated sales. This action cannot be undone. Are you sure?"
          onConfirm={handleDeleteCustomer}
          onCancel={() => setDeleteCustomerConfirmOpen(false)}
          confirmText="Delete Customer"
        />
      </div>

      {/* Printable Bill Section */}
      {activeBill && (
        <div className="print-only">
          <BillInvoice
            sale={activeBill}
            customer={customer}
            roundingConfig={roundingConfig}
            shopName={shopName}
            shopAddress={shopAddress}
            shopPhone={shopPhone}
            gstEnabled={gstEnabled}
            gstNumber={gstNumber}
            gstPercentage={gstPercentage}
            gstType={gstType}
            showRateField={showRateField}
          />
        </div>
      )}

      {/* Modal Preview on Screen */}
      {activeBill && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4 no-print overflow-y-auto backdrop-blur-sm">
          <div className="bg-white rounded-3xl w-full max-w-2xl overflow-hidden shadow-2xl flex flex-col max-h-[90vh]">
            {/* Modal Header */}
            <div className="px-6 py-4 border-b border-gray-150 flex items-center justify-between bg-slate-50">
              <h3 className="font-extrabold text-slate-800 text-base uppercase tracking-wider flex items-center gap-2">
                <Printer className="w-4 h-4 text-blue-600" /> Invoice Preview
              </h3>
              <button
                onClick={() => setActiveBill(null)}
                className="text-gray-400 hover:text-slate-700 font-bold transition-all px-2.5 py-1 rounded-lg hover:bg-gray-250/50"
              >
                ✕ Close
              </button>
            </div>
            {/* Scrollable Bill Content */}
            <div className="p-8 overflow-y-auto flex-1 bg-slate-100/50">
              <BillInvoice
                sale={activeBill}
                customer={customer}
                roundingConfig={roundingConfig}
                shopName={shopName}
                shopAddress={shopAddress}
                shopPhone={shopPhone}
                gstEnabled={gstEnabled}
                gstNumber={gstNumber}
                gstPercentage={gstPercentage}
                gstType={gstType}
                showRateField={showRateField}
              />
            </div>
            {/* Modal Actions */}
            <div className="px-6 py-4 border-t border-gray-150 flex justify-end gap-3 bg-white">
              <button
                onClick={() => setActiveBill(null)}
                className="px-4 py-2 border border-gray-250 text-gray-600 rounded-xl text-sm font-semibold hover:bg-slate-50 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handlePrintBill}
                className="px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-sm font-bold transition-all shadow-md flex items-center gap-1.5"
              >
                <Printer className="w-4 h-4" /> Print / Save PDF
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
