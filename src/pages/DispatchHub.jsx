import { useState } from 'react'
import Drivers from './Drivers'
import Deliveries from './Deliveries'
import LiveTracker from './LiveTracker'
import { Truck, Send, MapPin } from 'lucide-react'

export default function DispatchHub() {
  const [activeTab, setActiveTab] = useState('drivers')

  return (
    <div className="h-full flex flex-col bg-gray-50">
      <div className="bg-white border-b border-gray-200 flex px-4 gap-2 flex-shrink-0">
        <button
          onClick={() => setActiveTab('drivers')}
          className={`flex items-center gap-2 px-4 py-3 text-sm font-bold uppercase tracking-wider border-b-2 transition-colors ${
            activeTab === 'drivers' 
              ? 'border-blue-600 text-blue-600' 
              : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-200'
          }`}
        >
          <Truck className="w-4 h-4" />
          Drivers
        </button>
        <button
          onClick={() => setActiveTab('deliveries')}
          className={`flex items-center gap-2 px-4 py-3 text-sm font-bold uppercase tracking-wider border-b-2 transition-colors ${
            activeTab === 'deliveries' 
              ? 'border-blue-600 text-blue-600' 
              : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-200'
          }`}
        >
          <Send className="w-4 h-4" />
          Dispatch Orders
        </button>
        <button
          onClick={() => setActiveTab('tracker')}
          className={`flex items-center gap-2 px-4 py-3 text-sm font-bold uppercase tracking-wider border-b-2 transition-colors ${
            activeTab === 'tracker' 
              ? 'border-blue-600 text-blue-600' 
              : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-200'
          }`}
        >
          <MapPin className="w-4 h-4" />
          Live Tracker
        </button>
      </div>

      <div className="flex-1 overflow-hidden relative">
        {activeTab === 'drivers' && <Drivers />}
        {activeTab === 'deliveries' && <Deliveries />}
        {activeTab === 'tracker' && <LiveTracker />}
      </div>
    </div>
  )
}
