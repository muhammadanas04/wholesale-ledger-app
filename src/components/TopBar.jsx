import { useState, useEffect, useRef } from 'react'
import { Wifi, WifiOff, Clock, RefreshCw, ArrowUpCircle, AlertCircle, CloudOff, Bell } from 'lucide-react'
import { Link } from 'react-router-dom'
import { ipc } from '../lib/ipc'
import { toast } from 'sonner'
import { formatDateTime } from '../lib/formatters'

export default function TopBar() {
  const [isOnline, setIsOnline] = useState(navigator.onLine)
  const [syncStatus, setSyncStatus] = useState('online')
  const [lastSync, setLastSync] = useState(null)
  const [syncError, setSyncError] = useState(null)
  const [syncConfigured, setSyncConfigured] = useState(true)
  const [updateAvailable, setUpdateAvailable] = useState(false)
  const [updateDownloaded, setUpdateDownloaded] = useState(false)
  const [updateVersion, setUpdateVersion] = useState(null)
  
  const [dueReminders, setDueReminders] = useState([])
  const [showReminders, setShowReminders] = useState(false)
  const remindersRef = useRef(null)

  useEffect(() => {
    function handleClickOutside(event) {
      if (remindersRef.current && !remindersRef.current.contains(event.target)) {
        setShowReminders(false)
      }
    }
    document.addEventListener("mousedown", handleClickOutside)
    return () => {
      document.removeEventListener("mousedown", handleClickOutside)
    }
  }, [])

  useEffect(() => {
    const on = () => setIsOnline(true)
    const off = () => setIsOnline(false)
    window.addEventListener('online', on)
    window.addEventListener('offline', off)

    const syncHandler = (data) => {
      setSyncStatus(data.status)
      if (data.lastSync) setLastSync(data.lastSync)
      if (data.status === 'not-configured') {
        setSyncConfigured(false)
        setSyncError(null)
      } else if (data.status === 'offline') {
        // Silently acknowledge — the WiFi indicator already shows offline status
        setSyncError(null)
      } else if (data.status === 'error') {
        setSyncError(data.error)
        toast.error(`Sync failed: ${data.error}`)
      } else {
        setSyncConfigured(true)
        setSyncError(null)
      }
    }

    const updateAvailableHandler = (data) => {
      setUpdateAvailable(true)
      if (data?.version) setUpdateVersion(data.version)
    }
    const updateDownloadedHandler = (data) => {
      setUpdateAvailable(false)
      setUpdateDownloaded(true)
      if (data?.version) setUpdateVersion(data.version)
    }

    if (window.electronAPI) {
      window.electronAPI.on('sync:status', syncHandler)
      window.electronAPI.on('app:update-available', updateAvailableHandler)
      window.electronAPI.on('app:update-downloaded', updateDownloadedHandler)
    }

    // Check initial sync config status
    ipc('sync:get-config').then((config) => {
      if (config) setSyncConfigured(config.configured)
    })
    ipc('meta:get', 'last_sync_time').then(setLastSync)

    // Reminders checking
    const checkReminders = () => {
      ipc('reminders:due').then(reminders => {
        if (reminders) setDueReminders(reminders)
      })
    }
    checkReminders()
    const remindersInterval = setInterval(checkReminders, 60000)

    return () => {
      window.removeEventListener('online', on)
      window.removeEventListener('offline', off)
      clearInterval(remindersInterval)
    }
  }, [])

  async function handleAcknowledgeReminder(id) {
    await ipc('reminders:reset', id)
    setDueReminders(prev => prev.filter(r => r.id !== id))
  }

  async function handleSync() {
    setSyncStatus('syncing')
    setSyncError(null)
    await ipc('sync:run')
  }

  function handleRestart() {
    if (window.electronAPI) {
      window.electronAPI.send('app:restart-and-install')
    }
  }

  function getSyncLabel() {
    if (!syncConfigured) return 'Sync not configured'
    if (syncStatus === 'syncing') return 'Syncing...'
    if (lastSync) return `Last sync: ${formatDateTime(lastSync)}`
    return 'Never synced'
  }

  return (
    <header className="h-14 bg-white border-b border-gray-200 flex items-center justify-between px-6 shrink-0">
      <div className="flex items-center gap-4">
        {syncError && (
          <div className="flex items-center gap-2 px-3 py-1 bg-red-50 text-red-600 rounded-full text-xs font-medium">
            <AlertCircle className="w-3 h-3" /> {syncError}
          </div>
        )}
        {updateAvailable && (
          <div className="flex items-center gap-2 px-3 py-1 bg-blue-50 text-blue-600 rounded-full text-xs font-bold animate-pulse">
            <ArrowUpCircle className="w-3 h-3" /> {updateVersion ? `Update v${updateVersion} available` : 'Update Available'}
          </div>
        )}
        {updateDownloaded && (
          <button 
            onClick={handleRestart}
            className="flex items-center gap-2 px-3 py-1 bg-green-600 text-white rounded-full text-xs font-bold hover:bg-green-700 transition-all shadow-sm"
          >
            <ArrowUpCircle className="w-3 h-3" /> {updateVersion ? `Restart to install v${updateVersion}` : 'Restart to Update'}
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
          {!syncConfigured ? (
            <CloudOff className="w-3.5 h-3.5 text-gray-300" />
          ) : syncStatus === 'syncing' ? (
            <RefreshCw className="w-3.5 h-3.5 text-blue-500 animate-spin" />
          ) : (
            <Clock className="w-3.5 h-3.5 text-gray-400" />
          )}
          <span>{getSyncLabel()}</span>
        </div>

        <button 
          onClick={handleSync}
          disabled={syncStatus === 'syncing' || !isOnline || !syncConfigured}
          className="p-1.5 hover:bg-gray-100 rounded-lg transition-colors disabled:opacity-30"
          title={syncConfigured ? 'Sync Now' : 'Configure sync in Settings'}
        >
          <RefreshCw className={`w-3.5 h-3.5 ${syncStatus === 'syncing' ? 'animate-spin' : ''}`} />
        </button>

        <span className="w-px h-3 bg-gray-200 ml-1 mr-1" />

        <div className="relative" ref={remindersRef}>
          <button
            onClick={() => setShowReminders(!showReminders)}
            className="p-1.5 hover:bg-gray-100 rounded-lg transition-colors relative"
            title="Reminders"
          >
            <Bell className="w-4 h-4 text-gray-500" />
            {dueReminders.length > 0 && (
              <span className="absolute top-1 right-1 w-2 h-2 bg-red-500 rounded-full border border-white"></span>
            )}
          </button>

          {showReminders && (
            <div className="absolute right-0 top-full mt-2 w-80 bg-white border border-gray-200 rounded-2xl shadow-lg z-50 overflow-hidden">
              <div className="px-4 py-3 border-b border-gray-100 bg-gray-50 flex justify-between items-center">
                <h3 className="text-xs font-black text-gray-900 uppercase tracking-widest">Due Reminders</h3>
                <span className="bg-gray-200 text-gray-700 text-[10px] font-bold px-2 py-0.5 rounded-full">{dueReminders.length}</span>
              </div>
              <div className="max-h-80 overflow-y-auto">
                {dueReminders.length === 0 ? (
                  <div className="p-6 text-center text-gray-400 text-xs font-bold uppercase tracking-wider">
                    No pending reminders
                  </div>
                ) : (
                  <div className="divide-y divide-gray-100">
                    {dueReminders.map(r => (
                      <div key={r.id} className="p-4 hover:bg-gray-50 transition-colors">
                        <div className="flex justify-between items-start mb-2">
                          <Link 
                            to={`/customers/${r.customer_id}`} 
                            onClick={() => setShowReminders(false)}
                            className="text-sm font-bold text-gray-900 hover:text-blue-600 transition-colors"
                          >
                            {r.customer_name}
                          </Link>
                          <span className="text-[10px] font-bold uppercase tracking-widest text-orange-500 bg-orange-50 px-2 py-0.5 rounded-full">
                            {r.type === 'forever' ? 'Repeating' : 'One-time'}
                          </span>
                        </div>
                        <p className="text-xs text-gray-500 mb-3">
                          Has not had an entry in over {r.period_days} day{r.period_days !== 1 ? 's' : ''}.
                        </p>
                        <div className="flex justify-end gap-2">
                          <button
                            onClick={() => handleAcknowledgeReminder(r.id)}
                            className="px-3 py-1.5 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-xl text-[10px] font-black uppercase tracking-widest transition-colors"
                          >
                            Acknowledge
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </header>
  )
}

