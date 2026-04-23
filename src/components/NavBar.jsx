import { useState, useRef, useEffect } from 'react'
import { NavLink, useNavigate, useLocation } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../hooks/useAuth'

const staffTabs = [
  { to: '/', label: '📋', title: 'Dashboard', end: true },
  { to: '/report', label: '📝', title: 'Report' },
  { to: '/ingredients', label: '🧂', title: 'Ingredients' },
]

const adminMainTabs = [
  { to: '/', label: '📋', title: 'Dashboard', end: true },
  { to: '/report', label: '📝', title: 'Report' },
  { to: '/analytics', label: '📊', title: 'Analytics' },
  { to: '/ingredients', label: '🧂', title: 'Ingredients' },
]

const moreItems = [
  { to: '/admin', label: '🍬', title: 'Products' },
]

export default function NavBar() {
  const { session } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [moreOpen, setMoreOpen] = useState(false)
  const moreRef = useRef(null)

  const tabs = session ? adminMainTabs : staffTabs
  const isMoreActive = session && moreItems.some(item => location.pathname === item.to)

  useEffect(() => {
    function handleClickOutside(e) {
      if (moreRef.current && !moreRef.current.contains(e.target)) {
        setMoreOpen(false)
      }
    }
    if (moreOpen) document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [moreOpen])

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
        {/* More drawer — slides up above tab bar */}
        {session && moreOpen && (
          <div ref={moreRef} className="absolute bottom-full left-0 right-0 bg-white border-t border-store-tan shadow-lg">
            {moreItems.map(({ to, label, title }) => (
              <NavLink
                key={to}
                to={to}
                onClick={() => setMoreOpen(false)}
                className={({ isActive }) =>
                  `flex items-center gap-3 px-5 py-3 text-sm font-medium border-b border-store-tan last:border-b-0 transition-colors ${isActive
                    ? 'text-store-green bg-store-green-light'
                    : 'text-store-brown hover:bg-store-cream'
                  }`
                }
              >
                <span className="text-lg">{label}</span>
                <span>{title}</span>
              </NavLink>
            ))}
          </div>
        )}

        <div className="flex items-stretch">
          {tabs.map(({ to, label, title, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              title={title}
              className={({ isActive }) =>
                `flex-1 flex flex-col items-center justify-center py-2 text-xs font-medium transition-colors gap-0.5 ${isActive ? 'text-store-green' : 'text-store-brown-light'
                }`
              }
            >
              <span className="text-lg leading-none">{label}</span>
              <span>{title}</span>
            </NavLink>
          ))}
          {session && (
            <button
              onClick={() => setMoreOpen(prev => !prev)}
              title="More"
              className={`flex-1 flex flex-col items-center justify-center py-2 text-xs font-medium transition-colors gap-0.5 ${isMoreActive || moreOpen ? 'text-store-green' : 'text-store-brown-light'
                }`}
            >
              <span className="text-lg leading-none">⋯</span>
              <span>More</span>
            </button>
          )}
        </div>
      </nav>

      {/* Desktop nav — hidden on mobile, shows all links inline */}
      <nav className="hidden sm:flex bg-store-green text-white px-4 py-2 items-center gap-1 shadow-sm">
        {tabs.map(({ to, label, title, end }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            className={({ isActive }) =>
              `px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${isActive ? 'bg-store-green-dark' : 'hover:bg-store-green-dark'
              }`
            }
          >
            {label} {title}
          </NavLink>
        ))}
        {session && moreItems.map(({ to, label, title }) => (
          <NavLink
            key={to}
            to={to}
            className={({ isActive }) =>
              `px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${isActive ? 'bg-store-green-dark' : 'hover:bg-store-green-dark'
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
