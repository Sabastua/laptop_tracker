import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'

export default function Login() {
  const { signInWithSSO, signInWithEmail, signUpWithEmail, authError, clearError } = useAuth()
  const navigate = useNavigate()
  const [mode, setMode] = useState('sso')
  const [isSignUp, setIsSignUp] = useState(false)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [fullName, setFullName] = useState('')
  const [loading, setLoading] = useState(false)
  const [localError, setLocalError] = useState('')

  const handleEmailSubmit = async (e) => {
    e.preventDefault()
    setLocalError('')
    clearError()
    setLoading(true)

    let result
    if (isSignUp) {
      result = await signUpWithEmail(email, password, fullName)
    } else {
      result = await signInWithEmail(email, password)
    }

    setLoading(false)

    if (result?.success) {
      if (isSignUp) {
        setLocalError('Account created! Please check your email to confirm your account before signing in.')
        setIsSignUp(false)
      } else {
        setTimeout(() => navigate('/', { replace: true }), 500)
      }
    }
  }

  const handleSSO = async () => {
    setLocalError('')
    clearError()
    setLoading(true)
    await signInWithSSO()
  }

  return (
    <div className="min-h-dvh flex items-center justify-center bg-gradient-to-br from-primary to-gradient-end p-4">
      <div className="tag-clip w-full max-w-md p-8 fade-in-up">
        <div className="text-center mb-8">
          <h1 className="font-display text-3xl text-ink mb-2">Dead Laptop Tracker</h1>
          <p className="text-ink-soft text-sm">
            Internal tool for Safaricom engineering
          </p>
        </div>

        <div className="flex rounded-lg bg-surface-soft border border-line mb-6">
          <button
            type="button"
            onClick={() => setMode('sso')}
            className={`flex-1 py-2 text-sm font-medium rounded-md transition-colors ${
              mode === 'sso'
                ? 'bg-white text-ink shadow-sm'
                : 'text-ink-soft hover:text-ink'
            }`}
          >
            SSO
          </button>
          <button
            type="button"
            onClick={() => setMode('email')}
            className={`flex-1 py-2 text-sm font-medium rounded-md transition-colors ${
              mode === 'email'
                ? 'bg-white text-ink shadow-sm'
                : 'text-ink-soft hover:text-ink'
            }`}
          >
            Email
          </button>
        </div>

        {(authError || localError) && (
          <div className="mb-6 rounded-lg border border-dead/30 bg-red-50 p-4">
            <p className="text-dead text-sm font-medium mb-1">Sign-in failed</p>
            <p className="text-dead/80 text-xs">{authError || localError}</p>
          </div>
        )}

        {mode === 'sso' ? (
          <button
            onClick={handleSSO}
            disabled={loading}
            className="btn-primary w-full flex items-center justify-center gap-2"
          >
            {loading ? (
              <span className="flex items-center gap-2">
                <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                Redirecting to SSO...
              </span>
            ) : (
              <>
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"
                  />
                </svg>
                Sign in with Safaricom SSO
              </>
            )}
          </button>
        ) : (
          <>
            <div className="flex rounded-lg bg-surface-soft border border-line mb-6">
              <button
                type="button"
                onClick={() => setIsSignUp(false)}
                className={`flex-1 py-2 text-sm font-medium rounded-md transition-colors ${
                  !isSignUp
                    ? 'bg-white text-ink shadow-sm'
                    : 'text-ink-soft hover:text-ink'
                }`}
              >
                Sign In
              </button>
              <button
                type="button"
                onClick={() => setIsSignUp(true)}
                className={`flex-1 py-2 text-sm font-medium rounded-md transition-colors ${
                  isSignUp
                    ? 'bg-white text-ink shadow-sm'
                    : 'text-ink-soft hover:text-ink'
                }`}
              >
                Sign Up
              </button>
            </div>

            <form onSubmit={handleEmailSubmit} className="space-y-4">
              {isSignUp && (
                <div>
                  <label className="block text-sm font-medium text-ink mb-1">
                    Full Name
                  </label>
                  <input
                    type="text"
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    required
                    className="w-full rounded-lg border border-line bg-surface px-3 py-2 text-ink placeholder:text-ink-soft focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
                    placeholder="Jane Doe"
                  />
                </div>
              )}

              <div>
                <label className="block text-sm font-medium text-ink mb-1">
                  Email
                </label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  className="w-full rounded-lg border border-line bg-surface px-3 py-2 text-ink placeholder:text-ink-soft focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
                  placeholder="you@safaricom.co.ke"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-ink mb-1">
                  Password
                </label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  minLength={6}
                  className="w-full rounded-lg border border-line bg-surface px-3 py-2 text-ink placeholder:text-ink-soft focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
                  placeholder="••••••••"
                />
              </div>

              <button
                type="submit"
                disabled={loading}
                className="btn-primary w-full"
              >
                {loading ? 'Please wait...' : isSignUp ? 'Create Account' : 'Sign In'}
              </button>
            </form>
          </>
        )}

        <p className="mt-6 text-center text-xs text-ink-soft">
          Access is restricted to @safaricom.co.ke employees only.
        </p>
      </div>
    </div>
  )
}
