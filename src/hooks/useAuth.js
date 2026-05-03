import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'

export function useAuth() {
  const [session,       setSession]       = useState(null)
  const [profile,       setProfile]       = useState(null)
  const [linkedStudent, setLinkedStudent] = useState(null) // estudiante vinculado al usuario
  const [loading,       setLoading]       = useState(true)

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session)
      if (session) fetchProfile(session.user.id)
      else setLoading(false)
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session)
      if (session) fetchProfile(session.user.id)
      else { setProfile(null); setLinkedStudent(null); setLoading(false) }
    })

    return () => subscription.unsubscribe()
  }, [])

  async function fetchProfile(userId) {
    const [{ data: prof }, { data: student }] = await Promise.all([
      supabase
        .from('users')
        .select('*, parallels(name)')
        .eq('id', userId)
        .single(),
      supabase
        .from('students')
        .select('id, full_name')
        .eq('user_id', userId)
        .maybeSingle(),
    ])
    setProfile(prof)
    setLinkedStudent(student ?? null)
    setLoading(false)
  }

  async function signIn(email, password) {
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    return error
  }

  async function signOut() {
    await supabase.auth.signOut()
  }

  const role            = profile?.role ?? 'padre'
  const isAdmin         = role === 'admin'
  const isAdminParalelo = role === 'admin_paralelo'
  const isParent        = role === 'padre'
  const canManageAll    = isAdmin
  const canManageParallel = isAdmin || isAdminParalelo

  // Admin con estudiante vinculado también puede ver su cuenta
  const hasLinkedStudent = !!linkedStudent

  const homeRoute = isAdmin
    ? '/dashboard'
    : isAdminParalelo
    ? '/parallel'
    : '/account'

  return {
    session, profile, linkedStudent, loading,
    role, isAdmin, isAdminParalelo, isParent,
    canManageAll, canManageParallel, hasLinkedStudent,
    homeRoute,
    signIn, signOut,
  }
}
