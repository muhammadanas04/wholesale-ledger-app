import { useState, useEffect } from 'react'
import { ipc } from '../lib/ipc'
import { Settings as SettingsIcon, Save, ShoppingBag } from 'lucide-react'
import { toast } from 'sonner'

export default function Settings() {
  const [loading, setLoading] = useState(true)
  const [config, setConfig] = useState({
    shop_name: '',
    currency_symbol: '₹',
  })

  useEffect(() => {
    async function load() {
      const keys = ['shop_name', 'currency_symbol']
      const newConfig = { ...config }
      for (const key of keys) {
        const val = await ipc('meta:get', key)
        if (val !== null) newConfig[key] = val
      }
      setConfig(newConfig)
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
    </div>
  )
}
