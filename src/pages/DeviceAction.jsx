import { useState, useEffect, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../hooks/useAuth'
import Navbar from '../components/Navbar'

const ACTION_TYPES = [
  { value: 'received', label: 'Received' },
  { value: 'diagnosing', label: 'Diagnosing' },
  { value: 'attempting_repair', label: 'Attempting Repair' },
  { value: 'parts_ordered', label: 'Parts Ordered' },
  { value: 'testing', label: 'Testing' },
  { value: 'escalated', label: 'Escalated' },
  { value: 'repaired', label: 'Repaired' },
  { value: 'confirmed_dead', label: 'Confirmed Dead' },
  { value: 'note', label: 'Note' },
  { value: 'part_recycled', label: 'Part Recycled' },
  { value: 'stripped', label: 'Stripped' },
]

export default function DeviceAction() {
  const { qrCode } = useParams()
  const navigate = useNavigate()
  const { profile } = useAuth()
  const [device, setDevice] = useState(null)
  const [actions, setActions] = useState([])
  const [handlers, setHandlers] = useState([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [form, setForm] = useState({
    action_type: '',
    result: '',
    notes: '',
  })

  const fetchDeviceData = useCallback(async () => {
    setLoading(true)
    const { data: deviceData, error: deviceError } = await supabase
      .from('devices')
      .select('*')
      .eq('qr_code', qrCode)
      .single()

    if (deviceError || !deviceData) {
      setError('Device not found')
      setLoading(false)
      return
    }

    setDevice(deviceData)

    const { data: actionsData } = await supabase
      .from('device_actions')
      .select('*')
      .eq('device_id', deviceData.id)
      .order('action_at', { ascending: false })

    const { data: handlersData } = await supabase
      .from('device_handlers')
      .select('*, handler:handler_id(full_name, email)')
      .eq('device_id', deviceData.id)
      .order('assigned_at', { ascending: false })

    setActions(actionsData || [])
    setHandlers(handlersData || [])
    setLoading(false)
  }, [qrCode])

  useEffect(() => {
    if (qrCode) {
      fetchDeviceData()
    }
  }, [qrCode, fetchDeviceData])

  const handleSubmit = async (e) => {
    e.preventDefault()
    setSaving(true)
    setError('')

    if (!form.action_type) {
      setError('Please select an action type')
      setSaving(false)
      return
    }

    const { error: actionError } = await supabase.from('device_actions').insert({
      device_id: device.id,
      engineer_id: profile.id,
      action_type: form.action_type,
      result: form.result || null,
      notes: form.notes || null,
    })

    if (actionError) {
      setError(actionError.message)
      setSaving(false)
      return
    }

    setForm({ action_type: '', result: '', notes: '' })
    fetchDeviceData()
    setSaving(false)
  }

  const formatDate = (date) => {
    if (!date) return '—'
    return new Date(date).toLocaleString('en-KE', {
      dateStyle: 'medium',
      timeStyle: 'short',
    })
  }

  if (loading) {
    return (
      <div className="min-h-dvh flex items-center justify-center bg-surface">
        <div className="tag-clip p-8 text-center">
          <p className="text-ink-soft">Loading device...</p>
        </div>
      </div>
    )
  }

  if (error && !device) {
    return (
      <div className="min-h-dvh flex items-center justify-center bg-surface p-4">
        <div className="tag-clip w-full max-w-md p-8 text-center">
          <h1 className="font-display text-2xl text-ink mb-2">Device Not Found</h1>
          <p className="text-ink-soft mb-6">{error}</p>
          <button
            onClick={() => navigate('/')}
            className="btn-primary"
          >
            Back to Dashboard
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-dvh bg-surface">
      <Navbar />
      <header className="border-b border-line bg-white">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex items-center justify-between">
          <div>
            <h1 className="font-display text-xl text-ink">Device Action</h1>
            <p className="text-sm text-ink-soft font-mono">{device?.qr_code}</p>
          </div>
          <button
            onClick={() => navigate('/')}
            className="rounded-md border border-line px-4 py-2 text-sm font-medium text-ink hover:bg-surface transition-colors"
          >
            Back to Dashboard
          </button>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
        <div className="tag-clip p-6">
          <h2 className="font-display text-lg text-ink mb-4">Device Details</h2>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm">
            <div>
              <span className="block text-ink-soft">Asset Tag</span>
              <span className="font-mono text-ink">{device?.asset_tag || '—'}</span>
            </div>
            <div>
              <span className="block text-ink-soft">Serial Number</span>
              <span className="font-mono text-ink">{device?.serial_number || '—'}</span>
            </div>
            <div>
              <span className="block text-ink-soft">Brand / Model</span>
              <span className="text-ink">{device?.brand} {device?.model}</span>
            </div>
            <div>
              <span className="block text-ink-soft">Status</span>
              <span className="text-ink">{device?.status?.replace('_', ' ')}</span>
            </div>
            <div>
              <span className="block text-ink-soft">Location</span>
              <span className="text-ink">{device?.location || '—'}</span>
            </div>
            <div>
              <span className="block text-ink-soft">Marked Dead At</span>
              <span className="text-ink">{formatDate(device?.marked_dead_at)}</span>
            </div>
          </div>
          {device?.notes && (
            <div className="mt-4 text-sm">
              <span className="block text-ink-soft mb-1">Notes</span>
              <p className="text-ink bg-surface p-3 rounded-md border border-line">{device.notes}</p>
            </div>
          )}
        </div>

        <div className="tag-clip p-6">
          <h2 className="font-display text-lg text-ink mb-4">Log Action</h2>
          {error && <p className="text-dead text-sm mb-4">{error}</p>}
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-ink mb-1">Action Type</label>
              <select
                value={form.action_type}
                onChange={(e) => setForm({ ...form, action_type: e.target.value })}
                className="w-full rounded-md border border-line bg-white px-3 py-2 text-ink focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
              >
                <option value="">Select action...</option>
                {ACTION_TYPES.map((action) => (
                  <option key={action.value} value={action.value}>{action.label}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-ink mb-1">Result</label>
              <input
                type="text"
                value={form.result}
                onChange={(e) => setForm({ ...form, result: e.target.value })}
                placeholder="Optional result summary"
                className="w-full rounded-md border border-line bg-white px-3 py-2 text-ink placeholder:text-ink-soft focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-ink mb-1">Notes</label>
              <textarea
                value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
                rows={3}
                placeholder="Optional details..."
                className="w-full rounded-md border border-line bg-white px-3 py-2 text-ink placeholder:text-ink-soft focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
              />
            </div>

            <button
              type="submit"
              disabled={saving}
              className="rounded-md bg-tag-amber text-white font-medium py-2.5 px-6 hover:bg-tag-amber-dark transition-colors disabled:opacity-50"
            >
              {saving ? 'Saving...' : 'Log Action'}
            </button>
          </form>
        </div>

        <div className="tag-clip p-6">
          <h2 className="font-display text-lg text-ink mb-4">Action History</h2>
          {actions.length === 0 ? (
            <p className="text-ink-soft text-sm">No actions recorded yet.</p>
          ) : (
            <div className="space-y-3">
              {actions.map((action) => (
                <div key={action.id} className="bg-surface border border-line rounded-md p-4">
                  <div className="flex items-center justify-between mb-2">
                    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-white border border-line text-ink">
                      {action.action_type?.replace('_', ' ')}
                    </span>
                    <span className="text-xs text-ink-soft">{formatDate(action.action_at)}</span>
                  </div>
                  {action.result && <p className="text-sm text-ink mb-1"><strong>Result:</strong> {action.result}</p>}
                  {action.notes && <p className="text-sm text-ink-soft">{action.notes}</p>}
                  <p className="text-xs text-ink-soft mt-2">
                    By engineer {action.engineer_id?.slice(0, 8)}...
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="tag-clip p-6">
          <h2 className="font-display text-lg text-ink mb-4">Custody History</h2>
          {handlers.length === 0 ? (
            <p className="text-ink-soft text-sm">No custody records yet.</p>
          ) : (
            <div className="space-y-3">
              {handlers.map((handler) => (
                <div key={handler.id} className="bg-surface border border-line rounded-md p-4 flex items-center justify-between">
                  <div>
                    <p className="text-sm text-ink">{handler.handler?.full_name || 'Unknown'}</p>
                    <p className="text-xs text-ink-soft font-mono">{handler.handler?.email}</p>
                  </div>
                  <div className="text-right text-xs text-ink-soft">
                    <p>Assigned: {formatDate(handler.assigned_at)}</p>
                    {handler.released_at && <p>Released: {formatDate(handler.released_at)}</p>}
                    {!handler.released_at && <span className="text-tag-amber font-medium">Current holder</span>}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </main>
    </div>
  )
}
