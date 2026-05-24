import { ChevronLeft, ChevronRight } from 'lucide-react'

export default function Pagination({ current, total, onPageChange }) {
  if (total <= 1) return null

  return (
    <div className="flex items-center justify-center gap-2 py-4">
      <button
        onClick={() => onPageChange(current - 1)}
        disabled={current === 1}
        className="p-2 border border-gray-300 rounded-lg disabled:opacity-30 hover:bg-gray-50 transition-colors"
      >
        <ChevronLeft className="w-4 h-4" />
      </button>
      
      <span className="text-sm text-gray-500 font-medium">
        Page <span className="text-gray-800">{current}</span> of <span className="text-gray-800">{total}</span>
      </span>

      <button
        onClick={() => onPageChange(current + 1)}
        disabled={current === total}
        className="p-2 border border-gray-300 rounded-lg disabled:opacity-30 hover:bg-gray-50 transition-colors"
      >
        <ChevronRight className="w-4 h-4" />
      </button>
    </div>
  )
}
