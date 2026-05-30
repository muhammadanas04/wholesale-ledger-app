import { useState, useEffect } from 'react'
import { ipc } from '../lib/ipc'
import { Settings as SettingsIcon, Save, ShoppingBag, Cloud, CloudOff, Key, Trash2, CheckCircle } from 'lucide-react'
import { toast } from 'sonner'

export default function Settings() {
  const [loading, setLoading] = useState(true)
  const [config, setConfig] = useState({
    shop_name: '',
    currency_symbol: '₹',
  })

  // Sync config state
  const [syncConfigured, setSyncConfigured] = useState(false)
  const [syncUrl, setSyncUrl] = useState(null)
  const [syncKey, setSyncKey] = useState('')
  const [syncSaving, setSyncSaving] = useState(false)
  const [showDisconnectConfirm, setShowDisconnectConfirm] = useState(false)

  useEffect(() => {
    async function load() {
      const keys = ['shop_name', 'currency_symbol']
      const newConfig = { ...config }
      for (const key of keys) {
        const val = await ipc('meta:get', key)
        if (val !== null) newConfig[key] = val
      }
      setConfig(newConfig)

      // Load sync config
      const syncConfig = await ipc('sync:get-config')
      if (syncConfig) {
        setSyncConfigured(syncConfig.configured)
        setSyncUrl(syncConfig.syncUrl)
      }

      setLoading(false)
    }
    load()
  }, [])

  async function handleSave(e) {
    e.preventDefault()
    setLoading(true)
    try {
      for (const [key, value] of Object.entries(config)) {
        await ipc('meta:set', key, value)
      }
      toast.success('Settings saved successfully')
    } catch (err) {
      toast.error('Failed to save settings')
    } finally {
      setLoading(false)
    }
  }

  async function handleSyncSave(e) {
    e.preventDefault()
    if (!syncKey.trim()) return

    setSyncSaving(true)
    try {
      const result = await ipc('sync:save-config', syncKey.trim())
      if (result) {
        setSyncConfigured(true)
        setSyncUrl(result.syncUrl)
        setSyncKey('')
        toast.success('Sync configured successfully! Syncing now...')
      }
    } catch (err) {
      toast.error('Failed to save sync config')
    } finally {
      setSyncSaving(false)
    }
  }

  async function handleDisconnect() {
    const result = await ipc('sync:clear-config')
    if (result) {
      setSyncConfigured(false)
      setSyncUrl(null)
      setShowDisconnectConfirm(false)
      toast.success('Sync disconnected')
    }
  }

  if (loading && config.shop_name === '') return <div className="p-6 text-gray-400">Loading settings...</div>

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center gap-2">
        <SettingsIcon className="w-6 h-6 text-gray-700" />
        <h1 className="text-2xl font-bold text-gray-800">Settings</h1>
      </div>

      <form onSubmit={handleSave} className="max-w-2xl space-y-6">
        {/* General Settings */}
        <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-100 flex items-center gap-2 font-bold text-gray-800">
            <ShoppingBag className="w-4 h-4 text-blue-500" /> General Info
          </div>
          <div className="p-5 space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Shop Name</label>
              <input
                value={config.shop_name}
                onChange={(e) => setConfig({ ...config, shop_name: e.target.value })}
                placeholder="e.g. Wholesale Traders"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Currency Symbol</label>
              <input
                value={config.currency_symbol}
                onChange={(e) => setConfig({ ...config, currency_symbol: e.target.value })}
                placeholder="e.g. ₹ or $"
                className="w-24 px-3 py-2 border border-gray-300 rounded-lg text-sm"
              />
            </div>
          </div>
        </div>

        <button
          type="submit"
          disabled={loading}
          className="flex items-center justify-center gap-2 px-6 py-3 bg-blue-600 text-white rounded-xl font-bold hover:bg-blue-700 disabled:opacity-50 transition-all w-full md:w-auto"
        >
          <Save className="w-4 h-4" />
          {loading ? 'Saving...' : 'Save Settings'}
        </button>
      </form>

      {/* Cloud Sync */}
      <div className="max-w-2xl">
        <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-100 flex items-center gap-2 font-bold text-gray-800">
            {syncConfigured ? (
              <Cloud className="w-4 h-4 text-green-500" />
            ) : (
              <CloudOff className="w-4 h-4 text-gray-400" />
            )}
            Cloud Sync
          </div>
          <div className="p-5 space-y-4">
            {syncConfigured ? (
              /* ── Connected State ── */
              <div className="space-y-4">
                <div className="flex items-center gap-3 p-3 bg-green-50 border border-green-200 rounded-xl">
                  <CheckCircle className="w-5 h-5 text-green-600 shrink-0" />
                  <div>
                    <p className="text-sm font-semibold text-green-800">Sync Active</p>
                    <p className="text-xs text-green-600 mt-0.5 break-all">{syncUrl}</p>
                  </div>
                </div>

                {showDisconnectConfirm ? (
                  <div className="p-3 bg-red-50 border border-red-200 rounded-xl space-y-3">
                    <p className="text-sm text-red-700">
                      Are you sure? Your local data will remain, but syncing will stop until you reconfigure.
                    </p>
                    <div className="flex gap-2">
                      <button
                        onClick={handleDisconnect}
                        className="px-4 py-2 bg-red-600 text-white text-sm font-bold rounded-lg hover:bg-red-700 transition-colors"
                      >
                        Yes, Disconnect
                      </button>
                      <button
                        onClick={() => setShowDisconnectConfirm(false)}
                        className="px-4 py-2 bg-gray-100 text-gray-700 text-sm font-medium rounded-lg hover:bg-gray-200 transition-colors"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <button
                    onClick={() => setShowDisconnectConfirm(true)}
                    className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                  >
                    <Trash2 className="w-3.5 h-3.5" /> Disconnect Sync
                  </button>
                )}
              </div>
            ) : (
              /* ── Not Configured State ── */
              <form onSubmit={handleSyncSave} className="space-y-4">
                <p className="text-sm text-gray-600">
                  Enter your sync key to enable cloud synchronization across devices.
                </p>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Sync Key</label>
                  <div className="flex gap-2">
                    <div className="relative flex-1">
                      <Key className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                      <input
                        value={syncKey}
                        onChange={(e) => setSyncKey(e.target.value)}
                        placeholder="Paste your sync key here"
                        className="w-full pl-10 pr-3 py-2 border border-gray-300 rounded-lg text-sm font-mono"
                        spellCheck={false}
                      />
                    </div>
                    <button
                      type="submit"
                      disabled={syncSaving || !syncKey.trim()}
                      className="px-5 py-2 bg-blue-600 text-white text-sm font-bold rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-all shrink-0"
                    >
                      {syncSaving ? 'Activating...' : 'Activate'}
                    </button>
                  </div>
                </div>
                <p className="text-xs text-gray-400">
                  Your sync key is provided by your administrator. It connects this device to your shared cloud database.
                </p>
              </form>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

