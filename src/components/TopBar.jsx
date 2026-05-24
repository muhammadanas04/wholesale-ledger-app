import { useState, useEffect } from 'react'
import { Wifi, WifiOff, Clock, RefreshCw } from 'lucide-react'

export default function TopBar() {
  const [isOnline, setIsOnline] = useState(navigator.onLine)

  useEffect(() => {
    const on = () => setIsOnline(true)
    const off = () => setIsOnline(false)
    window.addEventListener('online', on)
    window.addEventListener('offline', off)
    return () => {
      window.removeEventListener('online', on)
      window.removeEventListener('offline', off)
    }
  }, [])

  return (
    <header className="h-14 bg-white border-b border-gray-200 flex items-center justify-between px-6">
      <div />
      <div className="flex items-center gap-2 text-sm text-gray-500">
        {isOnline ? (
          <Wifi className="w-4 h-4 text-green-500" />
        ) : (
          <WifiOff className="w-4 h-4 text-red-500" />
        )}
        <span>{isOnline ? 'Online' : 'Offline'}</span>
        <span className="mx-2">·</span>
        <Clock className="w-4 h-4" />
        <span>Synced just now</span>
      </div>
    </header>
  )
}
