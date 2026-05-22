import { Wifi, WifiOff, Clock } from 'lucide-react'

export default function TopBar() {
  return (
    <header className="h-14 bg-white border-b border-gray-200 flex items-center justify-between px-6">
      <div />
      <div className="flex items-center gap-2 text-sm text-gray-500">
        <Wifi className="w-4 h-4 text-green-500" />
        <span>Online</span>
        <span className="mx-2">·</span>
        <Clock className="w-4 h-4" />
        <span>Synced just now</span>
      </div>
    </header>
  )
}
