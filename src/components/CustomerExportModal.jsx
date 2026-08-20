import { useState } from 'react'
import { ipc } from '../lib/ipc'
import { formatPhone, formatDate } from '../lib/formatters'
import { toast } from 'sonner'
import DatePicker from './DatePicker'
import { 
  X, 
  Download, 
  Calendar, 
  CalendarDays, 
  CheckSquare, 
  RotateCcw, 
  FileSpreadsheet, 
  Check, 
  Loader2 
} from 'lucide-react'

// Helper date formatters in local timezone
const getTodayStr = () => {
  const d = new Date()
  const year = d.getFullYear()
  const month = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

const getFirstDayOfMonthStr = () => {
  const d = new Date()
  const year = d.getFullYear()
  const month = String(d.getMonth() + 1).padStart(2, '0')
  return `${year}-${month}-01`
}

const AVAILABLE_COLUMNS = [
  { id: 'id', label: 'Customer ID', default: true },
  { id: 'name', label: 'Customer Name', default: true },
  { id: 'phone', label: 'Phone Number', default: true },
  { id: 'carried_forward', label: 'Carried Forward (₹)', default: false },
  { id: 'total_sales', label: 'Total Sales (₹)', default: true },
  { id: 'total_payments', label: 'Total Payments (₹)', default: true },
  { id: 'balance', label: 'Outstanding Balance (₹)', default: true },
]

export default function CustomerExportModal({ isOpen, onClose, search = '', sortBy = 'name', order = 'ASC' }) {
  const [datePreset, setDatePreset] = useState('monthly')
  const [startDate, setStartDate] = useState(getFirstDayOfMonthStr())
  const [endDate, setEndDate] = useState(getTodayStr())
  
  const [selectedColumns, setSelectedColumns] = useState(() => {
    const initial = {}
    AVAILABLE_COLUMNS.forEach((col) => {
      initial[col.id] = col.default
    })
    return initial
  })

  const [applyCurrentSearch, setApplyCurrentSearch] = useState(!!search)
  const [exporting, setExporting] = useState(false)

  if (!isOpen) return null

  // Date Preset Handlers
  const handlePresetSelect = (preset) => {
    setDatePreset(preset)
    if (preset === 'today') {
      const today = getTodayStr()
      setStartDate(today)
      setEndDate(today)
    } else if (preset === 'monthly') {
      setStartDate(getFirstDayOfMonthStr())
      setEndDate(getTodayStr())
    }
  }

  const handleCustomDateChange = (type, value) => {
    setDatePreset('custom')
    if (type === 'start') {
      setStartDate(value)
    } else {
      setEndDate(value)
    }
  }

  // Column Selection Handlers
  const toggleColumn = (id) => {
    setSelectedColumns((prev) => ({
      ...prev,
      [id]: !prev[id],
    }))
  }

  const handleSelectAllColumns = () => {
    const all = {}
    AVAILABLE_COLUMNS.forEach((col) => {
      all[col.id] = true
    })
    setSelectedColumns(all)
  }

  const handleDeselectAllColumns = () => {
    const none = {}
    AVAILABLE_COLUMNS.forEach((col) => {
      none[col.id] = false
    })
    setSelectedColumns(none)
  }

  const handleResetColumns = () => {
    const reset = {}
    AVAILABLE_COLUMNS.forEach((col) => {
      reset[col.id] = col.default
    })
    setSelectedColumns(reset)
  }

  // Export Action
  const handleExport = async () => {
    const activeCols = AVAILABLE_COLUMNS.filter((col) => selectedColumns[col.id])

    if (activeCols.length === 0) {
      return toast.error('Please select at least one column to export')
    }

    if (startDate && endDate && startDate > endDate) {
      return toast.error('Start date cannot be after end date')
    }

    setExporting(true)

    try {
      const data = await ipc('customers:report-data', {
        search: applyCurrentSearch ? search : '',
        startDate: startDate || null,
        endDate: endDate || null,
        sortBy,
        order,
      })

      if (!data || data.length === 0) {
        setExporting(false)
        return toast.error('No customers found to export')
      }

      const headers = activeCols.map((col) => col.label)

      const rows = data.map((c) => {
        return activeCols.map((col) => {
          switch (col.id) {
            case 'id':
              return c.id
            case 'name':
              return c.name
            case 'phone':
              return c.phone ? formatPhone(c.phone) : '-'
            case 'carried_forward':
              return (c.carried_forward || 0) / 100
            case 'total_sales':
              return (c.total_sales || 0) / 100
            case 'total_payments':
              return (c.total_payments || 0) / 100
            case 'balance':
              return (c.balance || 0) / 100
            default:
              return c[col.id] ?? '-'
          }
        })
      })

      let filename = 'Customers_Report'
      if (datePreset === 'today') {
        filename = `Customer_Report_Today_${startDate}`
      } else if (datePreset === 'monthly') {
        filename = `Customer_Report_Monthly_${startDate}_to_${endDate}`
      } else if (startDate || endDate) {
        filename = `Customer_Report_${startDate || 'start'}_to_${endDate || 'end'}`
      }

      const success = await ipc('app:export-excel', filename, headers, rows)
      if (success) {
        toast.success('Customer report exported successfully')
        onClose()
      }
    } catch (err) {
      console.error('Export error:', err)
      toast.error('Failed to export customer report')
    } finally {
      setExporting(false)
    }
  }

  const selectedCount = Object.values(selectedColumns).filter(Boolean).length

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4 animate-in fade-in duration-150">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden border border-gray-100 flex flex-col max-h-[92vh]">
        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between bg-gradient-to-r from-blue-50/70 to-indigo-50/70">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-blue-600 text-white shadow-md shadow-blue-500/20">
              <FileSpreadsheet className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-gray-900">Export Customer Report</h2>
              <p className="text-xs text-gray-500 font-medium">Customize date ranges and columns for Excel</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-xl text-gray-400 hover:text-gray-700 hover:bg-white/80 transition-all"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-6 overflow-y-auto">
          {/* Section 1: Date Selection */}
          <div className="space-y-3">
            <label className="text-xs font-bold text-gray-700 uppercase tracking-wider flex items-center gap-1.5">
              <Calendar className="w-3.5 h-3.5 text-blue-600" />
              Date Range (Sales & Payments)
            </label>

            {/* Presets */}
            <div className="grid grid-cols-3 gap-2">
              <button
                type="button"
                onClick={() => handlePresetSelect('today')}
                className={`py-2 px-3 rounded-xl text-xs font-bold transition-all border ${
                  datePreset === 'today'
                    ? 'bg-blue-600 text-white border-blue-600 shadow-sm shadow-blue-500/20'
                    : 'bg-gray-50 text-gray-700 border-gray-200 hover:bg-gray-100'
                }`}
              >
                Today
              </button>
              <button
                type="button"
                onClick={() => handlePresetSelect('monthly')}
                className={`py-2 px-3 rounded-xl text-xs font-bold transition-all border ${
                  datePreset === 'monthly'
                    ? 'bg-blue-600 text-white border-blue-600 shadow-sm shadow-blue-500/20'
                    : 'bg-gray-50 text-gray-700 border-gray-200 hover:bg-gray-100'
                }`}
              >
                Monthly
              </button>
              <button
                type="button"
                onClick={() => setDatePreset('custom')}
                className={`py-2 px-3 rounded-xl text-xs font-bold transition-all border ${
                  datePreset === 'custom'
                    ? 'bg-blue-600 text-white border-blue-600 shadow-sm shadow-blue-500/20'
                    : 'bg-gray-50 text-gray-700 border-gray-200 hover:bg-gray-100'
                }`}
              >
                Start & End Date
              </button>
            </div>

            {/* Date Pickers */}
            <div className="grid grid-cols-2 gap-3 pt-1">
              <div className="space-y-1">
                <span className="text-[11px] font-semibold text-gray-500">Start Date</span>
                <div className="relative border border-gray-300 rounded-xl px-3 py-2 bg-white hover:border-blue-400 focus-within:ring-2 focus-within:ring-blue-500 transition-all">
                  <DatePicker
                    value={startDate}
                    onChange={(e) => handleCustomDateChange('start', e.target.value)}
                    className="w-full text-xs font-medium text-gray-800"
                  />
                </div>
              </div>

              <div className="space-y-1">
                <span className="text-[11px] font-semibold text-gray-500">End Date</span>
                <div className="relative border border-gray-300 rounded-xl px-3 py-2 bg-white hover:border-blue-400 focus-within:ring-2 focus-within:ring-blue-500 transition-all">
                  <DatePicker
                    value={endDate}
                    onChange={(e) => handleCustomDateChange('end', e.target.value)}
                    className="w-full text-xs font-medium text-gray-800"
                  />
                </div>
              </div>
            </div>

            {/* Date range active explanation */}
            <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-200/80 flex items-center gap-2 text-xs text-slate-600">
              <CalendarDays className="w-4 h-4 text-blue-600 shrink-0" />
              <span>
                Sales and payments will be totalled from{' '}
                <strong className="text-gray-900 font-semibold">{formatDate(startDate) || 'Start'}</strong> to{' '}
                <strong className="text-gray-900 font-semibold">{formatDate(endDate) || 'End'}</strong>.
              </span>
            </div>
          </div>

          {/* Section 2: Columns Selection */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold text-gray-700 uppercase tracking-wider flex items-center gap-1.5">
                <CheckSquare className="w-3.5 h-3.5 text-blue-600" />
                Columns to Include ({selectedCount}/{AVAILABLE_COLUMNS.length})
              </label>

              <div className="flex items-center gap-2 text-xs">
                <button
                  type="button"
                  onClick={handleSelectAllColumns}
                  className="text-blue-600 hover:text-blue-700 font-semibold hover:underline"
                >
                  Select All
                </button>
                <span className="text-gray-300">|</span>
                <button
                  type="button"
                  onClick={handleDeselectAllColumns}
                  className="text-gray-500 hover:text-gray-700 font-semibold hover:underline"
                >
                  Deselect
                </button>
                <span className="text-gray-300">|</span>
                <button
                  type="button"
                  onClick={handleResetColumns}
                  className="text-gray-500 hover:text-gray-700 font-semibold flex items-center gap-0.5 hover:underline"
                  title="Reset to default columns"
                >
                  <RotateCcw className="w-3 h-3" /> Reset
                </button>
              </div>
            </div>

            {/* Column Checkboxes */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {AVAILABLE_COLUMNS.map((col) => {
                const isChecked = !!selectedColumns[col.id]
                return (
                  <button
                    key={col.id}
                    type="button"
                    onClick={() => toggleColumn(col.id)}
                    className={`flex items-center gap-2.5 p-3 rounded-xl border text-left transition-all ${
                      isChecked
                        ? 'bg-blue-50/70 border-blue-300 text-blue-950 font-semibold shadow-xs'
                        : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50'
                    }`}
                  >
                    <div
                      className={`w-4 h-4 rounded flex items-center justify-center transition-all ${
                        isChecked ? 'bg-blue-600 text-white' : 'border border-gray-300 bg-white'
                      }`}
                    >
                      {isChecked && <Check className="w-3 h-3 stroke-[3]" />}
                    </div>
                    <span className="text-xs">{col.label}</span>
                  </button>
                )
              })}
            </div>
          </div>

          {/* Section 3: Search filter condition if active */}
          {search && (
            <div className="pt-2 border-t border-gray-100">
              <label className="flex items-center gap-2.5 text-xs text-gray-700 cursor-pointer">
                <input
                  type="checkbox"
                  checked={applyCurrentSearch}
                  onChange={(e) => setApplyCurrentSearch(e.target.checked)}
                  className="rounded text-blue-600 focus:ring-blue-500 w-4 h-4 cursor-pointer"
                />
                <span>
                  Export only matching current search (<strong className="font-semibold text-gray-900">"{search}"</strong>)
                </span>
              </label>
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="bg-gray-50 px-6 py-4 border-t border-gray-100 flex items-center justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            disabled={exporting}
            className="px-5 py-2.5 bg-white border border-gray-300 text-gray-700 rounded-xl text-xs font-bold hover:bg-gray-100 transition-all shadow-xs"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleExport}
            disabled={exporting || selectedCount === 0}
            className="px-6 py-2.5 bg-blue-600 text-white rounded-xl text-xs font-bold hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-md shadow-blue-500/20 flex items-center gap-2"
          >
            {exporting ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Exporting...
              </>
            ) : (
              <>
                <Download className="w-4 h-4" />
                Export to Excel
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  )
}
