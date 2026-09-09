import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'

export function useFlavors() {
  const [flavors, setFlavors] = useState([])
  const [loading, setLoading] = useState(true)

  async function load() {
    const { data } = await supabase
      .from('flavors')
      .select('*')
      .eq('is_active', true)
      .order('name')
    setFlavors(data || [])
    setLoading(false)
  }

  useEffect(() => {
    async function init() { await load() }
    init()
  }, [])

  // Exposed so a caller that just wrote to flavors (e.g. the wind-down threshold sync) can
  // pull the fresh row back in, instead of the page keeping whatever it fetched before the
  // write and only catching up on the next full reload.
  return { flavors, loading, reload: load }
}
