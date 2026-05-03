import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'

// Hook centralizado — sesión, perfil y rol
export function useAuth() {
  const [session, setSession] = useState(null)
  const [profile, setProfile] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session)
      if (session) fetchProfile(session.user.id)
      else setLoading(false)
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session)
      if (session) fetchProfile(session.user.id)
      else { setProfile(null); setLoading(false) }
    })

    return () => subscription.unsubscribe()
  }, [])

  async function fetchProfile(userId) {
    const { data } = await supabase
      .from('users')
      .select('*, parallels(name)')
      .eq('id', userId)
      .single()
    setProfile(data)
    setLoading(false)
  }

  async function signIn(email, password) {
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    return error
  }

  async function signOut() {
    await supabase.auth.signOut()
  }

  const role             = profile?.role ?? 'padre'
  const isAdmin          = role === 'admin'
  const isAdminParalelo  = role === 'admin_paralelo'
  const isParent         = role === 'padre'
  const canManageAll     = isAdmin
  const canManageParallel = isAdmin || isAdminParalelo

  // Ruta de inicio según rol
  const homeRoute = isAdmin
    ? '/dashboard'
    : isAdminParalelo
    ? '/parallel'
    : '/account'

  return {
    session, profile, loading,
    role, isAdmin, isAdminParalelo, isParent,
    canManageAll, canManageParallel,
    homeRoute,
    signIn, signOut,
  }
}
