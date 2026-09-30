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
    <div className="min-h-dvh flex items-center justify-center relative overflow-hidden">
      <div className="absolute inset-0 bg-gradient-to-br from-primary to-gradient-end"></div>
      <div className="absolute inset-0 bg-gradient-to-tl from-gradient-secondary/20 to-transparent"></div>

      <div className="relative z-10 w-full max-w-md mx-auto p-4">
        <div className="bg-white/10 backdrop-blur-xl rounded-2xl border border-white/20 shadow-2xl p-8 fade-in-up">
          <div className="text-center mb-8">
            <div className="w-16 h-16 mx-auto rounded-xl bg-white/10 flex items-center justify-center mb-4">
              <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 3v2m6-2v2M9 19v2m6-2v2M5 9H3m2 6H3m18-6h-2m2 6h-2M7 19h10a2 2 0 002-2V7a2 2 0 00-2-2H7a2 2 0 00-2 2v10a2 2 0 002 2zM9 9h6v6H9V9z" />
              </svg>
            </div>
            <h1 className="text-2xl font-bold text-white mb-1">Dead Laptop Tracker</h1>
            <p className="text-white/70 text-sm">
              Internal tool for Safaricom engineering
            </p>
          </div>

          <div className="flex rounded-lg bg-white/5 border border-white/10 mb-6 p-1">
            <button
              type="button"
              onClick={() => setMode('sso')}
              className={`flex-1 py-2.5 text-sm font-medium rounded-md transition-all ${
                mode === 'sso'
                  ? 'bg-white text-primary shadow-lg'
                  : 'text-white/70 hover:text-white'
              }`}
            >
              SSO
            </button>
            <button
              type="button"
              onClick={() => setMode('email')}
              className={`flex-1 py-2.5 text-sm font-medium rounded-md transition-all ${
                mode === 'email'
                  ? 'bg-white text-primary shadow-lg'
                  : 'text-white/70 hover:text-white'
              }`}
            >
              Email
            </button>
          </div>

          {(authError || localError) && (
            <div className="mb-6 rounded-lg border border-red-500/30 bg-red-500/10 p-4">
              <p className="text-red-300 text-sm font-medium mb-1">Sign-in failed</p>
              <p className="text-red-300/80 text-xs">{authError || localError}</p>
            </div>
          )}

          {mode === 'sso' ? (
            <button
              onClick={handleSSO}
              disabled={loading}
              className="w-full btn-primary flex items-center justify-center gap-2 py-3"
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
              <div className="flex rounded-lg bg-white/5 border border-white/10 mb-6 p-1">
                <button
                  type="button"
                  onClick={() => setIsSignUp(false)}
                  className={`flex-1 py-2.5 text-sm font-medium rounded-md transition-all ${
                    !isSignUp
                      ? 'bg-white text-primary shadow-lg'
                      : 'text-white/70 hover:text-white'
                  }`}
                >
                  Sign In
                </button>
                <button
                  type="button"
                  onClick={() => setIsSignUp(true)}
                  className={`flex-1 py-2.5 text-sm font-medium rounded-md transition-all ${
                    isSignUp
                      ? 'bg-white text-primary shadow-lg'
                      : 'text-white/70 hover:text-white'
                  }`}
                >
                  Sign Up
                </button>
              </div>

              <form onSubmit={handleEmailSubmit} className="space-y-4">
                {isSignUp && (
                  <div>
                    <label className="block text-sm font-medium text-white/90 mb-1">
                      Full Name
                    </label>
                    <input
                      type="text"
                      value={fullName}
                      onChange={(e) => setFullName(e.target.value)}
                      required
                      className="w-full rounded-lg border border-white/20 bg-white/5 px-3 py-2.5 text-white placeholder:text-white/50 focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent transition-colors"
                      placeholder="Jane Doe"
                    />
                  </div>
                )}

                <div>
                  <label className="block text-sm font-medium text-white/90 mb-1">
                    Email
                  </label>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    className="w-full rounded-lg border border-white/20 bg-white/5 px-3 py-2.5 text-white placeholder:text-white/50 focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent transition-colors"
                    placeholder="you@safaricom.co.ke"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-white/90 mb-1">
                    Password
                  </label>
                  <input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    minLength={6}
                    className="w-full rounded-lg border border-white/20 bg-white/5 px-3 py-2.5 text-white placeholder:text-white/50 focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent transition-colors"
                    placeholder="••••••••"
                  />
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className="btn-primary w-full py-3 font-semibold"
                >
                  {loading ? 'Please wait...' : isSignUp ? 'Create Account' : 'Sign In'}
                </button>
              </form>
            </>
          )}

          <p className="mt-6 text-center text-xs text-white/60">
            Access is restricted to @safaricom.co.ke employees only.
          </p>
        </div>
      </div>
    </div>
  )
}
