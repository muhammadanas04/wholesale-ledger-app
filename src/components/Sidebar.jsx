import { useState, useEffect } from 'react'
import { NavLink, useLocation } from 'react-router-dom'
import { 
  LayoutDashboard, 
  Users, 
  Package, 
  ShoppingCart, 
  TrendingUp, 
  Wallet, 
  BookOpen, 
  Settings,
  ChevronLeft,
  ChevronRight,
  Receipt,
  Clock
} from 'lucide-react'
import { ipc } from '../lib/ipc'

const navItems = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/customers', label: 'Customers', icon: Users },
  { to: '/products', label: 'Products', icon: Package },
  { to: '/new-sale', label: 'New Sale', icon: ShoppingCart },
  { to: '/stock-purchase', label: 'Stock Purchase', icon: TrendingUp },
  { to: '/payments', label: 'Payments', icon: Wallet },
  { to: '/ledger', label: 'Ledger', icon: BookOpen },
  { to: '/other-expenses', label: 'Other Expenses', icon: Receipt },
  { to: '/tmp-records', label: 'Tmp Records', icon: Clock },
]

export default function Sidebar() {
  const location = useLocation()
  const [singleProductMode, setSingleProductMode] = useState(false)
  const [isCompact, setIsCompact] = useState(() => {
    return localStorage.getItem('sidebar_compact') === 'true'
  })

  const toggleCompact = () => {
    setIsCompact((prev) => {
      const next = !prev
      localStorage.setItem('sidebar_compact', String(next))
      return next
    })
  }

  useEffect(() => {
    async function checkMode() {
      const val = await ipc('meta:get', 'single_product_mode')
      setSingleProductMode(val === 'true')
    }
    checkMode()
  }, [location.pathname])

  const visibleItems = singleProductMode
    ? navItems.filter((item) => item.to !== '/products')
    : navItems

  return (
    <aside className={`bg-white border-r border-gray-200 flex flex-col flex-shrink-0 transition-all duration-300 ${
      isCompact ? 'w-16' : 'w-64'
    }`}>
      {/* Brand logo & Toggle Button */}
      <div className={`h-14 border-b border-gray-200 flex items-center justify-between flex-shrink-0 ${
        isCompact ? 'px-0 justify-center' : 'px-4'
      }`}>
        {!isCompact && (
          <span className="text-sm font-black text-gray-800 uppercase tracking-widest truncate">Wholesale</span>
        )}
        <button 
          onClick={toggleCompact}
          className="p-1.5 hover:bg-gray-100 rounded-xl text-gray-400 hover:text-gray-600 transition-colors duration-200"
          title={isCompact ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          {isCompact ? <ChevronRight className="w-5 h-5" /> : <ChevronLeft className="w-5 h-5" />}
        </button>
      </div>

      {/* Main Navigation Links */}
      <nav className="flex-1 p-2 space-y-1 overflow-y-auto">
        {visibleItems.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            title={isCompact ? item.label : undefined}
            className={({ isActive }) =>
              `flex items-center rounded-xl text-xs font-black uppercase tracking-wider transition-all duration-200 ${
                isCompact ? 'justify-center p-3 mx-1' : 'gap-3 px-3.5 py-2.5'
              } ${
                isActive 
                  ? 'bg-blue-50 text-blue-700 shadow-sm border-l-2 border-blue-600' 
                  : 'text-gray-500 hover:bg-gray-100 hover:text-gray-800'
              }`
            }
          >
            <item.icon className="w-5 h-5 flex-shrink-0" />
            {!isCompact && <span className="truncate">{item.label}</span>}
          </NavLink>
        ))}
      </nav>

      {/* Settings at the bottom */}
      <div className="p-2 border-t border-gray-200 flex-shrink-0">
        <NavLink
          to="/settings"
          title={isCompact ? 'Settings' : undefined}
          className={({ isActive }) =>
            `flex items-center rounded-xl text-xs font-black uppercase tracking-wider transition-all duration-200 ${
              isCompact ? 'justify-center p-3 mx-1' : 'gap-3 px-3.5 py-2.5'
            } ${
              isActive 
                ? 'bg-blue-50 text-blue-700 shadow-sm border-l-2 border-blue-600' 
                : 'text-gray-500 hover:bg-gray-100 hover:text-gray-800'
            }`
          }
        >
          <Settings className="w-5 h-5 flex-shrink-0" />
          {!isCompact && <span className="truncate">Settings</span>}
        </NavLink>
      </div>
    </aside>
  )
}
