import { AlertCircle } from 'lucide-react'

export default function ConfirmDialog({ isOpen, title, message, onConfirm, onCancel, confirmText = 'Confirm', variant = 'danger' }) {
  if (!isOpen) return null

  const btnClass = variant === 'danger' 
    ? 'bg-red-600 hover:bg-red-700' 
    : 'bg-blue-600 hover:bg-blue-700'

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden animate-in fade-in zoom-in duration-200">
        <div className="p-6">
          <div className="flex items-center gap-3 mb-4">
            <div className={`p-2 rounded-full ${variant === 'danger' ? 'bg-red-100 text-red-600' : 'bg-blue-100 text-blue-600'}`}>
              <AlertCircle className="w-6 h-6" />
            </div>
            <h3 className="text-xl font-bold text-gray-900">{title}</h3>
          </div>
          <p className="text-gray-600 leading-relaxed">{message}</p>
        </div>
        <div className="bg-gray-50 px-6 py-4 flex flex-col sm:flex-row-reverse gap-3">
          <button
            onClick={onConfirm}
            className={`px-6 py-2.5 text-white rounded-xl font-bold transition-all ${btnClass}`}
          >
            {confirmText}
          </button>
          <button
            onClick={onCancel}
            className="px-6 py-2.5 bg-white border border-gray-300 text-gray-700 rounded-xl font-bold hover:bg-gray-50 transition-all"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  )
}
