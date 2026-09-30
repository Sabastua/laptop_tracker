import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../hooks/useAuth'
import Navbar from '../components/Navbar'

const STATUSES = [
  { value: 'pending', label: 'Pending' },
  { value: 'accepted', label: 'Accepted' },
  { value: 'revoked', label: 'Revoked' },
  { value: 'expired', label: 'Expired' },
]

const STATUS_COLORS = {
  active: '#10b981',
  repaired: '#6366f1',
  in_repair: '#f59e0b',
  dead: '#ef4444',
  stripped: '#64748b',
  disposed: '#94a3b8',
}

const STATUS_LABELS = {
  active: 'Active',
  repaired: 'Repaired',
  in_repair: 'In Repair',
  dead: 'Dead',
  stripped: 'Stripped',
  disposed: 'Disposed',
}

export default function Handover() {
  const { profile } = useAuth()
  const navigate = useNavigate()
  const [requests, setRequests] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [devices, setDevices] = useState([])
  const [form, setForm] = useState({
    device_id: '',
    allowed_emails: [],
    passcode: '',
    notes: '',
  })
  const [selectedEngineers, setSelectedEngineers] = useState([])
  const [allEngineersList, setAllEngineersList] = useState([])

  const fetchRequests = useCallback(async () => {
    setLoading(true)
    const { data, error } = await supabase
      .from('handover_requests')
      .select('*, from:created_by(full_name, email), device:device_id(qr_code, asset_tag, brand, model)')
      .order('created_at', { ascending: false })

    if (error) {
      console.error('Failed to fetch handover requests:', error)
      setError(error.message)
    } else {
      setRequests(data || [])
    }
    setLoading(false)
  }, [])

  const fetchEngineers = async () => {
    const { data, error } = await supabase
      .from('allowed_engineers')
      .select('id, email, full_name, role')
      .order('full_name')

    if (error) {
      console.error('Failed to fetch engineers:', error)
    } else {
      setAllEngineersList(data || [])
    }
  }

  const fetchDevices = async () => {
    const { data, error } = await supabase
      .from('device_current_state')
      .select('id, qr_code, asset_tag, serial_number, brand, model, status, current_handler_id, current_handler_name')
      .order('marked_dead_at', { ascending: false })

    if (error) {
      console.error('Failed to fetch devices:', error)
    } else {
      setDevices(data || [])
    }
  }

  useEffect(() => {
    if (!profile) return
    fetchRequests()
    fetchEngineers()
    fetchDevices()
  }, [profile, fetchRequests])

  const handleCreate = async (e) => {
    e.preventDefault()
    setError('')
    setSuccess('')

    if (!form.device_id || selectedEngineers.length === 0) {
      setError('Device and at least one recipient engineer are required')
      return
    }

    const { error } = await supabase.rpc('create_handover_request', {
      device_id: form.device_id,
      allowed_emails: selectedEngineers,
      passcode: form.passcode,
      expires_in_minutes: 60,
      notes: form.notes || null,
    })

    if (error) {
      setError(error.message)
    } else {
      setSuccess('Handover request created successfully')
      setForm({ device_id: '', allowed_emails: [], passcode: '', notes: '' })
      setSelectedEngineers([])
      setShowCreateModal(false)
      fetchRequests()
    }
  }

  const handleAccept = async (deviceId) => {
    setError('')
    setSuccess('')

    const passcode = prompt('Enter the handover passcode:')
    if (!passcode) return

    const { error } = await supabase.rpc('accept_handover_request', {
      device_id: deviceId,
      passcode: passcode,
    })

    if (error) {
      setError(error.message)
    } else {
      setSuccess('Handover accepted - device custody transferred')
      fetchRequests()
    }
  }

  const handleToggleEngineer = (email) => {
    setSelectedEngineers((prev) =>
      prev.includes(email)
        ? prev.filter((e) => e !== email)
        : [...prev, email]
    )
  }

  const isRecipient = (req) => {
    return req.allowed_emails?.includes(profile?.email || '')
  }

  const canActOn = (req) => {
    return isRecipient(req) && req.status === 'pending' && new Date(req.expires_at) > new Date()
  }

  const deviceStateById = devices.reduce((acc, device) => {
    acc[device.id] = device
    return acc
  }, {})

  return (
    <div className="min-h-dvh bg-surface">
      <Navbar />

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
        <div className="flex items-center justify-between fade-in-up">
          <div>
            <h1 className="font-display text-3xl text-ink mb-2">Handover</h1>
            <p className="text-ink-soft">Request and manage device custody transfers</p>
          </div>
          <button
            onClick={() => setShowCreateModal(true)}
            className="btn-primary flex items-center gap-2"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            New Request
          </button>
        </div>

        {error && (
          <div className="tag-clip p-4 bg-red-50 border-dead">
            <p className="text-dead text-sm">{error}</p>
          </div>
        )}

        {success && (
          <div className="tag-clip p-4 bg-green-50 border-alive">
            <p className="text-alive text-sm">{success}</p>
          </div>
        )}

        {loading ? (
          <p className="text-ink-soft">Loading...</p>
        ) : requests.length === 0 ? (
          <div className="tag-clip p-8 text-center">
            <p className="text-ink-soft">No handover requests yet.</p>
          </div>
        ) : (
          <div className="space-y-4">
            {requests.map((req) => {
              const deviceState = deviceStateById[req.device_id]
              const status = deviceState?.status || req.device?.status
              return (
              <div key={req.id} className="tag-clip p-6 card-hover">
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <h3 className="font-medium text-ink">
                      {deviceState?.asset_tag || req.device?.asset_tag || req.device?.qr_code}
                    </h3>
                    <p className="text-xs text-ink-soft font-mono">
                      {req.device?.brand} {req.device?.model} · {req.device?.qr_code}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    {status && (
                      <span
                        className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border"
                        style={{
                          color: STATUS_COLORS[status],
                          backgroundColor: `${STATUS_COLORS[status]}14`,
                          borderColor: `${STATUS_COLORS[status]}40`,
                        }}
                      >
                        {STATUS_LABELS[status] || status}
                      </span>
                    )}
                    <span
                      className={`px-2.5 py-0.5 rounded-full text-xs font-medium ${
                        req.status === 'accepted'
                          ? 'bg-green-50 text-alive'
                          : req.status === 'revoked'
                          ? 'bg-red-50 text-dead'
                          : req.status === 'expired'
                          ? 'bg-gray-100 text-stripped'
                          : 'bg-amber-50 text-repair'
                      }`}
                    >
                      {STATUSES.find((s) => s.value === req.status)?.label || req.status}
                    </span>
                  </div>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm mb-4">
                  <div>
                    <span className="block text-ink-soft">Asset Tag</span>
                    <span className="font-mono text-ink">{deviceState?.asset_tag || '—'}</span>
                  </div>
                  <div>
                    <span className="block text-ink-soft">Serial Number</span>
                    <span className="font-mono text-ink">{deviceState?.serial_number || '—'}</span>
                  </div>
                  <div>
                    <span className="block text-ink-soft">Current Handler</span>
                    <span className="text-ink">{deviceState?.current_handler_name || 'Unassigned'}</span>
                  </div>
                  <div>
                    <span className="block text-ink-soft">From</span>
                    <span className="text-ink">{req.from?.full_name || req.from?.email || '—'}</span>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-sm mb-4">
                  <div>
                    <span className="block text-ink-soft">To</span>
                    <span className="text-ink break-words">{req.allowed_emails?.join(', ') || '—'}</span>
                  </div>
                  <div>
                    <span className="block text-ink-soft">Created</span>
                    <span className="text-ink">{new Date(req.created_at).toLocaleDateString()}</span>
                  </div>
                  <div>
                    <span className="block text-ink-soft">Expires</span>
                    <span className="text-ink">{new Date(req.expires_at).toLocaleString()}</span>
                  </div>
                </div>

                {req.notes && (
                  <div className="mb-4">
                    <span className="block text-ink-soft text-xs mb-1">Notes</span>
                    <p className="text-ink text-sm bg-surface p-2 rounded border border-line">{req.notes}</p>
                  </div>
                )}

                <div className="pt-3 border-t border-line flex flex-wrap items-center gap-3">
                  {canActOn(req) && (
                    <button
                      onClick={() => handleAccept(req.device_id)}
                      className="btn-primary text-sm flex items-center gap-2"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                      </svg>
                      Accept Handover
                    </button>
                  )}
                  <button
                    onClick={() => navigate(`/device/${req.device?.qr_code}`)}
                    className="rounded-lg border border-line px-4 py-2 text-sm font-medium text-ink hover:bg-surface-soft transition-colors"
                  >
                    View Device Record
                  </button>
                </div>
              </div>
              )
            })}
          </div>
        )}
      </main>

      {showCreateModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="tag-clip w-full max-w-lg p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-display text-xl text-ink">New Handover Request</h3>
              <button
                onClick={() => setShowCreateModal(false)}
                className="text-ink-soft hover:text-ink"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {error && <p className="text-dead text-sm mb-4">{error}</p>}

            <form onSubmit={handleCreate} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-ink mb-1">Device</label>
                <select
                  value={form.device_id}
                  onChange={(e) => setForm({ ...form, device_id: e.target.value })}
                  required
                  className="w-full rounded-lg border border-line bg-surface px-3 py-2 text-ink focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
                >
                  <option value="">Select a device</option>
                  {devices
                    .filter((d) => d.current_handler_id === profile?.id)
                    .map((device) => (
                      <option key={device.id} value={device.id}>
                        {device.asset_tag || device.qr_code} — {device.brand} {device.model}
                      </option>
                    ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-ink mb-1">Recipient Engineers</label>
                <div className="space-y-2">
                  {allEngineersList
                    .filter((e) => e.email !== profile?.email && e.role === 'engineer')
                    .map((eng) => (
                      <label key={eng.id} className="flex items-center gap-3 text-sm">
                        <input
                          type="checkbox"
                          checked={selectedEngineers.includes(eng.email)}
                          onChange={() => handleToggleEngineer(eng.email)}
                          className="w-4 h-4 rounded border-line text-primary focus:ring-primary"
                        />
                        <span className="text-ink">{eng.full_name} ({eng.email})</span>
                      </label>
                    ))}
                </div>
                {selectedEngineers.length === 0 && (
                  <p className="text-ink-soft text-xs mt-2">Select at least one recipient</p>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium text-ink mb-1">Passcode</label>
                <input
                  type="password"
                  value={form.passcode}
                  onChange={(e) => setForm({ ...form, passcode: e.target.value })}
                  required
                  minLength={6}
                  placeholder="Enter a passcode for the recipient"
                  className="w-full rounded-lg border border-line bg-surface px-3 py-2 text-ink placeholder:text-ink-soft focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-ink mb-1">Notes (Optional)</label>
                <textarea
                  value={form.notes}
                  onChange={(e) => setForm({ ...form, notes: e.target.value })}
                  rows={3}
                  placeholder="Add any context for the recipient..."
                  className="w-full rounded-lg border border-line bg-surface px-3 py-2 text-ink placeholder:text-ink-soft focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
                />
              </div>

              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="flex-1 rounded-lg border border-line px-4 py-2 text-sm font-medium text-ink hover:bg-surface-soft transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={selectedEngineers.length === 0}
                  className="flex-1 btn-primary disabled:opacity-50"
                >
                  Create Request
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
