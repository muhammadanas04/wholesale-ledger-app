import { toast } from 'sonner'

const api = window.electronAPI

export async function ipc(channel, ...args) {
  if (!api) {
    console.warn(`electronAPI not available — mock for "${channel}"`, ...args)
    return null
  }

  try {
    const result = await api.invoke(channel, ...args)
    
    // Handle standardized result format: { success, data, error }
    if (result && typeof result === 'object' && 'success' in result) {
      if (result.success) {
        return result.data
      } else {
        toast.error(result.error || 'An operation failed')
        return null
      }
    }

    // Fallback for legacy handlers that return data directly
    return result
  } catch (err) {
    toast.error(err.message || 'A system error occurred')
    console.error(`IPC Error [${channel}]:`, err)
    return null
  }
}
