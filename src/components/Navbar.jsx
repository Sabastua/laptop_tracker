import { useState } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import Notifications from './Notifications'

const NAV_ITEMS = [
  { path: '/', label: 'Registry' },
  { path: '/handover', label: 'Handover' },
  { path: '/parts-recycling', label: 'Parts Recycling' },
  { path: '/chat', label: 'AI Assistant' },
]

export default function Navbar() {
  const { user, profile, signOut, isAdmin } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [showUserMenu, setShowUserMenu] = useState(false)

  const handleSignOut = async () => {
    await signOut()
    navigate('/login')
  }

  return (
    <nav className="bg-gradient-to-r from-primary to-gradient-end text-white shadow-lg sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          <div className="flex items-center gap-8">
            <button
              onClick={() => navigate('/')}
              className="font-display text-xl font-bold hover:opacity-90 transition-opacity"
            >
              Dead Laptop Tracker
            </button>
            <div className="hidden md:flex items-center gap-2">
              {NAV_ITEMS.map((item) => (
                <button
                  key={item.path}
                  onClick={() => navigate(item.path)}
                  className={`nav-link ${location.pathname === item.path ? 'active' : ''}`}
                >
                  {item.label}
                </button>
              ))}
              {isAdmin && (
                <button
                  onClick={() => navigate('/admin')}
                  className={`nav-link ${location.pathname === '/admin' ? 'active' : ''}`}
                >
                  Admin
                </button>
              )}
            </div>
          </div>

          <div className="flex items-center gap-4">
            <Notifications />
            <div className="relative">
              <button
                onClick={() => setShowUserMenu(!showUserMenu)}
                className="flex items-center gap-2 hover:bg-white/10 rounded-lg px-3 py-2 transition-colors"
              >
                <div className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center text-sm font-medium">
                  {profile?.full_name?.[0] || user?.email?.[0]?.toUpperCase()}
                </div>
                <span className="hidden sm:block text-sm font-medium">
                  {profile?.full_name || 'User'}
                </span>
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </button>

              {showUserMenu && (
                <>
                  <div
                    className="fixed inset-0 z-40"
                    onClick={() => setShowUserMenu(false)}
                  />
                  <div className="absolute right-0 mt-2 w-48 bg-white rounded-lg shadow-lg z-50 py-2 border border-line">
                    <div className="px-4 py-2 border-b border-line">
                      <p className="text-sm font-medium text-ink">{profile?.full_name}</p>
                      <p className="text-xs text-ink-soft">{user?.email}</p>
                    </div>
                    <button
                      onClick={() => {
                        setShowUserMenu(false)
                        navigate('/admin')
                      }}
                      className="w-full text-left px-4 py-2 text-sm text-ink hover:bg-surface-soft transition-colors"
                    >
                      Admin Panel
                    </button>
                    <button
                      onClick={handleSignOut}
                      className="w-full text-left px-4 py-2 text-sm text-dead hover:bg-surface-soft transition-colors"
                    >
                      Sign Out
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      </div>
    </nav>
  )
}
