import { useState, useEffect, useRef } from 'react'
import { ipc } from '../lib/ipc'
import { toast } from 'sonner'
import CustomerSelect from './CustomerSelect'
import DatePicker from './DatePicker'
import { Plus, Trash2, X, Save, Merge, FileText, ChevronDown, CalendarDays, CalendarRange } from 'lucide-react'

function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 9)
}

const EMPTY_SALE_ROW = { customer_id: '', customer_name: '', qty: '', weight: '', total_price: '', discount: '', final_value: '', date: '' }
const EMPTY_PAYMENT_ROW = { customer_id: '', customer_name: '', amount: '', discount: '', date: '' }

export default function BulkEntryModal({ isOpen, onClose, mode = 'sale', customers = [], products = [], onMergeComplete }) {
  const [rows, setRows] = useState([createEmptyRow()])
  const [sameDate, setSameDate] = useState(true)
  const [globalDate, setGlobalDate] = useState(() => new Date().toISOString().slice(0, 10))
  const [saving, setSaving] = useState(false)
  const [merging, setMerging] = useState(false)
  const [drafts, setDrafts] = useState([])
  const [showDrafts, setShowDrafts] = useState(false)
  const [currentDraftId, setCurrentDraftId] = useState(null)
  const [currentDraftName, setCurrentDraftName] = useState('')
  const modalRef = useRef(null)

  // Single product mode
  const [singleProductMode, setSingleProductMode] = useState(false)
  useEffect(() => {
    async function checkMode() {
      const val = await ipc('meta:get', 'single_product_mode')
      setSingleProductMode(val === 'true')
    }
    checkMode()
  }, [])

  function createEmptyRow() {
    return mode === 'sale' ? { ...EMPTY_SALE_ROW } : { ...EMPTY_PAYMENT_ROW }
  }

  // Load drafts
  useEffect(() => {
    if (isOpen) {
      loadDrafts()
    }
  }, [isOpen, mode])

  async function loadDrafts() {
    const list = await ipc('bulk-drafts:list', mode) || []
    setDrafts(list)
  }

  function addRow() {
    setRows([...rows, createEmptyRow()])
  }

  function removeRow(i) {
    if (rows.length <= 1) return
    setRows(rows.filter((_, idx) => idx !== i))
  }

  function updateRow(i, field, value) {
    const next = [...rows]
    const row = { ...next[i], [field]: value }

    // Auto-calc final_value for sale mode
    if (mode === 'sale') {
      if (field === 'total_price' || field === 'discount') {
        const tp = parseFloat(field === 'total_price' ? value : row.total_price) || 0
        const disc = parseFloat(field === 'discount' ? value : row.discount) || 0
        row.final_value = tp > 0 ? Math.max(0, tp - disc).toFixed(2) : ''
      }
      if (field === 'final_value') {
        const tp = parseFloat(row.total_price) || 0
        const fv = parseFloat(value) || 0
        if (tp > 0) {
          row.discount = Math.max(0, tp - fv).toFixed(2)
        }
      }
    }

    next[i] = row
    setRows(next)
  }

  function handleCustomerChange(i, customerId) {
    const cust = customers.find(c => String(c.id) === String(customerId))
    updateRow(i, 'customer_id', customerId)
    if (cust) {
      const next = [...rows]
      next[i] = { ...next[i], customer_id: customerId, customer_name: cust.name }
      setRows(next)
    }
  }

  // Save draft
  async function handleSaveDraft() {
    setSaving(true)
    try {
      const draftData = {
        id: currentDraftId || generateId(),
        type: mode,
        name: currentDraftName || `${mode === 'sale' ? 'Sales' : 'Payments'} Draft`,
        data: JSON.stringify({
          sameDate,
          globalDate,
          rows: rows.map(r => {
            const cust = customers.find(c => String(c.id) === String(r.customer_id))
            return { ...r, customer_name: cust ? cust.name : r.customer_name || '' }
          })
        })
      }
      await ipc('bulk-drafts:save', draftData)
      setCurrentDraftId(draftData.id)
      toast.success('Draft saved')
      loadDrafts()
    } catch (e) {
      toast.error('Failed to save draft')
    } finally {
      setSaving(false)
    }
  }

  // Load a draft
  async function handleLoadDraft(draft) {
    try {
      const parsed = JSON.parse(draft.data)
      setSameDate(parsed.sameDate !== false)
      setGlobalDate(parsed.globalDate || new Date().toISOString().slice(0, 10))
      setRows(parsed.rows && parsed.rows.length > 0 ? parsed.rows : [createEmptyRow()])
      setCurrentDraftId(draft.id)
      setCurrentDraftName(draft.name || '')
      setShowDrafts(false)
      toast.success('Draft loaded')
    } catch (e) {
      toast.error('Failed to parse draft data')
    }
  }

  // Delete a draft
  async function handleDeleteDraft(e, draftId) {
    e.stopPropagation()
    await ipc('bulk-drafts:delete', draftId)
    if (currentDraftId === draftId) {
      setCurrentDraftId(null)
      setCurrentDraftName('')
    }
    loadDrafts()
    toast.success('Draft deleted')
  }

  // Merge all valid rows
  async function handleMerge() {
    setMerging(true)
    let merged = 0
    let skipped = 0
    const incompleteIndices = []

    try {
      for (let i = 0; i < rows.length; i++) {
        const row = rows[i]
        const rowDate = sameDate ? globalDate : row.date

        if (mode === 'sale') {
          const customerId = Number(row.customer_id)
          const totalPrice = Number(row.total_price) || 0
          const qty = Number(row.qty) || 0
          const weight = row.weight ? Number(row.weight) : null
          const discountVal = Number(row.discount) || 0

          // Required: customer + total_price
          if (!customerId || totalPrice <= 0 || !rowDate) {
            skipped++
            incompleteIndices.push(i + 1)
            continue
          }

          const productId = products.length > 0 ? products[0].id : 1
          const unitPrice = weight > 0 ? Math.round((totalPrice / weight) * 100) : (qty > 0 ? Math.round((totalPrice / qty) * 100) : 0)

          const saleData = {
            customer_id: customerId,
            date: rowDate,
            notes: null,
            total_amount: Math.round(totalPrice * 100),
            discount: Math.round(discountVal * 100),
            items: [{
              product_id: productId,
              qty: qty || 1,
              unit_price: unitPrice,
              total_price: Math.round(totalPrice * 100),
              weight: weight
            }]
          }

          await ipc('sales:add', saleData)
          merged++
        } else {
          // Payment
          const customerId = Number(row.customer_id)
          const amount = Number(row.amount) || 0
          const discountVal = Number(row.discount) || 0

          if (!customerId || amount <= 0 || !rowDate) {
            skipped++
            incompleteIndices.push(i + 1)
            continue
          }

          await ipc('payments:add', {
            customer_id: customerId,
            amount: Math.round(amount * 100),
            discount: Math.round(discountVal * 100),
            date: rowDate,
            notes: null
          })
          merged++
        }
      }

      if (merged > 0) {
        toast.success(`${merged} ${mode === 'sale' ? 'sale' : 'payment'}${merged > 1 ? 's' : ''} merged successfully`)
      }

      if (skipped > 0 && currentDraftId) {
        // Keep only incomplete rows in the draft
        const remainingRows = rows.filter((_, i) => incompleteIndices.includes(i + 1))
        if (remainingRows.length > 0) {
          toast.warning(`${skipped} incomplete ${skipped > 1 ? 'entries were' : 'entry was'} skipped (rows: ${incompleteIndices.join(', ')}). Draft updated with remaining entries.`)
          const draftData = {
            id: currentDraftId,
            type: mode,
            name: currentDraftName || `${mode === 'sale' ? 'Sales' : 'Payments'} Draft`,
            data: JSON.stringify({ sameDate, globalDate, rows: remainingRows })
          }
          await ipc('bulk-drafts:save', draftData)
          setRows(remainingRows)
        } else {
          // All rows are actually done (shouldn't happen but safety)
          await ipc('bulk-drafts:delete', currentDraftId)
          setCurrentDraftId(null)
          setCurrentDraftName('')
          setRows([createEmptyRow()])
        }
      } else if (skipped > 0 && !currentDraftId) {
        toast.warning(`${skipped} incomplete ${skipped > 1 ? 'entries were' : 'entry was'} skipped (rows: ${incompleteIndices.join(', ')})`)
      } else if (merged > 0 && currentDraftId) {
        // All merged successfully, delete draft
        await ipc('bulk-drafts:delete', currentDraftId)
        setCurrentDraftId(null)
        setCurrentDraftName('')
        setRows([createEmptyRow()])
      }

      if (merged > 0 && skipped === 0) {
        setRows([createEmptyRow()])
      }

      loadDrafts()
      if (onMergeComplete) onMergeComplete()

    } catch (e) {
      console.error('Merge failed:', e)
      toast.error('Failed to merge entries')
    } finally {
      setMerging(false)
    }
  }

  // Reset on close
  function handleClose() {
    setShowDrafts(false)
    onClose()
  }

  // New draft button
  function handleNewDraft() {
    setRows([createEmptyRow()])
    setCurrentDraftId(null)
    setCurrentDraftName('')
    setSameDate(true)
    setGlobalDate(new Date().toISOString().slice(0, 10))
    setShowDrafts(false)
  }

  if (!isOpen) return null

  const isSale = mode === 'sale'
  const colCount = isSale ? (sameDate ? 6 : 7) : (sameDate ? 3 : 4)

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
      <div
        ref={modalRef}
        className="bg-white rounded-2xl shadow-2xl w-[95vw] max-w-6xl max-h-[90vh] flex flex-col overflow-hidden border border-gray-200"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 bg-gradient-to-r from-blue-50 to-indigo-50">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-blue-600 flex items-center justify-center">
              <FileText className="w-5 h-5 text-white" />
            </div>
            <div>
              <h2 className="text-lg font-black text-gray-900 tracking-tight">
                Bulk {isSale ? 'Sales' : 'Payments'} Entry
              </h2>
              {currentDraftId && (
                <span className="text-xs text-blue-600 font-semibold">
                  Draft: {currentDraftName || 'Untitled'}
                </span>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2">
            {/* Drafts dropdown */}
            <div className="relative">
              <button
                type="button"
                onClick={() => setShowDrafts(!showDrafts)}
                className="flex items-center gap-1.5 px-3 py-2 border border-gray-300 bg-white text-gray-700 hover:bg-gray-50 rounded-xl text-xs font-bold transition-all shadow-sm"
              >
                <FileText className="w-3.5 h-3.5" />
                Drafts {drafts.length > 0 && <span className="bg-blue-100 text-blue-700 rounded-full px-1.5 text-[10px] font-black">{drafts.length}</span>}
                <ChevronDown className="w-3 h-3" />
              </button>
              {showDrafts && (
                <div className="absolute right-0 mt-1 w-72 bg-white border border-gray-200 rounded-xl shadow-2xl z-50 overflow-hidden">
                  <div className="px-3 py-2 border-b border-gray-100 flex items-center justify-between">
                    <span className="text-[10px] font-black text-gray-500 uppercase tracking-widest">Saved Drafts</span>
                    <button
                      type="button"
                      onClick={handleNewDraft}
                      className="text-[10px] font-bold text-blue-600 hover:text-blue-700 uppercase tracking-wider"
                    >
                      + New
                    </button>
                  </div>
                  {drafts.length === 0 ? (
                    <div className="px-3 py-4 text-center text-xs text-gray-400 italic">No drafts saved</div>
                  ) : (
                    <div className="max-h-48 overflow-y-auto divide-y divide-gray-50">
                      {drafts.map(d => {
                        let rowCount = 0
                        try {
                          const parsed = JSON.parse(d.data)
                          rowCount = parsed.rows?.length || 0
                        } catch {}
                        return (
                          <div
                            key={d.id}
                            onClick={() => handleLoadDraft(d)}
                            className={`px-3 py-2.5 cursor-pointer hover:bg-blue-50 flex items-center justify-between transition-colors ${currentDraftId === d.id ? 'bg-blue-50 border-l-2 border-blue-600' : ''}`}
                          >
                            <div>
                              <div className="text-sm font-semibold text-gray-800">{d.name || 'Untitled'}</div>
                              <div className="text-[10px] text-gray-400 mt-0.5">{rowCount} {rowCount === 1 ? 'entry' : 'entries'}</div>
                            </div>
                            <button
                              type="button"
                              onClick={(e) => handleDeleteDraft(e, d.id)}
                              className="p-1 text-red-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        )
                      })}
                    </div>
                  )}
                </div>
              )}
            </div>
            <button
              type="button"
              onClick={handleClose}
              className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-xl transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Date mode toggle + global date */}
        <div className="px-6 py-3 bg-gray-50 border-b border-gray-150 flex flex-wrap items-center gap-4">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setSameDate(true)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                sameDate
                  ? 'bg-blue-600 text-white shadow-sm'
                  : 'bg-white border border-gray-300 text-gray-600 hover:bg-gray-50'
              }`}
            >
              <CalendarDays className="w-3.5 h-3.5" />
              Same Date
            </button>
            <button
              type="button"
              onClick={() => setSameDate(false)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                !sameDate
                  ? 'bg-blue-600 text-white shadow-sm'
                  : 'bg-white border border-gray-300 text-gray-600 hover:bg-gray-50'
              }`}
            >
              <CalendarRange className="w-3.5 h-3.5" />
              Different Dates
            </button>
          </div>

          {sameDate && (
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Date:</span>
              <DatePicker
                value={globalDate}
                onChange={(e) => setGlobalDate(e.target.value)}
                className="px-2.5 py-1.5 border border-gray-300 rounded-lg text-xs cursor-pointer focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white font-semibold text-slate-800"
              />
            </div>
          )}

          {/* Draft name */}
          <div className="flex items-center gap-2 ml-auto">
            <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Draft Name:</span>
            <input
              type="text"
              value={currentDraftName}
              onChange={(e) => setCurrentDraftName(e.target.value)}
              placeholder="Untitled"
              className="px-2.5 py-1.5 border border-gray-300 rounded-lg text-xs font-semibold w-40 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
        </div>

        {/* Table body */}
        <div className="flex-1 overflow-y-auto overflow-x-hidden min-h-0 min-w-0 bg-white px-6 py-4">
          <div className="overflow-x-auto pb-4">
            <table className="w-full text-sm min-w-max">
              <thead className="sticky top-0 z-10 bg-gray-50 text-gray-500 font-bold uppercase text-[10px] tracking-wider">
                <tr>
                <th className="text-center px-2 py-2.5 w-10">#</th>
                {!sameDate && <th className="text-left px-2 py-2.5 w-36">Date</th>}
                <th className="text-left px-2 py-2.5 min-w-[200px]">Customer Name</th>
                {isSale && (
                  <>
                    <th className="text-right px-2 py-2.5 w-24">Qty</th>
                    <th className="text-right px-2 py-2.5 w-28">Weight (kg)</th>
                    <th className="text-right px-2 py-2.5 w-32">Total Price (₹)</th>
                  </>
                )}
                {!isSale && (
                  <th className="text-right px-2 py-2.5 w-32">Amount (₹)</th>
                )}
                <th className="text-right px-2 py-2.5 w-28">Discount (₹)</th>
                {isSale && <th className="text-right px-2 py-2.5 w-32">Final Value (₹)</th>}
                <th className="text-center px-2 py-2.5 w-12"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {rows.map((row, i) => (
                <tr key={i} className="hover:bg-gray-50/50 transition-colors group">
                  <td className="text-center px-2 py-2 text-gray-400 font-medium text-xs">{i + 1}</td>

                  {/* Per-row date */}
                  {!sameDate && (
                    <td className="px-2 py-2">
                      <DatePicker
                        value={row.date || ''}
                        onChange={(e) => updateRow(i, 'date', e.target.value)}
                        className="w-full min-w-0 px-2 py-1.5 border border-gray-300 rounded-lg text-xs cursor-pointer focus:outline-none focus:ring-2 focus:ring-blue-500 font-semibold"
                      />
                    </td>
                  )}

                  {/* Customer autocomplete */}
                  <td className="px-2 py-2">
                    <CustomerSelect
                      value={row.customer_id}
                      onChange={(id) => handleCustomerChange(i, id)}
                      customers={customers}
                      placeholder="Type customer name..."
                      className="px-2 py-1.5 border border-gray-300 rounded-lg text-xs bg-white"
                    />
                  </td>

                  {/* Sale-specific fields */}
                  {isSale && (
                    <>
                      <td className="px-2 py-2">
                        <input
                          type="number"
                          step="any"
                          placeholder="0"
                          value={row.qty}
                          onChange={(e) => updateRow(i, 'qty', e.target.value)}
                          className="w-full min-w-0 px-2 py-1.5 border border-gray-300 rounded-lg text-xs text-right font-semibold focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />
                      </td>
                      <td className="px-2 py-2">
                        <input
                          type="number"
                          step="any"
                          placeholder="0.00"
                          value={row.weight}
                          onChange={(e) => updateRow(i, 'weight', e.target.value)}
                          className="w-full min-w-0 px-2 py-1.5 border border-gray-300 rounded-lg text-xs text-right font-semibold focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />
                      </td>
                      <td className="px-2 py-2">
                        <input
                          type="number"
                          step="any"
                          placeholder="0.00"
                          value={row.total_price}
                          onChange={(e) => updateRow(i, 'total_price', e.target.value)}
                          className="w-full min-w-0 px-2 py-1.5 border border-gray-300 rounded-lg text-xs text-right font-black text-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />
                      </td>
                    </>
                  )}

                  {/* Payment-specific amount */}
                  {!isSale && (
                    <td className="px-2 py-2">
                      <input
                        type="number"
                        step="any"
                        placeholder="0.00"
                        value={row.amount}
                        onChange={(e) => updateRow(i, 'amount', e.target.value)}
                        className="w-full min-w-0 px-2 py-1.5 border border-gray-300 rounded-lg text-xs text-right font-black text-green-600 focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </td>
                  )}

                  {/* Discount */}
                  <td className="px-2 py-2">
                    <input
                      type="number"
                      step="any"
                      placeholder="0.00"
                      value={row.discount}
                      onChange={(e) => updateRow(i, 'discount', e.target.value)}
                      className="w-full min-w-0 px-2 py-1.5 border border-gray-300 rounded-lg text-xs text-right font-semibold focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </td>

                  {/* Final value (sale only) */}
                  {isSale && (
                    <td className="px-2 py-2">
                      <input
                        type="number"
                        step="any"
                        placeholder="0.00"
                        value={row.final_value}
                        onChange={(e) => updateRow(i, 'final_value', e.target.value)}
                        className="w-full min-w-0 px-2 py-1.5 border border-gray-300 rounded-lg text-xs text-right font-black text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </td>
                  )}

                  {/* Remove row */}
                  <td className="text-center px-2 py-2">
                    {rows.length > 1 && (
                      <button
                        type="button"
                        onClick={() => removeRow(i)}
                        className="p-1 text-red-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors opacity-0 group-hover:opacity-100"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
            <button
              type="button"
              onClick={addRow}
              className="mt-3 flex items-center gap-1.5 px-3 py-2 border-2 border-dashed border-gray-300 text-gray-500 hover:border-blue-400 hover:text-blue-600 rounded-xl text-xs font-bold transition-all w-full justify-center min-w-max"
            >
              <Plus className="w-4 h-4" />
              Add Row
            </button>
          </div>
        </div>

        {/* Footer with actions */}
        <div className="px-6 py-4 border-t border-gray-200 bg-gray-50 flex items-center justify-between">
          <div className="text-xs text-gray-500">
            <span className="font-bold text-gray-700">{rows.length}</span> {rows.length === 1 ? 'entry' : 'entries'}
          </div>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={handleSaveDraft}
              disabled={saving}
              className="flex items-center gap-2 px-4 py-2.5 border border-gray-300 bg-white text-gray-700 hover:bg-gray-50 rounded-xl text-xs font-bold transition-all shadow-sm disabled:opacity-50"
            >
              <Save className="w-4 h-4" />
              {saving ? 'Saving...' : 'Save Draft'}
            </button>
            <button
              type="button"
              onClick={handleMerge}
              disabled={merging}
              className="flex items-center gap-2 px-5 py-2.5 bg-blue-600 text-white hover:bg-blue-700 rounded-xl text-xs font-bold uppercase tracking-wider transition-all shadow-md disabled:opacity-50"
            >
              <Merge className="w-4 h-4" />
              {merging ? 'Merging...' : 'Merge All'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
