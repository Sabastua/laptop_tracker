import { useState, useEffect, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts'
import { supabase } from '../lib/supabase'
import Navbar from '../components/Navbar'

const STATUS_COLORS = {
  active: '#10b981',
  repaired: '#6366f1',
  in_repair: '#f59e0b',
  dead: '#ef4444',
  stripped: '#64748b',
  disposed: '#94a3b8',
}

const STATUS_FILTERS = [
  { value: 'all', label: 'All Devices' },
  { value: 'dead', label: 'Dead' },
  { value: 'in_repair', label: 'In Repair' },
  { value: 'repaired', label: 'Repaired' },
  { value: 'stripped', label: 'Stripped' },
  { value: 'active', label: 'Active' },
  { value: 'disposed', label: 'Disposed' },
]

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

const STATUS_LABELS = {
  dead: 'Dead',
  in_repair: 'In Repair',
  repaired: 'Repaired',
  active: 'Active',
  disposed: 'Disposed',
  stripped: 'Stripped',
}

export default function Dashboard() {
  const navigate = useNavigate()
  const [devices, setDevices] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [showAddModal, setShowAddModal] = useState(false)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [scanValue, setScanValue] = useState('')
  const [scanning, setScanning] = useState(false)
  const [scanError, setScanError] = useState('')
  const [scannedDevice, setScannedDevice] = useState(null)
  const [form, setForm] = useState({
    qr_code: '',
    asset_tag: '',
    serial_number: '',
    brand: '',
    model: '',
    status: 'dead',
    location: '',
    notes: '',
  })

  useEffect(() => {
    fetchDevices()
  }, [])

  const fetchDevices = async () => {
    setLoading(true)
    const { data, error } = await supabase
      .from('device_current_state')
      .select('*')
      .order('marked_dead_at', { ascending: false })

    if (error) {
      console.error('Failed to fetch devices:', error)
      setError(error.message)
    } else {
      setDevices(data || [])
    }
    setLoading(false)
  }

  const handleAddDevice = async (e) => {
    e.preventDefault()
    setError('')

    if (!form.qr_code) {
      setError('QR code is required')
      return
    }

    const { error: insertError } = await supabase
      .from('devices')
      .insert({
        qr_code: form.qr_code,
        asset_tag: form.asset_tag || null,
        serial_number: form.serial_number || null,
        brand: form.brand || null,
        model: form.model || null,
        status: form.status,
        location: form.location || null,
        notes: form.notes || null,
        marked_dead_at: form.status === 'dead' ? new Date().toISOString() : null,
      })

    if (insertError) {
      setError(insertError.message)
    } else {
      setForm({
        qr_code: '',
        asset_tag: '',
        serial_number: '',
        brand: '',
        model: '',
        status: 'dead',
        location: '',
        notes: '',
      })
      setShowAddModal(false)
      fetchDevices()
    }
  }

  const handleDeviceScan = async (event) => {
    event.preventDefault()
    const code = scanValue.trim()

    if (!code) return

    if (!/^[a-zA-Z0-9._/: -]+$/.test(code)) {
      setScanError('Enter a valid serial number or asset tag.')
      setScannedDevice(null)
      return
    }

    setScanning(true)
    setScanError('')
    setScannedDevice(null)

    const { data, error: lookupError } = await supabase
      .from('device_current_state')
      .select('id, qr_code, asset_tag, serial_number, brand, model, status, current_handler_name')
      .or(`asset_tag.eq.${code},serial_number.eq.${code}`)
      .limit(1)
      .maybeSingle()

    if (lookupError) {
      setScanError(lookupError.message)
    } else if (!data) {
      setScanError('No device matches that serial number or asset tag.')
    } else {
      setScannedDevice(data)
      setScanValue('')
    }

    setScanning(false)
  }

  const stats = useMemo(() => {
    const countStatus = (status) => devices.filter((device) => device.status === status).length
    const active = countStatus('active')
    const repaired = countStatus('repaired')
    const inRepair = countStatus('in_repair')
    const dead = countStatus('dead')
    const stripped = countStatus('stripped')
    const disposed = countStatus('disposed')

    const statusData = [
      { name: 'Active', value: active, color: STATUS_COLORS.active },
      { name: 'Repaired', value: repaired, color: STATUS_COLORS.repaired },
      { name: 'In Repair', value: inRepair, color: STATUS_COLORS.in_repair },
      { name: 'Dead', value: dead, color: STATUS_COLORS.dead },
      { name: 'Stripped', value: stripped, color: STATUS_COLORS.stripped },
      { name: 'Disposed', value: disposed, color: STATUS_COLORS.disposed },
    ]

    return {
      total: devices.length,
      dead,
      inRepair,
      repaired,
      stripped,
      active,
      disposed,
      statusData,
    }
  }, [devices])

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase()

    return devices.filter((device) => {
      const searchableValues = [
        device.asset_tag,
        device.serial_number,
        device.brand,
        device.model,
        device.current_handler_name,
      ]

      const matchesSearch =
        !query ||
        searchableValues.some((value) => value?.toLowerCase().includes(query))
      const matchesStatus = statusFilter === 'all' || device.status === statusFilter

      return matchesSearch && matchesStatus
    })
  }, [devices, search, statusFilter])

  return (
    <div className="min-h-dvh bg-surface">
      <Navbar />

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="fade-in-up space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="font-display text-3xl text-ink mb-2">Device Registry</h1>
              <p className="text-ink-soft">Track and manage dead laptops through their lifecycle</p>
            </div>
            <button
              onClick={() => setShowAddModal(true)}
              className="btn-primary flex items-center gap-2 shadow-lg hover:shadow-xl"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              Add Device
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="stat-card card-hover">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-ink-soft text-sm font-medium">Total Devices</p>
                  <p className="text-3xl font-bold text-ink mt-1">{stats.total}</p>
                </div>
                <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-primary to-gradient-end flex items-center justify-center">
                  <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 3v2m6-2v2M9 19v2m6-2v2M5 9H3m2 6H3m18-6h-2m2 6h-2M7 19h10a2 2 0 002-2V7a2 2 0 00-2-2H7a2 2 0 00-2 2v10a2 2 0 002 2zM9 9h6v6H9V9z" />
                  </svg>
                </div>
              </div>
            </div>

            <div className="stat-card card-hover">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-ink-soft text-sm font-medium">Dead</p>
                  <p className="text-3xl font-bold text-dead mt-1">{stats.dead}</p>
                </div>
                <div className="w-12 h-12 rounded-xl bg-dead-soft flex items-center justify-center">
                  <svg className="w-6 h-6 text-dead" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                  </svg>
                </div>
              </div>
            </div>

            <div className="stat-card card-hover">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-ink-soft text-sm font-medium">In Repair</p>
                  <p className="text-3xl font-bold text-repair mt-1">{stats.inRepair}</p>
                </div>
                <div className="w-12 h-12 rounded-xl bg-repair-soft flex items-center justify-center">
                  <svg className="w-6 h-6 text-repair" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                  </svg>
                </div>
              </div>
            </div>

            <div className="stat-card card-hover">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-ink-soft text-sm font-medium">Active</p>
                  <p className="text-3xl font-bold text-alive mt-1">{stats.active}</p>
                </div>
                <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center">
                  <svg className="w-6 h-6 text-alive" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </div>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
            <div className="glass-card p-6 lg:col-span-2">
              <div className="flex items-start justify-between gap-4 mb-2">
                <div>
                  <h2 className="font-display text-lg text-ink">Status Distribution</h2>
                  <p className="text-sm text-ink-soft mt-1">Current device status breakdown</p>
                </div>
                <span className="text-xs font-medium text-ink-soft bg-surface-soft border border-line rounded-full px-3 py-1">
                  {stats.total} total
                </span>
              </div>

              {stats.total > 0 ? (
                <>
                  <div className="relative h-64">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={stats.statusData}
                          cx="50%"
                          cy="50%"
                          innerRadius={68}
                          outerRadius={98}
                          paddingAngle={3}
                          dataKey="value"
                          stroke="none"
                        >
                          {stats.statusData.map((entry) => (
                            <Cell key={entry.name} fill={entry.color} />
                          ))}
                        </Pie>
                        <Tooltip formatter={(value, name) => [`${value} devices`, name]} />
                      </PieChart>
                    </ResponsiveContainer>
                    <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                      <span className="text-3xl font-bold text-ink">{stats.total}</span>
                      <span className="text-xs text-ink-soft">Devices</span>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mt-2">
                    {stats.statusData.map((item) => (
                      <button
                        key={item.name}
                        type="button"
                        onClick={() => {
                          const filter = STATUS_FILTERS.find((entry) => entry.label === item.name)
                          if (filter) setStatusFilter(filter.value)
                        }}
                        className="flex items-center justify-between gap-2 rounded-lg border border-line bg-surface-soft px-3 py-2 text-left hover:bg-white transition-colors"
                      >
                        <span className="flex items-center gap-2 text-xs font-medium text-ink-soft">
                          <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: item.color }} />
                          {item.name}
                        </span>
                        <span className="text-xs font-bold text-ink">{item.value}</span>
                      </button>
                    ))}
                  </div>
                </>
              ) : (
                <p className="text-ink-soft text-center py-16">No device data available</p>
              )}
            </div>

            <div className="glass-card p-6 lg:col-span-3">
              <div className="flex items-start justify-between gap-4 mb-5">
                <div>
                  <h2 className="font-display text-lg text-ink">Device Analysis</h2>
                  <p className="text-sm text-ink-soft mt-1">Live lifecycle counts from the registry</p>
                </div>
                <span className="text-xs font-medium text-primary bg-primary/10 rounded-full px-3 py-1">
                  Live data
                </span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {[
                  { label: 'Retired Devices', value: stats.dead, color: STATUS_COLORS.dead, detail: 'Marked dead' },
                  { label: 'Recovered Devices', value: stats.repaired, color: STATUS_COLORS.repaired, detail: 'Repaired' },
                  { label: 'In Repair', value: stats.inRepair, color: STATUS_COLORS.in_repair, detail: 'Currently being serviced' },
                  { label: 'Active Devices', value: stats.active, color: STATUS_COLORS.active, detail: 'Currently in use' },
                ].map((item) => (
                  <button
                    key={item.label}
                    type="button"
                    onClick={() => setStatusFilter(item.label === 'Retired Devices' ? 'dead' : item.label === 'Recovered Devices' ? 'repaired' : item.label === 'In Repair' ? 'in_repair' : 'active')}
                    className="text-left rounded-xl border border-line bg-surface-soft p-4 hover:bg-white hover:border-primary/30 transition-colors"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-sm font-medium text-ink-soft">{item.label}</span>
                      <span className="w-3 h-3 rounded-full" style={{ backgroundColor: item.color }} />
                    </div>
                    <p className="text-3xl font-bold text-ink mt-3">{item.value}</p>
                    <p className="text-xs text-ink-soft mt-1">{item.detail}</p>
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="glass-card p-6">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-5">
              <div>
                <h2 className="font-display text-lg text-ink">Serial / Asset Tag Scanner</h2>
                <p className="text-sm text-ink-soft mt-1">
                  Use a connected scanner or enter a serial number or asset tag
                </p>
              </div>
              <span className="inline-flex w-fit items-center gap-2 text-xs font-medium text-ink-soft bg-surface-soft border border-line rounded-full px-3 py-1.5">
                <span className="w-2 h-2 rounded-full bg-alive" />
                Scanner ready
              </span>
            </div>

            <form onSubmit={handleDeviceScan} className="flex flex-col sm:flex-row gap-3">
              <div className="relative flex-1">
                <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-ink-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7V5a2 2 0 012-2h2m10 0h2a2 2 0 012 2v2m0 10v2a2 2 0 01-2 2h-2M7 21H5a2 2 0 01-2-2v-2m0-10V5m14 7v7M7 12h10" />
                </svg>
                <input
                  type="text"
                  value={scanValue}
                  onChange={(event) => {
                    setScanValue(event.target.value)
                    setScanError('')
                    setScannedDevice(null)
                  }}
                  placeholder="Scan or enter serial number / asset tag"
                  autoComplete="off"
                  className="w-full rounded-lg border border-line bg-surface px-4 py-3 pl-10 text-ink placeholder:text-ink-soft focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent transition-colors"
                />
              </div>
              <button
                type="submit"
                disabled={scanning || !scanValue.trim()}
                className="btn-primary flex items-center justify-center gap-2 px-6 disabled:opacity-50"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7V5a2 2 0 012-2h2m10 0h2a2 2 0 012 2v2m0 10v2a2 2 0 01-2 2h-2M7 21H5a2 2 0 01-2-2v-2m0-10V5m14 7v7M7 12h10" />
                </svg>
                {scanning ? 'Looking up...' : 'Find Device'}
              </button>
            </form>

            {scanError && <p className="text-sm text-dead mt-3">{scanError}</p>}

            {scannedDevice && (
              <div className="mt-4 rounded-xl border border-primary/30 bg-primary/5 p-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <div className="flex items-center gap-4">
                  <div className="w-11 h-11 rounded-xl bg-primary/10 flex items-center justify-center text-primary">
                    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                  </div>
                  <div>
                    <p className="font-medium text-ink">
                      {scannedDevice.brand || 'Device'} {scannedDevice.model || ''}
                    </p>
                    <p className="text-xs text-ink-soft mt-1 font-mono">
                      {scannedDevice.asset_tag || scannedDevice.serial_number}
                    </p>
                  </div>
                  <span
                    className="inline-flex items-center rounded-full border border-line bg-white px-2.5 py-1 text-xs font-medium"
                    style={{ color: STATUS_COLORS[scannedDevice.status] || '#64748b' }}
                  >
                    {STATUS_LABELS[scannedDevice.status] || scannedDevice.status}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => navigate(`/device/${scannedDevice.qr_code}`)}
                  className="btn-outline whitespace-nowrap"
                >
                  View Device
                </button>
              </div>
            )}
          </div>

          <div className="glass-card p-6">
            <div className="flex flex-col sm:flex-row gap-3 mb-4">
              <div className="relative flex-1">
                <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-ink-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a8 8 0 11-16 0 8 8 0 0116 0z" />
                </svg>
                <input
                  type="search"
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Search asset tag, serial, device, or handler..."
                  className="w-full rounded-lg border border-line bg-surface px-4 py-2.5 pl-10 pr-10 text-ink placeholder:text-ink-soft focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent transition-colors"
                />
                {search && (
                  <button
                    type="button"
                    onClick={() => setSearch('')}
                    aria-label="Clear search"
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-ink-muted hover:text-ink"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                )}
              </div>
              <button
                type="button"
                onClick={() => setShowAddModal(true)}
                className="btn-outline flex items-center justify-center gap-2 whitespace-nowrap"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
                Add Device
              </button>
            </div>

            <div className="flex flex-wrap gap-2 mb-5">
              {STATUS_FILTERS.map((filter) => {
                const color = filter.value === 'all' ? '#0ea5e9' : STATUS_COLORS[filter.value]
                const count = filter.value === 'all'
                  ? stats.total
                  : filter.value === 'in_repair'
                    ? stats.inRepair
                    : stats[filter.value]
                const isActive = statusFilter === filter.value

                return (
                  <button
                    key={filter.value}
                    type="button"
                    onClick={() => setStatusFilter(filter.value)}
                    className="inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-xs font-medium transition-colors"
                    style={{
                      color: isActive ? color : '#475569',
                      backgroundColor: isActive ? `${color}14` : '#ffffff',
                      borderColor: isActive ? `${color}66` : '#e2e8f0',
                    }}
                  >
                    <span className="w-2 h-2 rounded-full" style={{ backgroundColor: color }} />
                    {filter.label}
                    <span className="rounded-full bg-white/80 px-1.5 py-0.5 text-[10px] font-bold">{count}</span>
                  </button>
                )
              })}
            </div>

            {error && (
              <div className="tag-clip p-4 bg-red-50 border-dead mb-4">
                <p className="text-dead text-sm">{error}</p>
              </div>
            )}
            {loading ? (
              <div className="p-8 text-center text-ink-soft">Loading devices...</div>
            ) : filtered.length === 0 ? (
              <div className="p-8 text-center text-ink-soft">No devices found.</div>
            ) : (
              <div className="overflow-x-auto">
                <div className="flex items-center justify-between gap-4 mb-3">
                  <h2 className="font-display text-lg text-ink">All Devices</h2>
                  <span className="text-xs text-ink-soft">
                    Showing {filtered.length} of {stats.total} devices
                  </span>
                </div>
                <table className="w-full min-w-[820px] text-left text-sm">
                  <thead className="bg-surface-soft border-y border-line">
                    <tr>
                      <th className="px-4 py-3 font-medium text-ink-soft">Asset Tag</th>
                      <th className="px-4 py-3 font-medium text-ink-soft">Device Name</th>
                      <th className="px-4 py-3 font-medium text-ink-soft">Status</th>
                      <th className="px-4 py-3 font-medium text-ink-soft">Handler</th>
                      <th className="px-4 py-3 font-medium text-ink-soft">Last Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line">
                    {filtered.map((device) => (
                      <tr
                        key={device.id}
                        onClick={() => navigate(`/device/${device.qr_code}`)}
                        className="hover:bg-surface-soft cursor-pointer transition-colors"
                      >
                        <td className="px-4 py-3 font-mono text-xs font-medium text-ink">
                          {device.asset_tag || '—'}
                        </td>
                        <td className="px-4 py-3">
                          <div className="font-medium text-ink">
                            {[device.brand, device.model].filter(Boolean).join(' ') || 'Unnamed device'}
                          </div>
                          <div className="text-ink-soft text-xs font-mono mt-0.5">
                            {device.serial_number || 'No serial number'}
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <span
                            className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium border"
                            style={{
                              color: STATUS_COLORS[device.status] || '#64748b',
                              backgroundColor: `${STATUS_COLORS[device.status] || '#64748b'}14`,
                              borderColor: `${STATUS_COLORS[device.status] || '#64748b'}40`,
                            }}
                          >
                            {STATUS_LABELS[device.status] || device.status?.replace('_', ' ')}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-ink">
                          {device.current_handler_name || <span className="text-ink-muted">Unassigned</span>}
                        </td>
                        <td className="px-4 py-3">
                          <div className="text-ink">{formatDate(device.last_action_at)}</div>
                          <div className="text-xs text-ink-soft mt-0.5 capitalize">
                            {device.last_action_type?.replaceAll('_', ' ') || 'No action recorded'}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </main>

      {showAddModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="glass-card w-full max-w-3xl p-6">
            <div className="flex items-center justify-between mb-6">
              <div>
                <h3 className="font-display text-xl text-ink">Add New Device</h3>
                <p className="text-sm text-ink-soft mt-1">Register a new laptop in the system</p>
              </div>
              <button
                onClick={() => setShowAddModal(false)}
                className="text-ink-soft hover:text-ink rounded-lg p-1 hover:bg-surface-soft transition-colors"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {error && <p className="text-dead text-sm mb-4">{error}</p>}

            <form onSubmit={handleAddDevice} className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="sm:col-span-2">
                <label className="block text-sm font-medium text-ink mb-1">QR Code *</label>
                <input
                  type="text"
                  value={form.qr_code}
                  onChange={(e) => setForm({ ...form, qr_code: e.target.value })}
                  required
                  placeholder="e.g. QR-013"
                  className="w-full rounded-lg border border-line bg-surface px-3 py-2.5 text-ink placeholder:text-ink-soft focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent transition-colors"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-ink mb-1">Asset Tag</label>
                <input
                  type="text"
                  value={form.asset_tag}
                  onChange={(e) => setForm({ ...form, asset_tag: e.target.value })}
                  placeholder="e.g. ASSET-013"
                  className="w-full rounded-lg border border-line bg-surface px-3 py-2.5 text-ink placeholder:text-ink-soft focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent transition-colors"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-ink mb-1">Serial Number</label>
                <input
                  type="text"
                  value={form.serial_number}
                  onChange={(e) => setForm({ ...form, serial_number: e.target.value })}
                  placeholder="e.g. SN-DELL-013"
                  className="w-full rounded-lg border border-line bg-surface px-3 py-2.5 text-ink placeholder:text-ink-soft focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent transition-colors"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-ink mb-1">Brand</label>
                <input
                  type="text"
                  value={form.brand}
                  onChange={(e) => setForm({ ...form, brand: e.target.value })}
                  placeholder="e.g. Dell"
                  className="w-full rounded-lg border border-line bg-surface px-3 py-2.5 text-ink placeholder:text-ink-soft focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent transition-colors"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-ink mb-1">Model</label>
                <input
                  type="text"
                  value={form.model}
                  onChange={(e) => setForm({ ...form, model: e.target.value })}
                  placeholder="e.g. Latitude 5520"
                  className="w-full rounded-lg border border-line bg-surface px-3 py-2.5 text-ink placeholder:text-ink-soft focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent transition-colors"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-ink mb-1">Status</label>
                <select
                  value={form.status}
                  onChange={(e) => setForm({ ...form, status: e.target.value })}
                  className="w-full rounded-lg border border-line bg-surface px-3 py-2.5 text-ink focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent transition-colors"
                >
                  <option value="dead">Dead</option>
                  <option value="in_repair">In Repair</option>
                  <option value="repaired">Repaired</option>
                  <option value="active">Active</option>
                  <option value="disposed">Disposed</option>
                  <option value="stripped">Stripped</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-ink mb-1">Location</label>
                <input
                  type="text"
                  value={form.location}
                  onChange={(e) => setForm({ ...form, location: e.target.value })}
                  placeholder="e.g. Workshop A"
                  className="w-full rounded-lg border border-line bg-surface px-3 py-2.5 text-ink placeholder:text-ink-soft focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent transition-colors"
                />
              </div>

              <div className="sm:col-span-2">
                <label className="block text-sm font-medium text-ink mb-1">Notes</label>
                <textarea
                  value={form.notes}
                  onChange={(e) => setForm({ ...form, notes: e.target.value })}
                  rows={2}
                  placeholder="Optional details about this device"
                  className="w-full rounded-lg border border-line bg-surface px-3 py-2.5 text-ink placeholder:text-ink-soft focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent resize-none transition-colors"
                />
              </div>

              <div className="sm:col-span-2 flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="flex-1 btn-ghost"
                >
                  Cancel
                </button>
                <button type="submit" className="flex-1 btn-primary shadow-lg hover:shadow-xl transition-shadow">
                  Add Device
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
