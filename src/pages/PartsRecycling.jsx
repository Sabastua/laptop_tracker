import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../hooks/useAuth'
import Navbar from '../components/Navbar'

const PART_STATUSES = [
  { value: 'available', label: 'Available' },
  { value: 'recycled', label: 'Recycled' },
  { value: 'discarded', label: 'Discarded' },
]

export default function PartsRecycling() {
  const { profile } = useAuth()
  const [devices, setDevices] = useState([])
  const [selectedDevice, setSelectedDevice] = useState(null)
  const [parts, setParts] = useState([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    fetchDeadDevices()
  }, [])

  const fetchDeadDevices = async () => {
    setLoading(true)
    const { data, error } = await supabase
      .from('devices')
      .select('id, qr_code, asset_tag, brand, model, status')
      .eq('status', 'dead')
      .order('marked_dead_at', { ascending: false })

    if (error) {
      setError(error.message)
    } else {
      setDevices(data || [])
    }
    setLoading(false)
  }

  const selectDevice = async (device) => {
    setSelectedDevice(device)
    setError('')
    const { data, error } = await supabase
      .from('device_parts')
      .select('*')
      .eq('device_id', device.id)
      .order('part_type')

    if (error) {
      setError(error.message)
      setParts([])
    } else {
      setParts(data || [])
    }
  }

  const updatePartStatus = async (partId, newStatus) => {
    setSaving(true)
    setError('')

    const { error } = await supabase
      .from('device_parts')
      .update({ status: newStatus, recycled_by: profile.id, recycled_at: new Date() })
      .eq('id', partId)

    if (error) {
      setError(error.message)
    } else {
      setParts((prev) =>
        prev.map((p) => (p.id === partId ? { ...p, status: newStatus, recycled_by: profile.id, recycled_at: new Date() } : p))
      )
    }
    setSaving(false)
  }

  const recycledCount = parts.filter((p) => p.status === 'recycled' || p.status === 'discarded').length
  const isStripped = selectedDevice?.status === 'stripped'

  return (
    <div className="min-h-dvh bg-surface">
      <Navbar />
      <header className="border-b border-line bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <h1 className="font-display text-xl text-ink">Parts Recycling</h1>
          <p className="text-sm text-ink-soft">Mark parts as recycled or discarded for dead devices.</p>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-1">
            <div className="tag-clip p-6">
              <h2 className="font-display text-lg text-ink mb-4">Dead Devices</h2>
              {loading ? (
                <p className="text-ink-soft text-sm">Loading...</p>
              ) : devices.length === 0 ? (
                <p className="text-ink-soft text-sm">No dead devices found.</p>
              ) : (
                <div className="space-y-2">
                  {devices.map((device) => (
                    <button
                      key={device.id}
                      onClick={() => selectDevice(device)}
                      className={`w-full text-left rounded-md border p-3 transition-colors ${
                        selectedDevice?.id === device.id
                          ? 'border-primary bg-surface-soft'
                          : 'border-line bg-white hover:bg-surface-soft'
                      }`}
                    >
                      <p className="text-sm font-medium text-ink">{device.asset_tag || device.qr_code}</p>
                      <p className="text-xs text-ink-soft">{device.brand} {device.model}</p>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className="lg:col-span-2">
            {selectedDevice ? (
              <div className="tag-clip p-6">
                <div className="flex items-center justify-between mb-6">
                  <div>
                    <h2 className="font-display text-lg text-ink">
                      {selectedDevice.asset_tag || selectedDevice.qr_code}
                    </h2>
                    <p className="text-sm text-ink-soft">
                      {selectedDevice.brand} {selectedDevice.model}
                    </p>
                  </div>
                  {isStripped && (
                    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-surface-soft border border-line text-stripped">
                      Fully Stripped
                    </span>
                  )}
                </div>

                {error && <p className="text-dead text-sm mb-4">{error}</p>}

                {!isStripped && (
                  <div className="mb-6">
                    <div className="flex items-center justify-between text-sm mb-2">
                      <span className="text-ink-soft">Progress</span>
                      <span className="text-ink font-medium">{recycledCount} / {parts.length}</span>
                    </div>
                    <div className="w-full bg-surface-soft border border-line rounded-full h-2">
                      <div
                        className="bg-gradient-to-r from-primary to-gradient-end h-2 rounded-full transition-all"
                        style={{ width: `${parts.length ? (recycledCount / parts.length) * 100 : 0}%` }}
                      />
                    </div>
                  </div>
                )}

                <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm">
                    <thead className="bg-surface-soft border-b border-line">
                      <tr>
                        <th className="px-4 py-3 font-medium text-ink-soft">Part</th>
                        <th className="px-4 py-3 font-medium text-ink-soft">Description</th>
                        <th className="px-4 py-3 font-medium text-ink-soft">Status</th>
                        <th className="px-4 py-3 font-medium text-ink-soft">Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-line">
                      {parts.map((part) => (
                        <tr key={part.id}>
                          <td className="px-4 py-3 text-ink capitalize">{part.part_type?.replace('_', ' ')}</td>
                          <td className="px-4 py-3 text-ink-soft">{part.part_description || '—'}</td>
                          <td className="px-4 py-3">
                            <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-surface-soft border border-line ${
                              part.status === 'recycled' || part.status === 'discarded'
                                ? 'text-alive'
                                : 'text-ink-soft'
                            }`}>
                              {part.status}
                            </span>
                          </td>
                          <td className="px-4 py-3">
                            {!isStripped && (
                              <select
                                value={part.status}
                                onChange={(e) => updatePartStatus(part.id, e.target.value)}
                                disabled={saving}
                                className="rounded-md border border-line bg-white px-2 py-1 text-xs text-ink focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent disabled:opacity-50"
                              >
                                {PART_STATUSES.map((status) => (
                                  <option key={status.value} value={status.value}>{status.label}</option>
                                ))}
                              </select>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ) : (
              <div className="tag-clip p-8 text-center">
                <p className="text-ink-soft">Select a dead device from the left to manage parts.</p>
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  )
}
