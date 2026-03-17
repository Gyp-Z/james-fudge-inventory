import { NavLink } from 'react-router-dom'
import { supabase } from '../lib/supabase'

const links = [
  { to: '/dashboard', label: '🏠', title: 'Dashboard' },
  { to: '/shift', label: '📋', title: 'Shift Report' },
  { to: '/batch', label: '🍫', title: 'Batch Log' },
  { to: '/analytics', label: '📊', title: 'Analytics' },
  { to: '/admin', label: '⚙️', title: 'Admin' },
]

export default function NavBar() {
  async function handleSignOut() {
    await supabase.auth.signOut()
  }

  return (
    <nav className="bg-amber-800 text-white px-4 py-3 flex items-center justify-between shadow-md">
      <span className="font-bold text-lg tracking-tight">🍬 James' Fudge</span>
      <div className="flex items-center gap-1">
        {links.map(({ to, label, title }) => (
          <NavLink
            key={to}
            to={to}
            title={title}
            className={({ isActive }) =>
              `px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                isActive ? 'bg-amber-600' : 'hover:bg-amber-700'
              }`
            }
          >
            {label}
          </NavLink>
        ))}
        <button
          onClick={handleSignOut}
          title="Sign out"
          className="ml-2 px-3 py-1.5 rounded-lg text-sm font-medium hover:bg-amber-700 transition-colors"
        >
          🚪
        </button>
      </div>
    </nav>
  )
}
