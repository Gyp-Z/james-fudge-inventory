import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom'
import { useAuth } from './hooks/useAuth'
import Login from './pages/Login'
import Dashboard from './pages/Dashboard'
import ShiftReport from './pages/ShiftReport'
import Analytics from './pages/Analytics'
import Admin from './pages/Admin'
import Ingredients from './pages/Ingredients'
import AuditEdit from './pages/AuditEdit'
import NavBar from './components/NavBar'
import JarvisWidget from './components/JarvisWidget'

function AdminRoute({ children }) {
  const { session, loading } = useAuth()
  if (loading) return <div className="flex items-center justify-center h-screen text-store-brown-light">Loading...</div>
  if (!session) return <Navigate to="/" replace />
  return children
}

// Re-mounts on every route change (keyed by pathname) so each page plays a
// gentle fade-up entrance instead of snapping in.
function AnimatedRoutes() {
  const location = useLocation()
  return (
    <main className="flex-1 px-4 py-6 pb-28 md:pb-8 max-w-2xl mx-auto w-full">
      <div key={location.pathname} className="animate-fade-in-up">
        <Routes location={location}>
          <Route path="/" element={<Dashboard />} />
          <Route path="/dashboard" element={<Navigate to="/" replace />} />
          <Route path="/report" element={<ShiftReport />} />
          <Route path="/ingredients" element={<AdminRoute><Ingredients /></AdminRoute>} />
          <Route path="/analytics" element={<AdminRoute><Analytics /></AdminRoute>} />
          <Route path="/admin" element={<AdminRoute><Admin /></AdminRoute>} />
          <Route path="/audit-edit" element={<AdminRoute><AuditEdit /></AdminRoute>} />
        </Routes>
      </div>
    </main>
  )
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
              <AnimatedRoutes />
              <JarvisWidget />
            </div>
          }
        />
      </Routes>
    </BrowserRouter>
  )
}
