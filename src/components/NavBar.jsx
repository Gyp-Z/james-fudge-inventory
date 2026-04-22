import { NavLink, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../hooks/useAuth'

const staffTabs = [
  { to: '/dashboard', label: '🏠', title: 'Dashboard' },
  { to: '/batch', label: '🍫', title: 'Batch' },
  { to: '/shift', label: '📋', title: 'Shift' },
  { to: '/ingredients', label: '🧂', title: 'Ingredients' },
  { to: '/analytics', label: '📊', title: 'Analytics' },
]

const adminTabs = [
  { to: '/dashboard', label: '🏠', title: 'Dashboard' },
  { to: '/batch', label: '🍫', title: 'Batch' },
  { to: '/shift', label: '📋', title: 'Shift' },
  { to: '/ingredients', label: '🧂', title: 'Ingredients' },
  { to: '/analytics', label: '📊', title: 'Analytics' },
  { to: '/admin', label: '⚙️', title: 'Admin' },
]

export default function NavBar() {
  const { session } = useAuth()
  const navigate = useNavigate()
  const tabs = session ? adminTabs : staffTabs

  async function handleSignOut() {
    await supabase.auth.signOut()
    navigate('/dashboard')
  }

  return (
    <>
      {/* Top bar — logo + auth button */}
      <nav className="bg-store-green text-white px-4 py-3 flex items-center justify-between shadow-md">
        <span className="font-bold text-lg tracking-tight" style={{ fontFamily: 'var(--font-display)' }}>
          🍬 James' Fudge
        </span>
        {session ? (
          <button
            onClick={handleSignOut}
            title="Sign out"
            className="px-3 py-1.5 rounded-lg text-sm font-medium hover:bg-store-green-dark transition-colors"
          >
            🚪
          </button>
        ) : (
          <button
            onClick={() => navigate('/login')}
            className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-white text-store-green hover:bg-store-tan transition-colors"
          >
            Admin
          </button>
        )}
      </nav>

      {/* Bottom tab bar — mobile only */}
      <nav className="fixed bottom-0 left-0 right-0 z-50 bg-white border-t border-store-tan shadow-lg sm:hidden">
        <div className="flex items-stretch">
          {tabs.map(({ to, label, title }) => (
            <NavLink
              key={to}
              to={to}
              title={title}
              className={({ isActive }) =>
                `flex-1 flex flex-col items-center justify-center py-2 text-xs font-medium transition-colors gap-0.5 ${
                  isActive ? 'text-store-green' : 'text-store-brown-light'
                }`
              }
            >
              <span className="text-lg leading-none">{label}</span>
              <span>{title}</span>
            </NavLink>
          ))}
        </div>
      </nav>

      {/* Desktop nav — hidden on mobile */}
      <nav className="hidden sm:flex bg-store-green text-white px-4 py-2 items-center gap-1 shadow-sm">
        {tabs.map(({ to, label, title }) => (
          <NavLink
            key={to}
            to={to}
            title={title}
            className={({ isActive }) =>
              `px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                isActive ? 'bg-store-green-dark' : 'hover:bg-store-green-dark'
              }`
            }
          >
            {label} {title}
          </NavLink>
        ))}
      </nav>
    </>
  )
}
