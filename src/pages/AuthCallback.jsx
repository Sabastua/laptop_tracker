import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'

export default function AuthCallback() {
  const navigate = useNavigate()
  const [error, setError] = useState('')

  useEffect(() => {
    const handleCallback = async () => {
      try {
        const { error } = await supabase.auth.getSession()
        if (error) {
          console.error('Auth callback error:', error)
          setError('Authentication failed. Please try again.')
          setTimeout(() => navigate('/login', { replace: true }), 2000)
          return
        }
        navigate('/', { replace: true })
      } catch (err) {
        console.error('Auth callback exception:', err)
        setError('An unexpected error occurred. Please try again.')
        setTimeout(() => navigate('/login', { replace: true }), 2000)
      }
    }
    handleCallback()
  }, [navigate])

  if (error) {
    return (
      <div className="min-h-dvh flex items-center justify-center bg-paper p-4">
        <div className="tag-clip w-full max-w-md p-8 text-center">
          <p className="text-dead text-sm mb-4">{error}</p>
          <button
            onClick={() => navigate('/login', { replace: true })}
            className="rounded-md bg-tag-amber text-white font-medium py-2 px-6 hover:bg-tag-amber-dark transition-colors"
          >
            Back to Login
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-dvh flex items-center justify-center bg-paper">
      <div className="tag-clip p-8 text-center">
        <svg className="animate-spin h-8 w-8 mx-auto text-tag-amber mb-4" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
        </svg>
        <p className="text-graphite-soft">Completing sign-in...</p>
      </div>
    </div>
  )
}
