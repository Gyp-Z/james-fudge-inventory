import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { useAuth } from './hooks/useAuth'
import Login from './pages/Login'
import Dashboard from './pages/Dashboard'
import ShiftReport from './pages/ShiftReport'
import BatchLog from './pages/BatchLog'
import Analytics from './pages/Analytics'
import Admin from './pages/Admin'
import Ingredients from './pages/Ingredients'
import Summary from './pages/Summary'
import NavBar from './components/NavBar'

function AdminRoute({ children }) {
  const { session, loading } = useAuth()
  if (loading) return <div className="flex items-center justify-center h-screen text-store-brown-light">Loading...</div>
  if (!session) return <Navigate to="/login" replace />
  return children
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route
          path="/*"
          element={
            <div className="min-h-screen bg-store-cream flex flex-col">
              <NavBar />
              <main className="flex-1 px-4 py-6 pb-24 sm:pb-6 max-w-2xl mx-auto w-full">
                <Routes>
                  <Route path="/" element={<Navigate to="/dashboard" replace />} />
                  <Route path="/dashboard" element={<Dashboard />} />
                  <Route path="/shift" element={<ShiftReport />} />
                  <Route path="/batch" element={<BatchLog />} />
                  <Route path="/ingredients" element={<Ingredients />} />
                  <Route path="/analytics" element={<AdminRoute><Analytics /></AdminRoute>} />
                  <Route path="/summary" element={<Summary />} />
                  <Route path="/admin" element={<AdminRoute><Admin /></AdminRoute>} />
                </Routes>
              </main>
            </div>
          }
        />
      </Routes>
    </BrowserRouter>
  )
}
