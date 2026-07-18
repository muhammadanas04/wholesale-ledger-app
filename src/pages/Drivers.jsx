import { useState, useEffect } from 'react'
import { ipc } from '../lib/ipc'
import { toast } from 'sonner'
import { Plus, CheckCircle2, Copy } from 'lucide-react'

export default function Drivers() {
  const [drivers, setDrivers] = useState([])
  const [isAddModalOpen, setIsAddModalOpen] = useState(false)
  const [isOtpModalOpen, setIsOtpModalOpen] = useState(false)
  
  const [newDriverName, setNewDriverName] = useState('')
  const [newDriverPhone, setNewDriverPhone] = useState('')
  const [createdOtp, setCreatedOtp] = useState('')
  const [createdDriverName, setCreatedDriverName] = useState('')

  useEffect(() => {
    loadDrivers()

    // Auto-refresh when background sync completes
    const unsubscribe = window.electronAPI.on('sync:status', (data) => {
      if (data.status === 'online') {
        loadDrivers()
      }
    })
    return () => unsubscribe && unsubscribe()
  }, [])

  const loadDrivers = async () => {
    const data = await ipc('drivers:list')
    if (data) setDrivers(data)
  }

  const handleRegisterDriver = async (e) => {
    e.preventDefault()
    const cleanPhone = newDriverPhone.replace(/\D/g, '')
    if (cleanPhone.length !== 10) {
      toast.error('Phone number must be exactly 10 digits.')
      return
    }

    const otpCode = String(100000 + Math.floor(Math.random() * 900000))
    const formattedName = newDriverName.trim() || 'Unnamed Driver'
    const id = crypto.randomUUID()

    const res = await ipc('drivers:add', {
      id,
      name: formattedName,
      phone: cleanPhone,
      otp: otpCode,
      otp_used: 0,
      active: 1
    })

    if (res.success) {
      setNewDriverName('')
      setNewDriverPhone('')
      setIsAddModalOpen(false)
      setCreatedDriverName(formattedName)
      setCreatedOtp(otpCode)
      setIsOtpModalOpen(true)
      toast.success('Driver registered successfully')
      loadDrivers()
    } else {
      toast.error('Failed to register driver: ' + res.error)
    }
  }

  const handleToggleActive = async (id) => {
    const res = await ipc('drivers:toggle-status', id)
    if (res.success) {
      toast.success('Status updated')
      loadDrivers()
    } else {
      toast.error('Failed to update status')
    }
  }

  return (
    <div className="p-6 h-full flex flex-col bg-gray-50">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Drivers List</h1>
          <p className="text-sm text-gray-500 mt-1">Manage delivery drivers and
access credentials.</p>
        </div>
        <button
          onClick={() => setIsAddModalOpen(true)}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-xl hover:bg-blue-700 transition-colors shadow-sm"
        >
          <Plus className="w-4 h-4" />
          <span className="font-semibold text-sm">Add Driver</span>
        </button>
      </div>

      <div className="flex-1 overflow-auto">
        {drivers.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-gray-400">
            <Plus className="w-12 h-12 mb-4 opacity-50" />
            <p>No drivers registered yet</p>
          </div>
        ) : (
          <div className="grid gap-3">
            {drivers.map(driver => (
              <div key={driver.id} className="bg-white border border-gray-200 rounded-xl p-4 flex justify-between items-center shadow-sm">
                <div>
                  <h3 className="font-bold text-gray-900">{driver.name}</h3>
                  <div className="flex items-center gap-2 mt-1">
                    <span className="text-sm text-gray-500 font-mono">{driver.phone}</span>
                    <span className="w-1 h-1 bg-gray-300 rounded-full"></span>
                    <span className={`text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full ${driver.active === 1 ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                      {driver.active === 1 ? 'Active' : 'Inactive'}
                    </span>
                  </div>
                </div>
                <button
                  onClick={() => handleToggleActive(driver.id)}
                  className={`px-3 py-1.5 text-xs font-bold rounded-lg border transition-colors ${driver.active === 1 ? 'border-gray-200 text-gray-500 hover:bg-gray-50' : 'border-blue-200 bg-blue-50 text-blue-600 hover:bg-blue-100'}`}
                >
                  {driver.active === 1 ? 'Deactivate' : 'Activate'}
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {isAddModalOpen && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-md overflow-hidden shadow-xl">
            <div className="p-4 border-b border-gray-100 flex justify-between items-center bg-gray-50">
              <h2 className="font-bold text-lg text-gray-900">Register Driver</h2>
              <button onClick={() => setIsAddModalOpen(false)} className="text-gray-400 hover:text-gray-600">✕</button>
            </div>
            <form onSubmit={handleRegisterDriver} className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">Driver Name (Optional)</label>
                <input
                  type="text"
                  value={newDriverName}
                  onChange={e => setNewDriverName(e.target.value)}
                  className="w-full border border-gray-300 rounded-xl px-3 py-2 outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all"
                  placeholder="Enter full name"
                />
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">Phone Number (Required) *</label>
                <input
                  type="tel"
                  maxLength={10}
                  value={newDriverPhone}
                  onChange={e => setNewDriverPhone(e.target.value.replace(/\D/g, ''))}
                  className="w-full border border-gray-300 rounded-xl px-3 py-2 outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all font-mono"
                  placeholder="10-digit mobile number"
                  required
                />
              </div>
              <button type="submit" className="w-full py-2.5 mt-2 bg-blue-600 text-white font-bold rounded-xl hover:bg-blue-700 transition-colors">
                Register Account
              </button>
            </form>
          </div>
        </div>
      )}

      {isOtpModalOpen && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-sm p-6 flex flex-col items-center text-center shadow-xl">
            <div className="w-12 h-12 rounded-full bg-green-100 text-green-600 flex items-center justify-center mb-4">
              <CheckCircle2 className="w-6 h-6" />
            </div>
            <h2 className="text-lg font-bold text-gray-900">Account Created!</h2>
            <p className="text-sm text-gray-500 mt-1 mb-6">Registered credentials for {createdDriverName}</p>
            
            <div className="w-full border border-gray-200 bg-gray-50 rounded-xl py-4 mb-2">
              <span className="text-3xl font-black font-mono tracking-widest text-gray-900">{createdOtp}</span>
            </div>

            <button 
              onClick={() => {
                navigator.clipboard.writeText(createdOtp)
                toast.success('OTP Copied')
              }}
              className="flex items-center gap-2 text-blue-600 text-sm font-semibold mb-6 hover:text-blue-700"
            >
              <Copy className="w-4 h-4" /> Copy OTP Code
            </button>

            <p className="text-[10px] text-red-500 font-bold mb-4 px-4 leading-relaxed">
              * Note: Share this code with the driver. For safety reasons, it will not be displayed again once you close this.
            </p>

            <button 
              onClick={() => setIsOtpModalOpen(false)}
              className="w-full py-2.5 bg-gray-900 text-white font-bold rounded-xl hover:bg-gray-800 transition-colors"
            >
              Done
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
