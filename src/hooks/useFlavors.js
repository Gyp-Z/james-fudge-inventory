import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'

export function useFlavors() {
  const [flavors, setFlavors] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      const { data } = await supabase
        .from('flavors')
        .select('*')
        .eq('active', true)
        .order('name')
      setFlavors(data || [])
      setLoading(false)
    }
    load()
  }, [])

  return { flavors, loading }
}
