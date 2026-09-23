import { useState, useEffect, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts'
import { supabase } from '../lib/supabase'
import Navbar from '../components/Navbar'

const STATUS_COLORS = {
  dead: '#dc2626',
  in_repair: '#f59e0b',
  repaired: '#006B0A',
  active: '#006B0A',
  disposed: '#6b7280',
  stripped: '#6b7280',
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

  const stats = useMemo(() => {
    const total = devices.length
    const dead = devices.filter((d) => d.status === 'dead').length
    const inRepair = devices.filter((d) => d.status === 'in_repair').length
    const repaired = devices.filter((d) => d.status === 'repaired' || d.status === 'active').length
    const stripped = devices.filter((d) => d.status === 'stripped').length

    const statusData = [
      { name: 'Dead', value: dead, color: STATUS_COLORS.dead },
      { name: 'In Repair', value: inRepair, color: STATUS_COLORS.in_repair },
      { name: 'Repaired/Active', value: repaired, color: STATUS_COLORS.repaired },
      { name: 'Stripped', value: stripped, color: STATUS_COLORS.stripped },
    ].filter((d) => d.value > 0)

    return { total, dead, inRepair, repaired, stripped, statusData }
  }, [devices])

  const filtered = devices.filter((device) => {
    const matchesSearch =
      !search ||
      device.qr_code?.toLowerCase().includes(search.toLowerCase()) ||
      device.asset_tag?.toLowerCase().includes(search.toLowerCase()) ||
      device.serial_number?.toLowerCase().includes(search.toLowerCase()) ||
      device.brand?.toLowerCase().includes(search.toLowerCase()) ||
      device.model?.toLowerCase().includes(search.toLowerCase())

    const matchesStatus = statusFilter === 'all' || device.status === statusFilter

    return matchesSearch && matchesStatus
  })

  const insights = useMemo(() => {
    const recentActions = devices.filter((d) => d.last_action_at && new Date(d.last_action_at) > new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)).length
    const needsAttention = devices.filter((d) => d.status === 'dead' && !d.current_handler_name).length
    const inProgress = devices.filter((d) => d.status === 'in_repair').length
    return { recentActions, needsAttention, inProgress }
  }, [devices])

  return (
    <div className="min-h-dvh bg-surface">
      <Navbar />

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="fade-in-up space-y-6">
          <div>
            <h1 className="font-display text-3xl text-ink mb-2">Device Registry</h1>
            <p className="text-ink-soft">Track and manage dead laptops through their lifecycle</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="tag-clip p-6 card-hover">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-ink-soft text-sm">Total Devices</p>
                  <p className="text-3xl font-bold text-ink mt-1">{stats.total}</p>
                </div>
                <div className="w-12 h-12 rounded-lg bg-gradient-to-br from-primary to-gradient-end flex items-center justify-center">
                  <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 3v2m6-2v2M9 19v2m6-2v2M5 9H3m2 6H3m18-6h-2m2 6h-2M7 19h10a2 2 0 002-2V7a2 2 0 00-2-2H7a2 2 0 00-2 2v10a2 2 0 002 2zM9 9h6v6H9V9z" />
                  </svg>
                </div>
              </div>
            </div>

            <div className="tag-clip p-6 card-hover">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-ink-soft text-sm">Dead</p>
                  <p className="text-3xl font-bold text-dead mt-1">{stats.dead}</p>
                </div>
                <div className="w-12 h-12 rounded-lg bg-red-100 flex items-center justify-center">
                  <svg className="w-6 h-6 text-dead" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                  </svg>
                </div>
              </div>
            </div>

            <div className="tag-clip p-6 card-hover">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-ink-soft text-sm">In Repair</p>
                  <p className="text-3xl font-bold text-repair mt-1">{stats.inRepair}</p>
                </div>
                <div className="w-12 h-12 rounded-lg bg-amber-100 flex items-center justify-center">
                  <svg className="w-6 h-6 text-repair" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                  </svg>
                </div>
              </div>
            </div>

            <div className="tag-clip p-6 card-hover">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-ink-soft text-sm">Active</p>
                  <p className="text-3xl font-bold text-alive mt-1">{stats.repaired}</p>
                </div>
                <div className="w-12 h-12 rounded-lg bg-primary/10 flex items-center justify-center">
                  <svg className="w-6 h-6 text-alive" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </div>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="tag-clip p-6 lg:col-span-1">
              <h2 className="font-display text-lg text-ink mb-4">Status Distribution</h2>
              {stats.statusData.length > 0 ? (
                <ResponsiveContainer width="100%" height={250}>
                  <PieChart>
                    <Pie
                      data={stats.statusData}
                      cx="50%"
                      cy="50%"
                      labelLine={false}
                      label={({ name, percent }) => `${name}: ${(percent * 100).toFixed(0)}%`}
                      outerRadius={80}
                      fill="#8884d8"
                      dataKey="value"
                    >
                      {stats.statusData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip />
                  </PieChart>
                </ResponsiveContainer>
              ) : (
                <p className="text-ink-soft text-center py-8">No data available</p>
              )}
            </div>

            <div className="tag-clip p-6 lg:col-span-2">
              <h2 className="font-display text-lg text-ink mb-4">Analysis Insights</h2>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="bg-surface-soft rounded-lg p-4 border border-line">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                      <svg className="w-5 h-5 text-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
                      </svg>
                    </div>
                    <div>
                      <p className="text-ink-soft text-xs">Recent Activity</p>
                      <p className="text-lg font-bold text-ink">{insights.recentActions}</p>
                      <p className="text-xs text-ink-soft">Last 7 days</p>
                    </div>
                  </div>
                </div>

                <div className="bg-surface-soft rounded-lg p-4 border border-line">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-lg bg-red-50 flex items-center justify-center">
                      <svg className="w-5 h-5 text-dead" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                      </svg>
                    </div>
                    <div>
                      <p className="text-ink-soft text-xs">Needs Attention</p>
                      <p className="text-lg font-bold text-ink">{insights.needsAttention}</p>
                      <p className="text-xs text-ink-soft">Unassigned dead</p>
                    </div>
                  </div>
                </div>

                <div className="bg-surface-soft rounded-lg p-4 border border-line">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-lg bg-amber-50 flex items-center justify-center">
                      <svg className="w-5 h-5 text-repair" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                    </div>
                    <div>
                      <p className="text-ink-soft text-xs">In Progress</p>
                      <p className="text-lg font-bold text-ink">{insights.inProgress}</p>
                      <p className="text-xs text-ink-soft">Being repaired</p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="tag-clip p-6">
            <div className="flex flex-col sm:flex-row gap-4 mb-6">
              <div className="flex-1">
                <input
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search by QR, asset tag, serial, brand, model..."
                  className="w-full rounded-lg border border-line bg-surface px-4 py-2 text-ink placeholder:text-ink-soft focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
                />
              </div>
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="rounded-lg border border-line bg-surface px-4 py-2 text-ink focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
              >
                <option value="all">All Statuses</option>
                <option value="dead">Dead</option>
                <option value="in_repair">In Repair</option>
                <option value="repaired">Repaired</option>
                <option value="active">Active</option>
                <option value="disposed">Disposed</option>
                <option value="stripped">Stripped</option>
              </select>
              <button
                onClick={() => navigate('/scan')}
                className="btn-primary flex items-center gap-2"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v1m6 11h2m-6 0h-2v4m0-11v3m0 0h.01M12 12h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                Scan Device
              </button>
              <button
                onClick={() => setShowAddModal(true)}
                className="rounded-lg border border-line px-4 py-2 text-sm font-medium text-ink hover:bg-surface-soft transition-colors flex items-center gap-2"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
                Add Device
              </button>
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
                <table className="w-full text-left text-sm">
                  <thead className="bg-surface-soft border-b border-line">
                    <tr>
                      <th className="px-4 py-3 font-medium text-ink-soft">QR Code</th>
                      <th className="px-4 py-3 font-medium text-ink-soft">Asset Tag</th>
                      <th className="px-4 py-3 font-medium text-ink-soft">Device</th>
                      <th className="px-4 py-3 font-medium text-ink-soft">Status</th>
                      <th className="px-4 py-3 font-medium text-ink-soft">Current Handler</th>
                      <th className="px-4 py-3 font-medium text-ink-soft">Location</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line">
                    {filtered.map((device) => (
                      <tr
                        key={device.id}
                        onClick={() => navigate(`/device/${device.qr_code}`)}
                        className="hover:bg-surface-soft cursor-pointer transition-colors"
                      >
                        <td className="px-4 py-3 font-mono text-xs text-ink">{device.qr_code}</td>
                        <td className="px-4 py-3 font-mono text-xs text-ink">{device.asset_tag}</td>
                        <td className="px-4 py-3">
                          <div className="text-ink">{device.brand} {device.model}</div>
                          <div className="text-ink-soft text-xs font-mono">{device.serial_number}</div>
                        </td>
                        <td className="px-4 py-3">
                          <span
                            className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-surface-soft border border-line`}
                            style={{ color: STATUS_COLORS[device.status] || '#6b7280' }}
                          >
                            {STATUS_LABELS[device.status] || device.status?.replace('_', ' ')}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-ink">{device.current_handler_name || '—'}</td>
                        <td className="px-4 py-3 text-ink-soft">{device.location || '—'}</td>
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
          <div className="tag-clip w-full max-w-2xl p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-display text-xl text-ink">Add New Device</h3>
              <button
                onClick={() => setShowAddModal(false)}
                className="text-ink-soft hover:text-ink"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {error && <p className="text-dead text-sm mb-4">{error}</p>}

            <form onSubmit={handleAddDevice} className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-ink mb-1">QR Code *</label>
                <input
                  type="text"
                  value={form.qr_code}
                  onChange={(e) => setForm({ ...form, qr_code: e.target.value })}
                  required
                  placeholder="e.g. QR-013"
                  className="w-full rounded-lg border border-line bg-surface px-3 py-2 text-ink placeholder:text-ink-soft focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-ink mb-1">Asset Tag</label>
                <input
                  type="text"
                  value={form.asset_tag}
                  onChange={(e) => setForm({ ...form, asset_tag: e.target.value })}
                  placeholder="e.g. ASSET-013"
                  className="w-full rounded-lg border border-line bg-surface px-3 py-2 text-ink placeholder:text-ink-soft focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-ink mb-1">Serial Number</label>
                <input
                  type="text"
                  value={form.serial_number}
                  onChange={(e) => setForm({ ...form, serial_number: e.target.value })}
                  placeholder="e.g. SN-DELL-013"
                  className="w-full rounded-lg border border-line bg-surface px-3 py-2 text-ink placeholder:text-ink-soft focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-ink mb-1">Brand</label>
                <input
                  type="text"
                  value={form.brand}
                  onChange={(e) => setForm({ ...form, brand: e.target.value })}
                  placeholder="e.g. Dell"
                  className="w-full rounded-lg border border-line bg-surface px-3 py-2 text-ink placeholder:text-ink-soft focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-ink mb-1">Model</label>
                <input
                  type="text"
                  value={form.model}
                  onChange={(e) => setForm({ ...form, model: e.target.value })}
                  placeholder="e.g. Latitude 5520"
                  className="w-full rounded-lg border border-line bg-surface px-3 py-2 text-ink placeholder:text-ink-soft focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-ink mb-1">Status</label>
                <select
                  value={form.status}
                  onChange={(e) => setForm({ ...form, status: e.target.value })}
                  className="w-full rounded-lg border border-line bg-surface px-3 py-2 text-ink focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
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
                  className="w-full rounded-lg border border-line bg-surface px-3 py-2 text-ink placeholder:text-ink-soft focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
                />
              </div>

              <div className="sm:col-span-2">
                <label className="block text-sm font-medium text-ink mb-1">Notes</label>
                <textarea
                  value={form.notes}
                  onChange={(e) => setForm({ ...form, notes: e.target.value })}
                  rows={2}
                  placeholder="Optional details about this device"
                  className="w-full rounded-lg border border-line bg-surface px-3 py-2 text-ink placeholder:text-ink-soft focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent resize-none"
                />
              </div>

              <div className="sm:col-span-2 flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="flex-1 rounded-lg border border-line px-4 py-2 text-sm font-medium text-ink hover:bg-surface-soft transition-colors"
                >
                  Cancel
                </button>
                <button type="submit" className="flex-1 btn-primary">
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
