import { useState, useEffect } from 'react'
import { Wifi, WifiOff, Clock, RefreshCw, ArrowUpCircle } from 'lucide-react'
import { ipc } from '../lib/ipc'

export default function TopBar() {
  const [isOnline, setIsOnline] = useState(navigator.onLine)
  const [syncStatus, setSyncStatus] = useState('online')
  const [lastSync, setLastSync] = useState(null)
  const [updateAvailable, setUpdateAvailable] = useState(false)
  const [updateDownloaded, setUpdateDownloaded] = useState(false)

  useEffect(() => {
    const on = () => setIsOnline(true)
    const off = () => setIsOnline(false)
    window.addEventListener('online', on)
    window.addEventListener('offline', off)

    const syncHandler = (event, data) => {
      setSyncStatus(data.status)
      if (data.lastSync) setLastSync(data.lastSync)
    }

    const updateAvailableHandler = () => setUpdateAvailable(true)
    const updateDownloadedHandler = () => {
      setUpdateAvailable(false)
      setUpdateDownloaded(true)
    }

    if (window.electronAPI) {
      window.electronAPI.on('sync:status', syncHandler)
      window.electronAPI.on('app:update-available', updateAvailableHandler)
      window.electronAPI.on('app:update-downloaded', updateDownloadedHandler)
    }

    // Initial last sync check
    ipc('meta:get', 'last_sync_time').then(setLastSync)

    return () => {
      window.removeEventListener('online', on)
      window.removeEventListener('offline', off)
    }
  }, [])

  function handleRestart() {
    if (window.electronAPI) {
      window.electronAPI.send('app:restart-and-install')
    }
  }

  return (
    <header className="h-14 bg-white border-b border-gray-200 flex items-center justify-between px-6 shrink-0">
      <div className="flex items-center gap-4">
        {updateAvailable && (
          <div className="flex items-center gap-2 px-3 py-1 bg-blue-50 text-blue-600 rounded-full text-xs font-bold animate-pulse">
            <ArrowUpCircle className="w-3 h-3" /> Update Available
          </div>
        )}
        {updateDownloaded && (
          <button 
            onClick={handleRestart}
            className="flex items-center gap-2 px-3 py-1 bg-green-600 text-white rounded-full text-xs font-bold hover:bg-green-700 transition-all shadow-sm"
          >
            <ArrowUpCircle className="w-3 h-3" /> Restart to Update
          </button>
        )}
      </div>
      
      <div className="flex items-center gap-4 text-xs font-medium text-gray-500">
        <div className="flex items-center gap-1.5">
          {isOnline ? (
            <Wifi className="w-3.5 h-3.5 text-green-500" />
          ) : (
            <WifiOff className="w-3.5 h-3.5 text-red-500" />
          )}
          <span>{isOnline ? 'Online' : 'Offline'}</span>
        </div>
        
        <span className="w-px h-3 bg-gray-200" />
        
        <div className="flex items-center gap-1.5">
          {syncStatus === 'syncing' ? (
            <RefreshCw className="w-3.5 h-3.5 text-blue-500 animate-spin" />
          ) : (
            <Clock className="w-3.5 h-3.5 text-gray-400" />
          )}
          <span>{syncStatus === 'syncing' ? 'Syncing...' : (lastSync ? `Last sync: ${lastSync}` : 'Never synced')}</span>
        </div>

        <button 
          onClick={() => ipc('sync:run')}
          disabled={syncStatus === 'syncing' || !isOnline}
          className="p-1.5 hover:bg-gray-100 rounded-lg transition-colors disabled:opacity-30"
          title="Sync Now"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${syncStatus === 'syncing' ? 'animate-spin' : ''}`} />
        </button>
      </div>
    </header>
  )
}
