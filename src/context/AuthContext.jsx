import { createContext, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

export const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null)
  const [profile, setProfile] = useState(null)
  const [loading, setLoading] = useState(true)
  const [authError, setAuthError] = useState('')

  useEffect(() => {
    let mounted = true

    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!mounted) return
      setSession(session)
      if (session?.user) {
        supabase
          .from('profiles')
          .select('*')
          .eq('id', session.user.id)
          .maybeSingle()
          .then(({ data }) => {
            if (mounted) setProfile(data)
          })
          .catch((err) => {
            console.error('Failed to fetch profile on init:', err)
            if (mounted) setProfile(null)
          })
      }
      setLoading(false)
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (_event, session) => {
        setSession(session)
        if (session?.user) {
          try {
            const { data } = await supabase
              .from('profiles')
              .select('*')
              .eq('id', session.user.id)
              .maybeSingle()
            setProfile(data)
          } catch (err) {
            console.error('Failed to fetch profile:', err)
            setProfile(null)
          }
        } else {
          setProfile(null)
        }
      }
    )

    return () => {
      mounted = false
      subscription.unsubscribe()
    }
  }, [])

  const signInWithSSO = async () => {
    setAuthError('')

    const { data, error } = await supabase.auth.signInWithSSO({
      domain: 'safaricom.co.ke',
      options: { redirectTo: `${window.location.origin}/auth/callback` },
    })

    if (error) {
      if (error.status === 404 || error.message?.includes('not found') || error.message?.includes('provider')) {
        setAuthError(
          'SSO provider is not configured. The SAML SSO provider for safaricom.co.ke has not been set up in Supabase. ' +
          'Please run: supabase sso add --domain safaricom.co.ke with your IdP metadata.'
        )
      } else if (error.status === 400) {
        setAuthError(
          'SSO configuration error. Please verify the SAML provider is correctly configured in Supabase Dashboard → Authentication → Providers.'
        )
      } else {
        setAuthError(error.message || 'SSO sign-in failed. Please try again or contact your administrator.')
      }
      return { success: false, error: error.message }
    }

    return { success: true, data }
  }

  const signInWithEmail = async (email, password) => {
    setAuthError('')
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) {
      setAuthError(error.message)
      return { success: false, error: error.message }
    }
    return { success: true }
  }

  const signUpWithEmail = async (email, password, fullName) => {
    setAuthError('')
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { full_name: fullName } },
    })
    if (error) {
      setAuthError(error.message)
      return { success: false, error: error.message }
    }
    return { success: true }
  }

  const signOut = async () => {
    await supabase.auth.signOut()
    setAuthError('')
  }

  const clearError = () => setAuthError('')

   const value = {
     session,
     user: session?.user ?? null,
     profile,
     loading,
     authError,
     signInWithSSO,
     signInWithEmail,
     signUpWithEmail,
     signOut,
     clearError,
     isAuthorized: profile?.role === 'engineer' || profile?.role === 'admin',
     isAdmin: profile?.role === 'admin',
   }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
