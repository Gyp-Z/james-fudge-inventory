import { NavLink, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../hooks/useAuth'

const staffLinks = [
  { to: '/dashboard', label: '🏠', title: 'Dashboard' },
  { to: '/shift', label: '📋', title: 'Shift Report' },
  { to: '/batch', label: '🍫', title: 'Batch Log' },
  { to: '/ingredients', label: '🧂', title: 'Ingredients' },
  { to: '/analytics', label: '📊', title: 'Analytics' },
  { to: '/summary', label: '📝', title: 'Summary' },
]

const adminLinks = [
  { to: '/dashboard', label: '🏠', title: 'Dashboard' },
  { to: '/shift', label: '📋', title: 'Shift Report' },
  { to: '/batch', label: '🍫', title: 'Batch Log' },
  { to: '/ingredients', label: '🧂', title: 'Ingredients' },
  { to: '/analytics', label: '📊', title: 'Analytics' },
  { to: '/summary', label: '📝', title: 'Summary' },
  { to: '/admin', label: '⚙️', title: 'Admin' },
]

export default function NavBar() {
  const { session } = useAuth()
  const navigate = useNavigate()
  const links = session ? adminLinks : staffLinks

  async function handleSignOut() {
    await supabase.auth.signOut()
    navigate('/dashboard')
  }

  return (
    <nav className="bg-store-green text-white px-4 py-3 flex items-center justify-between shadow-md">
      <span className="font-bold text-lg tracking-tight" style={{ fontFamily: 'var(--font-display)' }}>
        🍬 James' Fudge
      </span>
      <div className="flex items-center gap-1">
        {links.map(({ to, label, title }) => (
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
            {label}
          </NavLink>
        ))}
        {session ? (
          <button
            onClick={handleSignOut}
            title="Sign out"
            className="ml-2 px-3 py-1.5 rounded-lg text-sm font-medium hover:bg-store-green-dark transition-colors"
          >
            🚪
          </button>
        ) : (
          <button
            onClick={() => navigate('/login')}
            className="ml-2 px-3 py-1.5 rounded-lg text-xs font-semibold bg-white text-store-green hover:bg-store-tan transition-colors"
          >
            Admin
          </button>
        )}
      </div>
    </nav>
  )
}
