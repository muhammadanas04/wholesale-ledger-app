import { useState, useEffect } from 'react'
import { X, CheckCircle } from 'lucide-react'
import CustomerSelect from './CustomerSelect'
import DatePicker from './DatePicker'
import { ipc } from '../lib/ipc'
import { toast } from 'sonner'

export default function AcceptTmpRecordModal({ record, onClose, onAccepted }) {
  const [customers, setCustomers] = useState([])
  const [products, setProducts] = useState([])
  const [saving, setSaving] = useState(false)

  // Form states
  const [customerId, setCustomerId] = useState('')
  const [date, setDate] = useState('')
  
  // Sale specific
  const [productId, setProductId] = useState('')
  const [qty, setQty] = useState('')
  const [weight, setWeight] = useState('')
  const [rate, setRate] = useState('')
  const [totalValue, setTotalValue] = useState('')
  const [discount, setDiscount] = useState('')

  // Payment specific
  const [amount, setAmount] = useState('')
  
  // Shared
  const [notes, setNotes] = useState('')

  useEffect(() => {
    async function init() {
      const custs = await ipc('customers:list', { limit: 100000 }) || []
      const prods = await ipc('products:list', { limit: 1000 }) || []
      setCustomers(custs)
      setProducts(prods)

      if (record) {
        let matchedCustomer = ''
        if (record.customer_id) {
          const match = custs.find(c => String(c.id) === String(record.customer_id))
          if (match) matchedCustomer = String(match.id)
        }
        setCustomerId(matchedCustomer)
        setDate(record.date ? record.date.slice(0, 10) : new Date().toISOString().slice(0, 10))
        setNotes(record.reason || '')
        setDiscount(record.discount ? String(record.discount / 100) : '')
        
        if (record.type === 'sale') {
           setQty(record.qty || '')
           setWeight(record.weight || '')
           setRate(record.rate ? String(record.rate / 100) : '')
           setTotalValue(record.total_value ? String(record.total_value / 100) : '')
           if (prods.length > 0) {
             setProductId(String(prods[0].id))
           }
        } else if (record.type === 'payment') {
           const paymentAmount = record.total_value || record.amount
           setAmount(paymentAmount ? String(paymentAmount / 100) : '')
        }
      }
    }
    init()
  }, [record])

  if (!record) return null

  const isSale = record.type === 'sale'
  const isPayment = record.type === 'payment'

  async function handleSubmit(e) {
    e.preventDefault()
    if (!customerId) return toast.error('Please select a customer')

    setSaving(true)
    try {
      if (isSale) {
        if (!productId) {
          setSaving(false)
          return toast.error('Please select a product')
        }
        const saleData = {
          customer_id: Number(customerId),
          date,
          notes: notes || null,
          total_amount: Math.round(Number(totalValue) * 100),
          discount: Math.round(Number(discount) * 100),
          items: [{
            product_id: Number(productId),
            qty: Number(qty) || 0,
            weight: Number(weight) || null,
            unit_price: Math.round(Number(rate) * 100),
            total_price: Math.round(Number(totalValue) * 100)
          }]
        }
        await ipc('sales:add', saleData)
      } else if (isPayment) {
        const paymentData = {
          customer_id: Number(customerId),
          date,
          notes: notes || null,
          amount: Math.round(Number(amount) * 100),
          discount: Math.round(Number(discount) * 100)
        }
        await ipc('payments:add', paymentData)
      }

      // Delete the tmp record since it's been accepted
      await ipc('tmp-records:delete', record.id)
      
      toast.success(`${isSale ? 'Sale' : 'Payment'} saved successfully`)
      onAccepted()
    } catch (err) {
      console.error(err)
      toast.error(`Failed to save ${isSale ? 'sale' : 'payment'}`)
    } finally {
      setSaving(false)
    }
  }

  // Recalculate logic for Sale (similar to NewSale.jsx)
  const handleRateOrWeightChange = (field, val) => {
    let w = Number(weight) || 0
    let r = Number(rate) || 0
    if (field === 'weight') w = Number(val) || 0
    if (field === 'rate') r = Number(val) || 0
    
    if (w > 0 && r > 0) {
      setTotalValue(String(Math.round((w * r) * 100) / 100))
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl overflow-hidden flex flex-col max-h-[90vh]">
        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between bg-gray-50/50">
          <h2 className="text-lg font-bold text-gray-800 flex items-center gap-2">
            <CheckCircle className="w-5 h-5 text-blue-600" />
            Accept as {isSale ? 'Sale' : 'Payment'}
          </h2>
          <button 
            type="button" 
            onClick={onClose}
            className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-full transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex-1 overflow-auto p-6 space-y-5">
          {/* Readonly Original Record Info */}
          <div className="bg-blue-50/50 border border-blue-100 p-4 rounded-xl text-sm space-y-1">
            <p className="font-semibold text-blue-900 mb-2">Original Temporary Record Details:</p>
            <p><span className="text-blue-700">Name/Reason:</span> {record.customer_name || record.reason}</p>
            {record.customer_phone && <p><span className="text-blue-700">Phone:</span> {record.customer_phone}</p>}
            {isSale && (
               <>
                 <p><span className="text-blue-700">Qty:</span> {record.qty} <span className="ml-4 text-blue-700">Weight:</span> {record.weight} kg</p>
                 <p><span className="text-blue-700">Rate:</span> ₹{(record.rate || 0) / 100}/kg <span className="ml-4 text-blue-700">Total:</span> ₹{(record.total_value || 0) / 100}</p>
               </>
            )}
            {isPayment && (
               <p><span className="text-blue-700">Amount:</span> ₹{((record.total_value || record.amount) || 0) / 100}</p>
            )}
            <p><span className="text-blue-700">Date:</span> {new Date(record.date).toLocaleDateString()}</p>
          </div>

          <div className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-gray-600 uppercase">Customer</label>
                <CustomerSelect
                  value={customerId}
                  onChange={setCustomerId}
                  customers={customers}
                  required={true}
                  className="px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-gray-600 uppercase">Date</label>
                <DatePicker
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  required
                  className="px-3 py-2 border border-gray-300 rounded-lg text-sm cursor-pointer w-full"
                />
              </div>
            </div>

            {isSale && (
              <div className="bg-gray-50 border border-gray-200 p-4 rounded-xl space-y-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-gray-600 uppercase">Product</label>
                  <select
                    value={productId}
                    onChange={(e) => setProductId(e.target.value)}
                    required
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white"
                  >
                    <option value="">Select Product</option>
                    {products.map(p => <option key={p.id} value={p.id}>{p.name} ({p.unit})</option>)}
                  </select>
                </div>
                
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-gray-600 uppercase">Qty</label>
                    <input
                      type="number" step="any" required
                      value={qty} onChange={e => setQty(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-gray-600 uppercase">Weight (kg)</label>
                    <input
                      type="number" step="any"
                      value={weight} 
                      onChange={e => {
                        setWeight(e.target.value); 
                        handleRateOrWeightChange('weight', e.target.value);
                      }}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-gray-600 uppercase">Rate (₹)</label>
                    <input
                      type="number" step="any" required
                      value={rate} 
                      onChange={e => {
                        setRate(e.target.value); 
                        handleRateOrWeightChange('rate', e.target.value);
                      }}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-gray-600 uppercase">Total (₹)</label>
                    <input
                      type="number" step="0.01" required
                      value={totalValue} onChange={e => setTotalValue(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm font-bold text-blue-700 bg-blue-50/30"
                    />
                  </div>
                </div>
              </div>
            )}

            {isPayment && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-gray-600 uppercase">Amount (₹)</label>
                  <input
                    type="number" step="0.01" required
                    value={amount} onChange={e => setAmount(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm font-bold text-blue-700"
                  />
                </div>
              </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-gray-600 uppercase">Discount (₹)</label>
                <input
                  type="number" step="0.01"
                  value={discount} onChange={e => setDiscount(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                  placeholder="0.00"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-gray-600 uppercase">Notes</label>
                <input
                  type="text"
                  value={notes} onChange={e => setNotes(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                  placeholder="Optional notes..."
                />
              </div>
            </div>
          </div>
        </form>
        
        <div className="px-6 py-4 border-t border-gray-100 bg-gray-50 flex items-center justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-sm font-bold text-gray-600 hover:text-gray-800 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={saving}
            className="px-6 py-2 bg-blue-600 text-white rounded-lg text-sm font-bold shadow-sm hover:bg-blue-700 transition-colors disabled:opacity-50 flex items-center gap-2"
          >
            {saving ? 'Saving...' : 'Confirm & Save'}
          </button>
        </div>
      </div>
    </div>
  )
}
