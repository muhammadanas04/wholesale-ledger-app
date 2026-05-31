import { useState, useEffect } from 'react'
import { ipc } from '../lib/ipc'
import { Settings as SettingsIcon, Save, ShoppingBag, Cloud, CloudOff, Key, Trash2, CheckCircle, Coins, Percent } from 'lucide-react'
import { toast } from 'sonner'

export default function Settings() {
  const [loading, setLoading] = useState(true)
  const [config, setConfig] = useState({
    shop_name: '',
    shop_address: '',
    shop_phone: '',
    currency_symbol: '₹',
    layout_size: 'normal',
    gst_enabled: 'false',
    gst_number: '',
    gst_percentage: '18',
    gst_type: 'exclusive',
    single_product_mode: 'false',
  })

  // Rounding Rules State
  const [roundingConfig, setRoundingConfig] = useState({
    enabled: false,
    ceil: { from: '', to: '' },
    floor: { from: '', to: '' }
  })

  // Sync config state
  const [syncConfigured, setSyncConfigured] = useState(false)
  const [syncUrl, setSyncUrl] = useState(null)
  const [syncKey, setSyncKey] = useState('')
  const [syncSaving, setSyncSaving] = useState(false)
  const [showDisconnectConfirm, setShowDisconnectConfirm] = useState(false)

  useEffect(() => {
    async function load() {
      const keys = [
        'shop_name',
        'shop_address',
        'shop_phone',
        'currency_symbol',
        'layout_size',
        'gst_enabled',
        'gst_number',
        'gst_percentage',
        'gst_type',
        'single_product_mode'
      ]
      const newConfig = {
        shop_name: '',
        shop_address: '',
        shop_phone: '',
        currency_symbol: '₹',
        layout_size: 'normal',
        gst_enabled: 'false',
        gst_number: '',
        gst_percentage: '18',
        gst_type: 'exclusive',
        single_product_mode: 'false'
      }
      for (const key of keys) {
        const val = await ipc('meta:get', key)
        if (val !== null) newConfig[key] = val
      }
      setConfig(newConfig)

      // Load rounding rules
      const rulesVal = await ipc('meta:get', 'rounding_rules')
      if (rulesVal) {
        try {
          const parsed = JSON.parse(rulesVal)
          if (parsed && typeof parsed === 'object') {
            setRoundingConfig({
              enabled: !!parsed.enabled,
              ceil: parsed.ceil || { from: '', to: '' },
              floor: parsed.floor || { from: '', to: '' }
            })
          }
        } catch (e) {
          console.error('Failed to parse rounding rules:', e)
        }
      }

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

      // Save rounding rules
      await ipc('meta:set', 'rounding_rules', JSON.stringify(roundingConfig))
      await ipc('meta:set', 'rounding_rules_updated_at', new Date().toISOString())

      // Instantly apply dynamic layout scaling
      const sizeMap = {
        normal: '16px',
        large: '18px',
        xl: '20px'
      }
      document.documentElement.style.fontSize = sizeMap[config.layout_size] || '16px'

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
              <label className="block text-sm font-medium text-gray-700 mb-1">Shop Address</label>
              <textarea
                value={config.shop_address}
                onChange={(e) => setConfig({ ...config, shop_address: e.target.value })}
                placeholder="e.g. 123 Main Street, Business Plaza"
                rows={2}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Shop Mobile / Phone</label>
              <input
                value={config.shop_phone}
                onChange={(e) => setConfig({ ...config, shop_phone: e.target.value })}
                placeholder="e.g. +91 98765 43210"
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

        {/* GST Configuration */}
        <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden shadow-sm">
          <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
            <div className="flex items-center gap-2 font-bold text-gray-800">
              <Percent className="w-4 h-4 text-emerald-500" /> GST Configuration
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={config.gst_enabled === 'true'}
                onChange={(e) => setConfig({ ...config, gst_enabled: e.target.checked ? 'true' : 'false' })}
                className="sr-only peer"
              />
              <div className="w-9 h-5 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-blue-600"></div>
            </label>
          </div>
          <div className={`p-5 space-y-4 transition-opacity ${config.gst_enabled === 'true' ? 'opacity-100' : 'opacity-40 pointer-events-none'}`}>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">GST Number</label>
                <input
                  value={config.gst_number || ''}
                  onChange={(e) => setConfig({ ...config, gst_number: e.target.value.toUpperCase() })}
                  placeholder="e.g. 22AAAAA1111A1Z1"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm uppercase"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">GST Rate (%)</label>
                <input
                  type="number"
                  min={0}
                  max={100}
                  value={config.gst_percentage || ''}
                  onChange={(e) => setConfig({ ...config, gst_percentage: e.target.value })}
                  placeholder="e.g. 18"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                />
              </div>
            </div>

            <div className="pt-3 space-y-2">
              <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider">GST Calculation Method</label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <label className={`flex items-center gap-3 p-3.5 border rounded-xl cursor-pointer transition-all duration-200 ${config.gst_type === 'exclusive'
                    ? 'border-blue-600 bg-blue-50/50 text-blue-700'
                    : 'border-gray-200 hover:bg-gray-50 text-gray-600'
                  }`}>
                  <input
                    type="radio"
                    name="gst_type"
                    value="exclusive"
                    checked={config.gst_type === 'exclusive'}
                    onChange={(e) => setConfig({ ...config, gst_type: e.target.value })}
                    className="h-4 w-4 text-blue-600 border-gray-300 focus:ring-blue-500"
                  />
                  <div>
                    <p className="text-sm font-bold">Exclusive GST</p>
                    <p className="text-[10px] opacity-75 font-semibold mt-0.5">Add GST over the total items price</p>
                  </div>
                </label>

                <label className={`flex items-center gap-3 p-3.5 border rounded-xl cursor-pointer transition-all duration-200 ${config.gst_type === 'inclusive'
                    ? 'border-blue-600 bg-blue-50/50 text-blue-700'
                    : 'border-gray-200 hover:bg-gray-50 text-gray-600'
                  }`}>
                  <input
                    type="radio"
                    name="gst_type"
                    value="inclusive"
                    checked={config.gst_type === 'inclusive'}
                    onChange={(e) => setConfig({ ...config, gst_type: e.target.value })}
                    className="h-4 w-4 text-blue-600 border-gray-300 focus:ring-blue-500"
                  />
                  <div>
                    <p className="text-sm font-bold">Inclusive GST</p>
                    <p className="text-[10px] opacity-75 font-semibold mt-0.5">GST is already adjusted inside the total price</p>
                  </div>
                </label>
              </div>
            </div>
          </div>
        </div>

        {/* Layout Preferences */}
        <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden shadow-sm">
          <div className="px-5 py-4 border-b border-gray-100 flex items-center gap-2 font-bold text-gray-800">
            <SettingsIcon className="w-4 h-4 text-violet-500" /> Layout Preferences
          </div>
          <div className="p-5 space-y-4">
            <div className="space-y-3">
              <div>
                <p className="text-sm font-bold text-gray-800">Application Layout Scale (Overall Size)</p>
                <p className="text-[10px] text-gray-400 font-bold uppercase mt-0.5">Adjust the overall font and spacing scale of the application interface:</p>
              </div>
              <div className="flex items-center gap-3">
                {['normal', 'large', 'xl'].map((sz) => (
                  <button
                    key={sz}
                    type="button"
                    onClick={() => setConfig({ ...config, layout_size: sz })}
                    className={`flex-1 py-3 px-4 border rounded-xl text-xs font-black uppercase tracking-wider transition-all duration-200 ${config.layout_size === sz
                        ? 'border-blue-600 bg-blue-50 text-blue-700 font-black shadow-sm'
                        : 'border-gray-200 hover:bg-gray-50 text-gray-500 hover:text-gray-800'
                      }`}
                  >
                    {sz === 'normal' ? 'Normal (100%)' : sz === 'large' ? 'Large (112%)' : 'Extra Large (125%)'}
                  </button>
                ))}
              </div>
            </div>

            <div className="pt-4 border-t border-gray-100 flex items-center justify-between">
              <div>
                <p className="text-sm font-bold text-gray-800">Single Product Mode</p>
                <p className="text-[10px] text-gray-400 font-bold uppercase mt-0.5">Hide the Products tab and auto-select the first product for all sales/purchases</p>
              </div>
              <label className="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={config.single_product_mode === 'true'}
                  onChange={(e) => setConfig({ ...config, single_product_mode: e.target.checked ? 'true' : 'false' })}
                  className="sr-only peer"
                />
                <div className="w-9 h-5 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-blue-600"></div>
              </label>
            </div>
          </div>
        </div>

        {/* Rounding & Discount Rules */}
        <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden shadow-sm">
          <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
            <div className="flex items-center gap-2 font-bold text-gray-800">
              <Coins className="w-4 h-4 text-amber-500" /> Rounding & Discount Rules
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={roundingConfig.enabled}
                onChange={(e) => setRoundingConfig({ ...roundingConfig, enabled: e.target.checked })}
                className="sr-only peer"
              />
              <div className="w-9 h-5 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-blue-600"></div>
            </label>
          </div>
          <div className={`p-5 space-y-4 transition-opacity ${roundingConfig.enabled ? 'opacity-100' : 'opacity-40 pointer-events-none'}`}>

            {/* Ceil Rule */}
            <div className="p-4 border border-emerald-100 bg-emerald-50/30 rounded-xl space-y-3">
              <div className="flex items-center gap-2">
                <span className="inline-flex items-center px-2 py-0.5 rounded-full font-bold text-[10px] uppercase tracking-wider bg-emerald-100 text-emerald-700 border border-emerald-200">Floor</span>
                <span className="text-xs text-gray-500">Round down — drops matched digits to 0</span>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-wider">From</label>
                  <input
                    type="number"
                    step="any"
                    min={0}
                    placeholder="e.g. 0"
                    value={roundingConfig.ceil.from}
                    onChange={(e) => setRoundingConfig({ ...roundingConfig, ceil: { ...roundingConfig.ceil, from: e.target.value } })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white"
                  />
                </div>
                <div className="space-y-1">
                  <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-wider">To</label>
                  <input
                    type="number"
                    step="any"
                    min={0}
                    placeholder="e.g. 5"
                    value={roundingConfig.ceil.to}
                    onChange={(e) => setRoundingConfig({ ...roundingConfig, ceil: { ...roundingConfig.ceil, to: e.target.value } })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white"
                  />
                </div>
              </div>
            </div>

            {/* Floor Rule */}
            <div className="p-4 border border-blue-100 bg-blue-50/30 rounded-xl space-y-3">
              <div className="flex items-center gap-2">
                <span className="inline-flex items-center px-2 py-0.5 rounded-full font-bold text-[10px] uppercase tracking-wider bg-blue-100 text-blue-700 border border-blue-200">Ceil</span>
                <span className="text-xs text-gray-500">Round up — drops matched digits to 0, adds carry</span>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-wider">From</label>
                  <input
                    type="number"
                    step="any"
                    min={0}
                    placeholder="e.g. 6"
                    value={roundingConfig.floor.from}
                    onChange={(e) => setRoundingConfig({ ...roundingConfig, floor: { ...roundingConfig.floor, from: e.target.value } })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white"
                  />
                </div>
                <div className="space-y-1">
                  <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-wider">To</label>
                  <input
                    type="number"
                    step="any"
                    min={0}
                    placeholder="e.g. 9"
                    value={roundingConfig.floor.to}
                    onChange={(e) => setRoundingConfig({ ...roundingConfig, floor: { ...roundingConfig.floor, to: e.target.value } })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white"
                  />
                </div>
              </div>
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

