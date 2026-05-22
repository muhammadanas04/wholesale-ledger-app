const api = window.electronAPI

export async function ipc(channel, ...args) {
  if (api) return api.invoke(channel, ...args)
  console.warn(`electronAPI not available — mock for "${channel}"`, ...args)
  return null
}
