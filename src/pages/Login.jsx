import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'

export default function Login() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const navigate = useNavigate()

  async function handleSubmit(e) {
    e.preventDefault()
    setLoading(true)
    setError('')

    const { error } = await supabase.auth.signInWithPassword({ email, password })

    if (error) {
      setError('Incorrect email or password.')
      setLoading(false)
    } else {
      navigate('/dashboard')
    }
  }

  return (
    <div className="min-h-screen bg-store-cream flex flex-col items-center justify-center px-4">
      <div className="w-full max-w-sm mb-6 text-center">
        <div
          className="text-4xl font-bold text-white bg-store-green rounded-2xl py-5 px-6 shadow-lg mb-1"
          style={{ fontFamily: 'var(--font-display)' }}
        >
          James' Fudge
        </div>
        <div className="bg-store-tan rounded-xl py-2 px-4 text-store-brown-light text-sm font-medium tracking-wide">
          Kitchen & Inventory Management
        </div>
      </div>

      <div className="bg-white rounded-2xl shadow-md border border-store-tan p-8 w-full max-w-sm">
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-store-brown mb-1">Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="w-full border border-store-tan rounded-xl px-4 py-3 text-base focus:outline-none focus:ring-2 focus:ring-store-green bg-store-cream"
              placeholder="store@jamesfudge.com"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-store-brown mb-1">Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              className="w-full border border-store-tan rounded-xl px-4 py-3 text-base focus:outline-none focus:ring-2 focus:ring-store-green bg-store-cream"
              placeholder="••••••••"
            />
          </div>

          {error && <p className="text-red-600 text-sm">{error}</p>}

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-store-green hover:bg-store-green-dark text-white font-semibold py-3 rounded-xl transition-colors disabled:opacity-50 text-base"
          >
            {loading ? 'Signing in...' : 'Sign In'}
          </button>
        </form>
      </div>

      <p className="mt-6 text-store-brown-light text-xs">Sea Isle City, NJ</p>
    </div>
  )
}
