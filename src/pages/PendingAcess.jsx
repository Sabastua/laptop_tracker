import { useAuth } from '../hooks/useAuth'
import Navbar from '../components/Navbar'

export default function PendingAccess() {
  const { signOut, profile } = useAuth()

  return (
    <div className="min-h-dvh bg-surface">
      <Navbar />
      <div className="flex items-center justify-center p-4">
        <div className="tag-clip w-full max-w-md p-8 text-center fade-in-up">
          <div className="mb-4">
            <svg
              className="w-12 h-12 mx-auto text-primary"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"
              />
            </svg>
          </div>

          <h1 className="font-display text-2xl text-ink mb-2">
            Pending Access
          </h1>

          <p className="text-ink-soft mb-6">
            Your account <strong className="text-ink">{profile?.email}</strong> has
            been created, but you are not yet authorized to use the Dead Laptop
            Tracker. Please contact your team lead to be added to the allowlist.
          </p>

          <button
            onClick={signOut}
            className="btn-primary"
          >
            Sign Out
          </button>
        </div>
      </div>
    </div>
  )
}
