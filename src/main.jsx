import React, { useEffect } from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter, Routes, Route, useNavigate } from 'react-router-dom'
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
import Reports from './pages/Reports'
import Settings from './pages/Settings'

function App() {
  const navigate = useNavigate()

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.ctrlKey || e.metaKey) {
        switch (e.key.toLowerCase()) {
          case 'd': navigate('/'); break
          case 'c': navigate('/customers'); break
          case 'p': navigate('/products'); break
          case 'n': navigate('/new-sale'); break
          case 't': navigate('/stock-purchase'); break
          case 'w': navigate('/payments'); break
          case 'r': navigate('/reports'); break
          case 's': navigate('/settings'); break
        }
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [navigate])

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
            <Route path="/stock-purchase" element={<StockPurchase />} />
            <Route path="/payments" element={<Payments />} />
            <Route path="/reports" element={<Reports />} />
            <Route path="/settings" element={<Settings />} />
          </Routes>
        </main>
      </div>
    </div>
  )
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </React.StrictMode>
)
