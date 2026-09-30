import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../hooks/useAuth'
import Navbar from '../components/Navbar'

const PART_TYPES = [
  'ram',
  'ssd',
  'hdd',
  'display',
  'keyboard',
  'battery',
  'motherboard',
  'charger',
  'trackpad',
  'wifi_card',
  'other',
]

const PART_STATUSES = [
  { value: 'available', label: 'Available' },
  { value: 'recycled', label: 'Recycled' },
  { value: 'discarded', label: 'Discarded' },
]

const DEVICE_FILTERS = [
  { value: 'all', label: 'All' },
  { value: 'dead', label: 'Dead' },
  { value: 'stripped', label: 'Stripped' },
]

const PART_STATUS_COLORS = {
  available: { color: '#f59e0b', background: '#fef3c7', border: '#fcd34d' },
  recycled: { color: '#10b981', background: '#dcfce7', border: '#6ee7b7' },
  discarded: { color: '#64748b', background: '#e2e8f0', border: '#cbd5e1' },
}

const DEVICE_STATUS_COLORS = {
  dead: '#ef4444',
  stripped: '#64748b',
}

const formatDate = (value) => {
  if (!value) return '—'

  return new Intl.DateTimeFormat('en-KE', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value))
}

const titleCase = (value) =>
  (value || '').replaceAll('_', ' ').replace(/\b\w/g, (char) => char.toUpperCase())

export default function PartsRecycling() {
  const { profile } = useAuth()
  const navigate = useNavigate()
  const [devices, setDevices] = useState([])
  const [selectedId, setSelectedId] = useState(null)
  const [parts, setParts] = useState([])
  const [search, setSearch] = useState('')
  const [deviceFilter, setDeviceFilter] = useState('all')
  const [loading, setLoading] = useState(true)
  const [partsLoading, setPartsLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [showAddPart, setShowAddPart] = useState(false)
  const [newPart, setNewPart] = useState({ part_type: 'ram', part_description: '' })

  const fetchDevices = useCallback(async () => {
    setLoading(true)
    const { data, error: fetchError } = await supabase
      .from('device_current_state')
      .select(
        'id, qr_code, asset_tag, serial_number, brand, model, status, location, notes, marked_dead_at, current_handler_name, parts_remaining'
      )
      .in('status', ['dead', 'stripped'])
      .order('marked_dead_at', { ascending: false })

    if (fetchError) {
      setError(fetchError.message)
      setDevices([])
    } else {
      setDevices(data || [])
      setSelectedId((current) => current || data?.[0]?.id || null)
    }
    setLoading(false)
  }, [])

  const fetchParts = useCallback(async (deviceId) => {
    if (!deviceId) {
      setParts([])
      return
    }

    setPartsLoading(true)
    const { data, error: fetchError } = await supabase
      .from('device_parts')
      .select('*, recycler:recycled_by(full_name)')
      .eq('device_id', deviceId)
      .order('part_type')

    if (fetchError) {
      setError(fetchError.message)
      setParts([])
    } else {
      setParts(data || [])
    }
    setPartsLoading(false)
  }, [])

  useEffect(() => {
    fetchDevices()
  }, [fetchDevices])

  useEffect(() => {
    fetchParts(selectedId)
  }, [selectedId, fetchParts])

  const selectedDevice = devices.find((device) => device.id === selectedId) || null

  const filteredDevices = useMemo(() => {
    const query = search.trim().toLowerCase()

    return devices.filter((device) => {
      const matchesFilter = deviceFilter === 'all' || device.status === deviceFilter
      const matchesSearch =
        !query ||
        [device.asset_tag, device.serial_number, device.brand, device.model, device.current_handler_name].some(
          (value) => value?.toLowerCase().includes(query)
        )

      return matchesFilter && matchesSearch
    })
  }, [devices, deviceFilter, search])

  const partStats = useMemo(() => {
    return {
      available: parts.filter((part) => part.status === 'available').length,
      recycled: parts.filter((part) => part.status === 'recycled').length,
      discarded: parts.filter((part) => part.status === 'discarded').length,
    }
  }, [parts])

  const deviceCounts = useMemo(
    () => ({
      all: devices.length,
      dead: devices.filter((device) => device.status === 'dead').length,
      stripped: devices.filter((device) => device.status === 'stripped').length,
    }),
    [devices]
  )

  const updatePartStatus = async (partId, status) => {
    setSaving(true)
    setError('')
    setSuccess('')

    const { error: updateError } = await supabase
      .from('device_parts')
      .update({ status, recycled_by: profile.id, recycled_at: new Date().toISOString() })
      .eq('id', partId)

    if (updateError) {
      setError(updateError.message)
    } else {
      setSuccess(`Part marked as ${status}.`)
      await Promise.all([fetchParts(selectedId), fetchDevices()])
    }
    setSaving(false)
  }

  const addPart = async (event) => {
    event.preventDefault()
    setSaving(true)
    setError('')
    setSuccess('')

    const { error: insertError } = await supabase.from('device_parts').insert({
      device_id: selectedId,
      part_type: newPart.part_type,
      part_description: newPart.part_description.trim() || null,
    })

    if (insertError) {
      setError(insertError.message)
    } else {
      setSuccess(`Added ${titleCase(newPart.part_type)} to the parts list.`)
      setNewPart({ part_type: 'ram', part_description: '' })
      setShowAddPart(false)
      await Promise.all([fetchParts(selectedId), fetchDevices()])
    }
    setSaving(false)
  }

  return (
    <div className="min-h-dvh bg-surface">
      <Navbar />

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="font-display text-3xl text-ink">Parts Recycling</h1>
            <p className="text-ink-soft mt-1">Recover, reuse, or discard parts from dead devices</p>
          </div>
          <button type="button" onClick={fetchDevices} className="btn-outline w-fit flex items-center gap-2">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M4 4v5h.6m15.4 0A8 8 0 008.6 4M4 15h.6A8 8 0 0020 10m-4 8v-5h-.6"
              />
            </svg>
            Refresh
          </button>
        </div>

        {error && (
          <div className="glass-card p-4 bg-red-50 border-dead">
            <p className="text-dead text-sm">{error}</p>
          </div>
        )}

        {success && (
          <div className="glass-card p-4 bg-green-50 border-alive">
            <p className="text-alive text-sm">{success}</p>
          </div>
        )}

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[
            { label: 'Dead Devices', value: deviceCounts.dead, color: '#ef4444' },
            { label: 'Fully Stripped', value: deviceCounts.stripped, color: '#64748b' },
            { label: 'Parts Available', value: partStats.available, color: '#f59e0b' },
            { label: 'Parts Recovered', value: partStats.recycled, color: '#10b981' },
          ].map((item) => (
            <div key={item.label} className="glass-card p-4">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-ink-soft">{item.label}</span>
                <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: item.color }} />
              </div>
              <p className="text-2xl font-bold text-ink mt-2">{item.value}</p>
            </div>
          ))}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="glass-card p-5">
            <div className="relative mb-3">
              <svg
                className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-ink-muted"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M21 21l-6-6m2-5a8 8 0 11-16 0 8 8 0 0116 0z"
                />
              </svg>
              <input
                type="search"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search device or handler..."
                className="w-full rounded-lg border border-line bg-surface px-4 py-2 pl-9 text-sm text-ink placeholder:text-ink-soft focus:outline-none focus:ring-2 focus:ring-primary"
              />
            </div>

            <div className="flex gap-2 mb-4">
              {DEVICE_FILTERS.map((filter) => (
                <button
                  key={filter.value}
                  type="button"
                  onClick={() => setDeviceFilter(filter.value)}
                  className={`flex-1 rounded-lg border px-2 py-1.5 text-xs font-medium transition-colors ${
                    deviceFilter === filter.value
                      ? 'border-primary text-primary bg-primary/5'
                      : 'border-line text-ink-soft hover:bg-surface-soft'
                  }`}
                >
                  {filter.label} ({deviceCounts[filter.value]})
                </button>
              ))}
            </div>

            {loading ? (
              <p className="text-ink-soft text-sm">Loading devices...</p>
            ) : filteredDevices.length === 0 ? (
              <p className="text-ink-soft text-sm">No devices awaiting parts recycling.</p>
            ) : (
              <div className="space-y-2 max-h-[32rem] overflow-y-auto pr-1">
                {filteredDevices.map((device) => (
                  <button
                    key={device.id}
                    type="button"
                    onClick={() => setSelectedId(device.id)}
                    className={`w-full text-left rounded-lg border p-3 transition-colors ${
                      selectedId === device.id
                        ? 'border-primary bg-primary/5'
                        : 'border-line bg-white hover:bg-surface-soft'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm font-medium text-ink font-mono">
                        {device.asset_tag || device.qr_code}
                      </span>
                      <span
                        className="text-[10px] font-semibold uppercase tracking-wide px-2 py-0.5 rounded-full border"
                        style={{
                          color: DEVICE_STATUS_COLORS[device.status],
                          backgroundColor: `${DEVICE_STATUS_COLORS[device.status]}14`,
                          borderColor: `${DEVICE_STATUS_COLORS[device.status]}40`,
                        }}
                      >
                        {titleCase(device.status)}
                      </span>
                    </div>
                    <p className="text-xs text-ink-soft mt-1">
                      {[device.brand, device.model].filter(Boolean).join(' ') || 'Unnamed device'}
                    </p>
                    <p className="text-xs text-ink-muted mt-1">
                      {device.parts_remaining ?? 0} part(s) remaining
                    </p>
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="lg:col-span-2 space-y-6">
            {selectedDevice ? (
              <>
                <div className="glass-card p-6">
                  <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
                    <div>
                      <h2 className="font-display text-xl text-ink">
                        {selectedDevice.asset_tag || selectedDevice.qr_code}
                      </h2>
                      <p className="text-sm text-ink-soft mt-1">
                        {[selectedDevice.brand, selectedDevice.model].filter(Boolean).join(' ')}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => navigate(`/device/${selectedDevice.qr_code}`)}
                      className="btn-outline w-fit text-sm"
                    >
                      View Device Record
                    </button>
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 mt-5 text-sm">
                    <div>
                      <span className="block text-ink-soft text-xs">Serial Number</span>
                      <span className="font-mono text-ink">{selectedDevice.serial_number || '—'}</span>
                    </div>
                    <div>
                      <span className="block text-ink-soft text-xs">Location</span>
                      <span className="text-ink">{selectedDevice.location || '—'}</span>
                    </div>
                    <div>
                      <span className="block text-ink-soft text-xs">Current Handler</span>
                      <span className="text-ink">{selectedDevice.current_handler_name || 'Unassigned'}</span>
                    </div>
                    <div>
                      <span className="block text-ink-soft text-xs">Marked Dead</span>
                      <span className="text-ink">{formatDate(selectedDevice.marked_dead_at)}</span>
                    </div>
                    <div>
                      <span className="block text-ink-soft text-xs">Available Parts</span>
                      <span className="text-ink">{partStats.available}</span>
                    </div>
                    <div>
                      <span className="block text-ink-soft text-xs">Recovered Parts</span>
                      <span className="text-ink">{partStats.recycled}</span>
                    </div>
                  </div>

                  {selectedDevice.notes && (
                    <div className="mt-5">
                      <span className="block text-ink-soft text-xs mb-1">Fault Reported</span>
                      <p className="text-sm text-ink bg-surface-soft border border-line rounded-lg p-3">
                        {selectedDevice.notes}
                      </p>
                    </div>
                  )}
                </div>

                <div className="glass-card p-6">
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
                    <h2 className="font-display text-lg text-ink">Parts Inventory</h2>
                    <button
                      type="button"
                      onClick={() => setShowAddPart((current) => !current)}
                      className="btn-outline text-sm w-fit flex items-center gap-2"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                      </svg>
                      Add Part
                    </button>
                  </div>

                  {parts.length > 0 && (
                    <div className="mb-5">
                      <div className="flex items-center justify-between text-xs text-ink-soft mb-2">
                        <span>Recycling progress</span>
                        <span className="font-medium text-ink">
                          {parts.length - partStats.available} of {parts.length} cleared
                        </span>
                      </div>
                      <div className="h-2 w-full rounded-full bg-surface-soft border border-line">
                        <div
                          className="h-2 rounded-full bg-primary transition-all"
                          style={{
                            width: `${parts.length ? ((parts.length - partStats.available) / parts.length) * 100 : 0}%`,
                          }}
                        />
                      </div>
                    </div>
                  )}

                  {showAddPart && (
                    <form onSubmit={addPart} className="mb-5 rounded-xl border border-line bg-surface-soft p-4 grid gap-3 sm:grid-cols-[180px_1fr_auto]">
                      <select
                        value={newPart.part_type}
                        onChange={(event) => setNewPart({ ...newPart, part_type: event.target.value })}
                        className="rounded-lg border border-line bg-white px-3 py-2 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-primary"
                      >
                        {PART_TYPES.map((type) => (
                          <option key={type} value={type}>
                            {titleCase(type)}
                          </option>
                        ))}
                      </select>
                      <input
                        type="text"
                        value={newPart.part_description}
                        onChange={(event) => setNewPart({ ...newPart, part_description: event.target.value })}
                        placeholder="Part description or specification"
                        className="rounded-lg border border-line bg-white px-3 py-2 text-sm text-ink placeholder:text-ink-soft focus:outline-none focus:ring-2 focus:ring-primary"
                      />
                      <button type="submit" disabled={saving} className="btn-primary text-sm disabled:opacity-50">
                        Save
                      </button>
                    </form>
                  )}

                  {partsLoading ? (
                    <p className="text-ink-soft text-sm">Loading parts...</p>
                  ) : parts.length === 0 ? (
                    <p className="text-ink-soft text-sm">No parts recorded for this device yet.</p>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full min-w-[640px] text-left text-sm">
                        <thead className="bg-surface-soft border-y border-line">
                          <tr>
                            <th className="px-4 py-3 font-medium text-ink-soft">Part</th>
                            <th className="px-4 py-3 font-medium text-ink-soft">Description</th>
                            <th className="px-4 py-3 font-medium text-ink-soft">Status</th>
                            <th className="px-4 py-3 font-medium text-ink-soft">Handled By</th>
                            <th className="px-4 py-3 font-medium text-ink-soft">Action</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-line">
                          {parts.map((part) => {
                            const colors = PART_STATUS_COLORS[part.status] || PART_STATUS_COLORS.available

                            return (
                              <tr key={part.id}>
                                <td className="px-4 py-3 text-ink font-medium">{titleCase(part.part_type)}</td>
                                <td className="px-4 py-3 text-ink-soft">{part.part_description || '—'}</td>
                                <td className="px-4 py-3">
                                  <span
                                    className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium border"
                                    style={{
                                      color: colors.color,
                                      backgroundColor: colors.background,
                                      borderColor: colors.border,
                                    }}
                                  >
                                    {titleCase(part.status)}
                                  </span>
                                </td>
                                <td className="px-4 py-3 text-ink-soft">
                                  {part.recycler?.full_name || '—'}
                                  {part.recycled_at && (
                                    <span className="block text-xs text-ink-muted mt-0.5">
                                      {formatDate(part.recycled_at)}
                                    </span>
                                  )}
                                </td>
                                <td className="px-4 py-3">
                                  {selectedDevice.status === 'dead' ? (
                                    <select
                                      value={part.status}
                                      onChange={(event) => updatePartStatus(part.id, event.target.value)}
                                      disabled={saving}
                                      className="rounded-lg border border-line bg-white px-2 py-1.5 text-xs text-ink focus:outline-none focus:ring-2 focus:ring-primary disabled:opacity-50"
                                    >
                                      {PART_STATUSES.map((status) => (
                                        <option key={status.value} value={status.value}>
                                          {status.label}
                                        </option>
                                      ))}
                                    </select>
                                  ) : (
                                    <span className="text-xs text-ink-muted">Locked</span>
                                  )}
                                </td>
                              </tr>
                            )
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              </>
            ) : (
              <div className="glass-card p-10 text-center">
                <p className="text-ink-soft">Select a device to review and recycle its parts.</p>
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  )
}
