import { useState, useEffect } from 'react'
import { ipc } from '../lib/ipc'
import { toast } from 'sonner'
import { Plus, Package, MapPin, Search } from 'lucide-react'

export default function Deliveries() {
  const [deliveries, setDeliveries] = useState([])
  const [drivers, setDrivers] = useState([])
  const [activeTab, setActiveTab] = useState('pending')
  
  const [isAddModalOpen, setIsAddModalOpen] = useState(false)
  const [selectedDriverId, setSelectedDriverId] = useState('')
  const [deliveryNotes, setDeliveryNotes] = useState('')

  useEffect(() => {
    loadData()
  }, [])

  const loadData = async () => {
    const [delRes, drvRes] = await Promise.all([
      ipc('deliveries:list'),
      ipc('drivers:list')
    ])
    if (delRes.success) setDeliveries(delRes.data)
    if (drvRes.success) setDrivers(drvRes.data.filter(d => d.active === 1)) // Only active drivers
  }

  const handleCreateDelivery = async (e) => {
    e.preventDefault()
    if (!selectedDriverId) {
      toast.error('Please select a driver')
      return
    }

    const id = crypto.randomUUID()
    const res = await ipc('deliveries:add', {
      id,
      driver_id: selectedDriverId,
      status: 'pending',
      notes: deliveryNotes
    })

    if (res.success) {
      toast.success('Dispatch order created')
      setIsAddModalOpen(false)
      setSelectedDriverId('')
      setDeliveryNotes('')
      loadData()
    } else {
      toast.error('Failed to create order: ' + res.error)
    }
  }

  const handleUpdateStatus = async (id, currentStatus) => {
    const nextStatus = currentStatus === 'pending' ? 'in_progress' : currentStatus === 'in_progress' ? 'completed' : 'pending'
    const res = await ipc('deliveries:update-status', id, nextStatus)
    if (res.success) {
      toast.success('Status updated')
      loadData()
    } else {
      toast.error('Failed to update status')
    }
  }

  const filteredDeliveries = deliveries.filter(d => {
    if (activeTab === 'pending') return d.status === 'pending' || d.status === 'in_progress'
    if (activeTab === 'completed') return d.status === 'completed'
    return true
  })

  return (
    <div className="p-6 h-full flex flex-col bg-gray-50">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Dispatch Orders</h1>
          <p className="text-sm text-gray-500 mt-1">Manage standalone delivery orders for drivers.</p>
        </div>
        <button
          onClick={() => setIsAddModalOpen(true)}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-xl hover:bg-blue-700 transition-colors shadow-sm"
        >
          <Plus className="w-4 h-4" />
          <span className="font-semibold text-sm">New Order</span>
        </button>
      </div>

      <div className="flex border-b border-gray-200 mb-4">
        <button
          onClick={() => setActiveTab('pending')}
          className={`px-4 py-3 text-sm font-bold uppercase tracking-wider border-b-2 transition-colors ${activeTab === 'pending' ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}
        >
          Active Orders
        </button>
        <button
          onClick={() => setActiveTab('completed')}
          className={`px-4 py-3 text-sm font-bold uppercase tracking-wider border-b-2 transition-colors ${activeTab === 'completed' ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}
        >
          Completed
        </button>
      </div>

      <div className="flex-1 overflow-auto">
        {filteredDeliveries.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-gray-400">
            <Package className="w-12 h-12 mb-4 opacity-50" />
            <p>No orders in this category</p>
          </div>
        ) : (
          <div className="grid gap-3">
            {filteredDeliveries.map(order => (
              <div key={order.id} className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm">
                <div className="flex justify-between items-start mb-3">
                  <div>
                    <h3 className="font-bold text-gray-900 text-base">Driver: {order.driver_name || 'Unknown'}</h3>
                    <p className="text-xs text-gray-500 font-mono mt-0.5">{order.driver_phone}</p>
                  </div>
                  <span className={`text-[10px] font-black uppercase tracking-wider px-2.5 py-1 rounded-full ${
                    order.status === 'completed' ? 'bg-green-100 text-green-700' :
                    order.status === 'in_progress' ? 'bg-blue-100 text-blue-700' :
                    'bg-amber-100 text-amber-700'
                  }`}>
                    {order.status.replace('_', ' ')}
                  </span>
                </div>
                
                {order.notes && (
                  <div className="bg-gray-50 p-3 rounded-lg border border-gray-100 mb-4">
                    <p className="text-sm text-gray-700 whitespace-pre-wrap">{order.notes}</p>
                  </div>
                )}
                
                <div className="flex justify-between items-center mt-2 border-t border-gray-100 pt-3">
                  <span className="text-xs text-gray-400 font-medium">
                    Created: {new Date(order.created_at).toLocaleString()}
                  </span>
                  
                  {order.status !== 'completed' && (
                    <button
                      onClick={() => handleUpdateStatus(order.id, order.status)}
                      className="px-3 py-1.5 text-xs font-bold rounded-lg bg-gray-900 text-white hover:bg-gray-800 transition-colors"
                    >
                      {order.status === 'pending' ? 'Start Delivery' : 'Mark Completed'}
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {isAddModalOpen && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-md overflow-hidden shadow-xl flex flex-col max-h-[90vh]">
            <div className="p-4 border-b border-gray-100 flex justify-between items-center bg-gray-50">
              <h2 className="font-bold text-lg text-gray-900">New Dispatch Order</h2>
              <button onClick={() => setIsAddModalOpen(false)} className="text-gray-400 hover:text-gray-600">✕</button>
            </div>
            
            <form onSubmit={handleCreateDelivery} className="p-6 space-y-4 overflow-y-auto">
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">Assign Driver *</label>
                <select
                  value={selectedDriverId}
                  onChange={e => setSelectedDriverId(e.target.value)}
                  className="w-full border border-gray-300 rounded-xl px-3 py-2 outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all bg-white"
                  required
                >
                  <option value="" disabled>Select an active driver</option>
                  {drivers.map(d => (
                    <option key={d.id} value={d.id}>{d.name} ({d.phone})</option>
                  ))}
                </select>
                {drivers.length === 0 && (
                  <p className="text-xs text-red-500 mt-1">No active drivers available. Add a driver first.</p>
                )}
              </div>
              
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">Order Details / Address *</label>
                <textarea
                  value={deliveryNotes}
                  onChange={e => setDeliveryNotes(e.target.value)}
                  className="w-full border border-gray-300 rounded-xl px-3 py-2 outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all resize-none h-32"
                  placeholder="Enter items to deliver, customer address, amounts to collect, etc."
                  required
                />
              </div>

              <button 
                type="submit" 
                disabled={drivers.length === 0}
                className="w-full py-2.5 mt-2 bg-blue-600 text-white font-bold rounded-xl hover:bg-blue-700 transition-colors disabled:opacity-50"
              >
                Create Order
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
