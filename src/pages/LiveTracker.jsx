import { useState, useEffect, useMemo, useRef } from 'react'
import { ipc } from '../lib/ipc'
import { toast } from 'sonner'
import { RefreshCcw, MapPin, WifiOff, AlertTriangle } from 'lucide-react'
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet'
import 'leaflet/dist/leaflet.css'
import L from 'leaflet'

// Fix for default marker icons in react-leaflet
import icon from 'leaflet/dist/images/marker-icon.png'
import iconShadow from 'leaflet/dist/images/marker-shadow.png'

const STALE_THRESHOLD_MINUTES = 15

// Green marker for active, Gray for stale
const createCustomIcon = (isStale) => {
  return L.divIcon({
    className: 'custom-leaflet-marker',
    html: `<div style="
      background-color: ${isStale ? '#9ca3af' : '#10b981'};
      width: 20px;
      height: 20px;
      border-radius: 50%;
      border: 3px solid white;
      box-shadow: 0 2px 4px rgba(0,0,0,0.3);
    "></div>`,
    iconSize: [20, 20],
    iconAnchor: [10, 10],
  })
}

function MapUpdater({ locations }) {
  const map = useMap()
  
  useEffect(() => {
    if (locations.length > 0) {
      const bounds = L.latLngBounds(locations.map(loc => [loc.latitude, loc.longitude]))
      map.fitBounds(bounds, { padding: [50, 50], maxZoom: 15 })
    }
  }, [map, locations])
  
  return null
}

export default function LiveTracker() {
  const [data, setData] = useState(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState(null)
  const mapRef = useRef(null)

  useEffect(() => {
    fetchLocations()
    const interval = setInterval(fetchLocations, 15000)
    return () => clearInterval(interval)
  }, [])

  const fetchLocations = async () => {
    setIsLoading(true)
    try {
      const res = await ipc('drivers:locations')
      if (res.success) {
        setData(res.data)
        setError(null)
      } else {
        // Only set error if we don't have data, otherwise just silently fail
        if (!data) setError(res.error)
      }
    } catch (err) {
      if (!data) setError(err.message)
    } finally {
      setIsLoading(false)
    }
  }

  const enrichedLocations = useMemo(() => {
    if (!data?.locations) return []
    const now = new Date()

    return data.locations.map(loc => {
      const recordedAt = loc.recorded_at ? new Date(loc.recorded_at) : null
      const isValidDate = recordedAt !== null && !isNaN(recordedAt.getTime())
      const diffMs = isValidDate ? now.getTime() - recordedAt.getTime() : Infinity
      const diffMins = Math.floor(diffMs / 60000)
      const isStale = !isValidDate || diffMins > STALE_THRESHOLD_MINUTES

      let lastSeenText
      if (!isValidDate) {
        lastSeenText = 'N/A'
      } else if (isStale) {
        lastSeenText = `Last seen ${diffMins} min ago`
      } else {
        lastSeenText = `Updated: ${recordedAt.toLocaleTimeString()}`
      }

      return {
        ...loc,
        isStale,
        lastSeenText
      }
    })
  }, [data])

  if (error && !data) {
    return (
      <div className="p-6 h-full flex flex-col items-center justify-center bg-gray-50">
        <WifiOff className="w-16 h-16 text-red-500 mb-4" />
        <h2 className="text-xl font-bold text-gray-900 mb-2">Sync Connection Error</h2>
        <p className="text-gray-500 max-w-md text-center">{error}</p>
        <button 
          onClick={fetchLocations}
          className="mt-6 px-4 py-2 bg-blue-600 text-white rounded-lg font-bold shadow-sm"
        >
          Try Again
        </button>
      </div>
    )
  }

  const defaultCenter = [20.5937, 78.9629] // Default India center

  return (
    <div className="h-full flex flex-col relative bg-gray-50">
      {/* Header overlay */}
      <div className="absolute top-4 left-4 right-4 z-[400] flex justify-between items-start pointer-events-none">
        <div className="bg-white/95 backdrop-blur-md border border-gray-200 p-4 rounded-2xl shadow-lg pointer-events-auto max-w-sm">
          <h1 className="text-lg font-black text-gray-900 uppercase tracking-wider">Live Tracker</h1>
          <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mt-1">
            {enrichedLocations.length} active drivers • Updates every 15s
          </p>
          
          {error && (
            <div className="mt-3 flex items-center gap-2 bg-red-50 text-red-600 p-2 rounded-lg text-xs font-bold border border-red-100">
              <AlertTriangle className="w-4 h-4 flex-shrink-0" />
              Failed to poll latest coordinates
            </div>
          )}
        </div>

        <button 
          onClick={fetchLocations}
          disabled={isLoading}
          className="pointer-events-auto bg-white border border-gray-200 p-3 rounded-xl shadow-lg text-blue-600 hover:bg-gray-50 disabled:opacity-50 transition-colors"
        >
          <RefreshCcw className={`w-5 h-5 ${isLoading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      <div className="flex-1 w-full z-0">
        <MapContainer 
          center={defaultCenter} 
          zoom={5} 
          style={{ height: '100%', width: '100%' }}
          zoomControl={false}
          ref={mapRef}
        >
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
            url="https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png"
          />
          
          {enrichedLocations.map(driver => (
            <Marker 
              key={driver.driver_id} 
              position={[driver.latitude, driver.longitude]}
              icon={createCustomIcon(driver.isStale)}
            >
              <Popup className="rounded-xl overflow-hidden shadow-lg border-0">
                <div className="p-1">
                  <h3 className="font-bold text-gray-900 text-sm m-0">{driver.driver_name || 'Driver'}</h3>
                  <p className="text-[10px] font-mono text-gray-500 m-0 mt-0.5">{driver.phone}</p>
                  
                  <div className={`mt-2 px-2 py-1 rounded text-[10px] font-bold uppercase tracking-wider inline-block ${driver.isStale ? 'bg-gray-100 text-gray-600' : 'bg-green-100 text-green-700'}`}>
                    {driver.isStale ? 'Inactive' : 'Active'}
                  </div>
                  <p className="text-[10px] text-gray-400 font-medium m-0 mt-1">{driver.lastSeenText}</p>
                </div>
              </Popup>
            </Marker>
          ))}
          <MapUpdater locations={enrichedLocations} />
        </MapContainer>
      </div>
    </div>
  )
}
