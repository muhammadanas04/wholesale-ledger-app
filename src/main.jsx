import React, { useEffect, useState } from 'react'
import ReactDOM from 'react-dom/client'
import { HashRouter, Routes, Route, useNavigate, useLocation } from 'react-router-dom'
import { Toaster } from 'sonner'
import './index.css'
import Sidebar from './components/Sidebar'
import TopBar from './components/TopBar'
import Dashboard from './pages/Dashboard'
import Customers from './pages/Customers'
import CustomerDetail from './pages/CustomerDetail'
import Products from './pages/Products'
import NewSale from './pages/NewSale'
import StockPurchase from './pages/StockPurchase'
import Payments from './pages/Payments'
import Ledger from './pages/Ledger'
import Settings from './pages/Settings'
import { ipc } from './lib/ipc'

function App() {
  const navigate = useNavigate()

  useEffect(() => {
    async function loadLayoutSize() {
      const size = await ipc('meta:get', 'layout_size')
      const sizeMap = {
        normal: '16px',
        large: '18px',
        xl: '20px'
      }
      document.documentElement.style.fontSize = sizeMap[size] || '16px'
    }
    loadLayoutSize()
  }, [])

  const location = useLocation()
  const [singleProductMode, setSingleProductMode] = useState(false)

  useEffect(() => {
    async function checkMode() {
      const val = await ipc('meta:get', 'single_product_mode')
      setSingleProductMode(val === 'true')
    }
    checkMode()
  }, [location.pathname])

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.altKey) {
        switch (e.key.toLowerCase()) {
          case 'd': navigate('/'); break
          case 'c': navigate('/customers'); break
          case 'p': 
            if (!singleProductMode) navigate('/products')
            break
          case 'n': navigate('/new-sale'); break
          case 't': navigate('/stock-purchase'); break
          case 'w': navigate('/payments'); break
          case 'l': navigate('/ledger'); break
          case 'r': navigate('/'); break
          case 's': navigate('/settings'); break
        }
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [navigate, singleProductMode])

  return (
    <div className="flex h-screen bg-gray-50">
      <Toaster position="top-right" richColors />
      <Sidebar />
      <div className="flex-1 flex flex-col overflow-hidden">
        <TopBar />
        <main className="flex-1 overflow-auto">
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/customers" element={<Customers />} />
            <Route path="/customers/:id" element={<CustomerDetail />} />
            <Route path="/products" element={<Products />} />
            <Route path="/new-sale" element={<NewSale />} />
            <Route path="/sales/edit/:id" element={<NewSale />} />
            <Route path="/stock-purchase" element={<StockPurchase />} />
            <Route path="/payments" element={<Payments />} />
            <Route path="/ledger" element={<Ledger />} />
            <Route path="/settings" element={<Settings />} />
          </Routes>
        </main>
      </div>
    </div>
  )
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <HashRouter>
      <App />
    </HashRouter>
  </React.StrictMode>
)
