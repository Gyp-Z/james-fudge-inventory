import { useState, useEffect } from 'react'
import { NavLink, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../hooks/useAuth'

const staffTabs = [
  { to: '/', label: '📋', title: 'Dashboard', end: true },
  { to: '/report', label: '📝', title: 'Report' },
]

const adminMainTabs = [
  { to: '/', label: '📋', title: 'Dashboard', end: true },
  { to: '/report', label: '📝', title: 'Report' },
  { to: '/analytics', label: '📊', title: 'Analytics' },
  { to: '/ingredients', label: '🧂', title: 'Ingredients' },
  { to: '/admin', label: '🍬', title: 'Products' },
  { to: '/audit-edit', label: '🛠️', title: 'Fixes' },
]

export default function NavBar() {
  const { session } = useAuth()
  const navigate = useNavigate()
  const [scrolled, setScrolled] = useState(false)

  const tabs = session ? adminMainTabs : staffTabs

  // Subtle shadow under the header once the page scrolls (website behavior).
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 4)
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  async function handleSignOut() {
    await supabase.auth.signOut()
    navigate('/dashboard')
  }

  return (
    <>
      {/* ── Sticky header — cream w/ logo + inline desktop nav ─────────────── */}
      <header
        className={`sticky top-0 z-50 bg-store-cream/90 backdrop-blur-md border-b transition-shadow duration-300 ${
          scrolled ? 'shadow-md border-store-tan' : 'border-store-tan/60'
        }`}
      >
        <div className="max-w-2xl sm:max-w-5xl mx-auto px-4 h-14 flex items-center gap-4">
          <NavLink to="/" className="flex items-center gap-2 group shrink-0">
            <span className="text-2xl transition-transform duration-300 group-hover:-rotate-12 group-hover:scale-110">🍬</span>
            <span
              className="font-bold text-lg tracking-tight text-store-green leading-none"
              style={{ fontFamily: 'var(--font-display)' }}
            >
              James' Fudge
            </span>
          </NavLink>

          {/* Desktop / landscape-tablet inline nav (lg+). Below lg the bottom
              tab bar handles navigation so an iPad in portrait never overflows. */}
          <nav className="hidden lg:flex items-center gap-0.5 ml-2">
            {tabs.map(({ to, label, title, end }) => (
              <NavLink
                key={to}
                to={to}
                end={end}
                className={({ isActive }) =>
                  `nav-underline press px-3 py-2 rounded-lg text-sm font-semibold transition-colors ${
                    isActive
                      ? 'text-store-green is-active bg-store-green/10'
                      : 'text-store-brown-light hover:text-store-green'
                  }`
                }
              >
                <span className="mr-1">{label}</span>{title}
              </NavLink>
            ))}
          </nav>

          <div className="ml-auto shrink-0">
            {session ? (
              <button
                onClick={handleSignOut}
                title="Sign out"
                className="press px-3 py-1.5 rounded-full text-sm font-semibold text-store-brown-light hover:text-store-green hover:bg-store-green/10 transition-colors"
              >
                <span className="lg:hidden">🚪</span>
                <span className="hidden lg:inline">Sign out</span>
              </button>
            ) : (
              <button
                onClick={() => navigate('/login')}
                className="press px-4 py-1.5 rounded-full text-xs font-bold bg-store-green text-white hover:bg-store-green-dark transition-colors shadow-sm"
              >
                Admin
              </button>
            )}
          </div>
        </div>
      </header>

      {/* ── Bottom tab bar — phones + portrait tablets (below lg) ─────────── */}
      <nav className="fixed bottom-0 left-0 right-0 z-50 bg-white/95 backdrop-blur-md border-t border-store-tan shadow-[0_-4px_16px_rgba(42,26,16,0.06)] lg:hidden">
        <div className="max-w-3xl mx-auto" style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}>
        <div className="flex items-stretch">
          {tabs.map(({ to, label, title, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              title={title}
              className={({ isActive }) =>
                `relative flex-1 flex flex-col items-center justify-center py-2 text-[11px] font-semibold transition-colors gap-0.5 press ${
                  isActive ? 'text-store-green' : 'text-store-brown-light'
                }`
              }
            >
              {({ isActive }) => (
                <>
                  {isActive && (
                    <span className="absolute top-0 left-1/2 -translate-x-1/2 h-0.5 w-7 rounded-full bg-store-green animate-fade-in" />
                  )}
                  <span
                    className={`text-xl leading-none transition-transform duration-200 ${
                      isActive ? 'scale-110 -translate-y-0.5' : ''
                    }`}
                  >
                    {label}
                  </span>
                  <span>{title}</span>
                </>
              )}
            </NavLink>
          ))}
        </div>
        </div>
      </nav>
    </>
  )
}
