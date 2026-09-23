import { useState, useEffect, useMemo } from 'react'
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts'
import { supabase } from '../lib/supabase'
import { useAuth } from '../hooks/useAuth'
import Navbar from '../components/Navbar'

const ROLES = [
  { value: 'engineer', label: 'Engineer' },
  { value: 'admin', label: 'Admin' },
]

const ROLE_COLORS = {
  admin: '#006B0A',
  engineer: '#008a10',
}

export default function Admin() {
  const { profile } = useAuth()
  const [engineers, setEngineers] = useState([])
  const [devices, setDevices] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [showAddModal, setShowAddModal] = useState(false)
  const [showBulkModal, setShowBulkModal] = useState(false)
  const [viewMode, setViewMode] = useState('cards')
  const [bulkText, setBulkText] = useState('')
  const [form, setForm] = useState({
    email: '',
    full_name: '',
    role: 'engineer',
  })

  useEffect(() => {
    Promise.all([fetchEngineers(), fetchDevices()])
  }, [])

  const fetchEngineers = async () => {
    const { data, error } = await supabase
      .from('allowed_engineers')
      .select('*')
      .order('email')

    if (error) {
      setError(error.message)
    } else {
      setEngineers(data || [])
    }
    setLoading(false)
  }

  const fetchDevices = async () => {
    const { data } = await supabase
      .from('device_current_state')
      .select('current_handler_id')

    setDevices(data || [])
  }

  const handleAdd = async (e) => {
    e.preventDefault()
    setError('')
    setSuccess('')

    if (!form.email || !form.full_name) {
      setError('Email and full name are required')
      return
    }

    const { error } = await supabase.from('allowed_engineers').insert({
      email: form.email.toLowerCase().trim(),
      full_name: form.full_name.trim(),
      role: form.role,
      added_by: profile.id,
    })

    if (error) {
      setError(error.message)
    } else {
      setSuccess(`Added ${form.email}`)
      setForm({ email: '', full_name: '', role: 'engineer' })
      setShowAddModal(false)
      fetchEngineers()
    }
  }

  const handleRemove = async (id, email) => {
    setError('')
    setSuccess('')

    const { error } = await supabase.from('allowed_engineers').delete().eq('id', id)

    if (error) {
      setError(error.message)
    } else {
      setSuccess(`Removed ${email}`)
      fetchEngineers()
    }
  }

  const handleBulkImport = async (e) => {
    e.preventDefault()
    setError('')
    setSuccess('')

    if (!bulkText.trim()) {
      setError('Please enter engineer data')
      return
    }

    const lines = bulkText.trim().split('\n').filter(line => line.trim())
    const parsedEngineers = []

    for (const line of lines) {
      const parts = line.split(',').map(p => p.trim())
      if (parts.length >= 2) {
        const email = parts[0]
        const full_name = parts[1]
        if (email && full_name) {
          parsedEngineers.push({
            email: email.toLowerCase(),
            full_name,
            role: 'engineer',
            added_by: profile.id,
          })
        }
      }
    }

    if (parsedEngineers.length === 0) {
      setError('No valid engineer entries found. Use format: email, full_name per line')
      return
    }

    const { error } = await supabase.from('allowed_engineers').insert(parsedEngineers)

    if (error) {
      setError(error.message)
    } else {
      setSuccess(`Added ${parsedEngineers.length} engineers`)
      setBulkText('')
      setShowBulkModal(false)
      fetchEngineers()
    }
  }

  const handleRoleChange = async (id, newRole) => {
    setError('')
    setSuccess('')

    const { error } = await supabase
      .from('allowed_engineers')
      .update({ role: newRole })
      .eq('id', id)

    if (error) {
      setError(error.message)
    } else {
      setSuccess(`Updated role to ${newRole}`)
      fetchEngineers()
    }
  }

  const stats = useMemo(() => {
    const total = engineers.length
    const admins = engineers.filter((e) => e.role === 'admin').length
    const regular = engineers.filter((e) => e.role === 'engineer').length

    const roleData = [
      { name: 'Admins', value: admins, color: ROLE_COLORS.admin },
      { name: 'Engineers', value: regular, color: ROLE_COLORS.engineer },
    ].filter((d) => d.value > 0)

    const handlerCounts = {}
    devices.forEach((d) => {
      if (d.current_handler_id) {
        handlerCounts[d.current_handler_id] = (handlerCounts[d.current_handler_id] || 0) + 1
      }
    })

    const engineersWithWorkload = engineers.map((eng) => ({
      ...eng,
      workload: handlerCounts[eng.id] || 0,
    }))

    return { total, admins, regular, roleData, engineersWithWorkload }
  }, [engineers, devices])

  return (
    <div className="min-h-dvh bg-surface">
      <Navbar />

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="fade-in-up space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="font-display text-3xl text-ink mb-2">Manage Engineers</h1>
              <p className="text-ink-soft">Add, remove, and manage engineer access</p>
            </div>
              <button
                onClick={() => setShowAddModal(true)}
                className="btn-primary flex items-center gap-2"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
                Add Engineer
              </button>
              <button
                onClick={() => setShowBulkModal(true)}
                className="rounded-lg border border-line px-4 py-2 text-sm font-medium text-ink hover:bg-surface-soft transition-colors flex items-center gap-2"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 7v10c0 1.1.9 2 2 2h12a2 2 0 002-2V7" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 11h4M10 15h4M10 7h4" />
                </svg>
                Bulk Import
              </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="tag-clip p-6 card-hover">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-ink-soft text-sm">Total Engineers</p>
                  <p className="text-3xl font-bold text-ink mt-1">{stats.total}</p>
                </div>
                <div className="w-12 h-12 rounded-lg bg-gradient-to-br from-primary to-gradient-end flex items-center justify-center">
                  <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 014 4 4 4 0 01-4 4 4 4 0 01-4-4 4 4 0 014-4zm0 0C14.5 3.5 16 4 17.5 4.5c1 .5 2 1.5 2.5 2.5.5 1 1 2.5 1 4.5 0 3-1 5.5-2 7.5-1 2-3 3.5-5 3.5s-4-1.5-5-3.5c-1-2-2-4.5-2-7.5 0-2 .5-3.5 1-4.5.5-1 1.5-2 2.5-2.5C8 4 9.5 3.5 12 4.354z" />
                  </svg>
                </div>
              </div>
            </div>

            <div className="tag-clip p-6 card-hover">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-ink-soft text-sm">Admins</p>
                  <p className="text-3xl font-bold text-primary mt-1">{stats.admins}</p>
                </div>
                <div className="w-12 h-12 rounded-lg bg-primary/10 flex items-center justify-center">
                  <svg className="w-6 h-6 text-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                  </svg>
                </div>
              </div>
            </div>

            <div className="tag-clip p-6 card-hover">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-ink-soft text-sm">Engineers</p>
                  <p className="text-3xl font-bold text-alive mt-1">{stats.regular}</p>
                </div>
                <div className="w-12 h-12 rounded-lg bg-primary/10 flex items-center justify-center">
                  <svg className="w-6 h-6 text-alive" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                  </svg>
                </div>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="tag-clip p-6 lg:col-span-1">
              <h2 className="font-display text-lg text-ink mb-4">Role Distribution</h2>
              {stats.roleData.length > 0 ? (
                <ResponsiveContainer width="100%" height={250}>
                  <PieChart>
                    <Pie
                      data={stats.roleData}
                      cx="50%"
                      cy="50%"
                      labelLine={false}
                      label={({ name, percent }) => `${name}: ${(percent * 100).toFixed(0)}%`}
                      outerRadius={80}
                      fill="#8884d8"
                      dataKey="value"
                    >
                      {stats.roleData.map((entry, index) => (
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
              <div className="flex items-center justify-between mb-4">
                <h2 className="font-display text-lg text-ink">Allowed Engineers ({engineers.length})</h2>
                <div className="flex gap-2">
                  <button
                    onClick={() => setViewMode('cards')}
                    className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                      viewMode === 'cards'
                        ? 'bg-primary text-white'
                        : 'bg-surface-soft text-ink-soft hover:bg-line'
                    }`}
                  >
                    Cards
                  </button>
                  <button
                    onClick={() => setViewMode('table')}
                    className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                      viewMode === 'table'
                        ? 'bg-primary text-white'
                        : 'bg-surface-soft text-ink-soft hover:bg-line'
                    }`}
                  >
                    Table
                  </button>
                </div>
              </div>

              {loading ? (
                <p className="text-ink-soft text-sm">Loading...</p>
              ) : engineers.length === 0 ? (
                <p className="text-ink-soft text-sm">No engineers added yet.</p>
              ) : viewMode === 'cards' ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {stats.engineersWithWorkload.map((eng) => (
                    <div key={eng.id} className="bg-surface-soft rounded-lg p-4 border border-line card-hover">
                      <div className="flex items-start justify-between mb-3">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-full bg-gradient-to-br from-primary to-gradient-end flex items-center justify-center text-white font-medium">
                            {eng.full_name?.[0]?.toUpperCase()}
                          </div>
                          <div>
                            <p className="font-medium text-ink">{eng.full_name}</p>
                            <p className="text-xs text-ink-soft font-mono">{eng.email}</p>
                          </div>
                        </div>
                        <span
                          className="px-2 py-1 rounded-full text-xs font-medium"
                          style={{
                            backgroundColor: eng.role === 'admin' ? '#006B0A20' : '#008a1020',
                            color: ROLE_COLORS[eng.role],
                          }}
                        >
                          {eng.role}
                        </span>
                      </div>
                      <div className="mb-3">
                        <div className="flex items-center justify-between text-sm mb-1">
                          <span className="text-ink-soft">Workload</span>
                          <span className="font-medium text-ink">{eng.workload} devices</span>
                        </div>
                        <div className="w-full bg-line rounded-full h-2">
                          <div
                            className="bg-gradient-to-r from-primary to-gradient-end h-2 rounded-full transition-all"
                            style={{
                              width: `${Math.min((eng.workload / Math.max(devices.length, 1)) * 100, 100)}%`,
                            }}
                          />
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <select
                          value={eng.role}
                          onChange={(e) => handleRoleChange(eng.id, e.target.value)}
                          className="flex-1 rounded-md border border-line bg-white px-2 py-1 text-xs text-ink focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
                        >
                          {ROLES.map((role) => (
                            <option key={role.value} value={role.value}>{role.label}</option>
                          ))}
                        </select>
                        <button
                          onClick={() => handleRemove(eng.id, eng.email)}
                          className="px-3 py-1 text-dead text-xs hover:bg-dead/10 rounded-md transition-colors"
                        >
                          Remove
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm">
                    <thead className="bg-surface-soft border-b border-line">
                      <tr>
                        <th className="px-4 py-3 font-medium text-ink-soft">Engineer</th>
                        <th className="px-4 py-3 font-medium text-ink-soft">Email</th>
                        <th className="px-4 py-3 font-medium text-ink-soft">Role</th>
                        <th className="px-4 py-3 font-medium text-ink-soft">Workload</th>
                        <th className="px-4 py-3 font-medium text-ink-soft"></th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-line">
                      {stats.engineersWithWorkload.map((eng) => (
                        <tr key={eng.id}>
                          <td className="px-4 py-3 text-ink font-medium">{eng.full_name}</td>
                          <td className="px-4 py-3 text-ink-soft font-mono text-xs">{eng.email}</td>
                          <td className="px-4 py-3">
                            <select
                              value={eng.role}
                              onChange={(e) => handleRoleChange(eng.id, e.target.value)}
                              className="rounded-md border border-line bg-white px-2 py-1 text-xs text-ink focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
                            >
                              {ROLES.map((role) => (
                                <option key={role.value} value={role.value}>{role.label}</option>
                              ))}
                            </select>
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-2">
                              <div className="flex-1 bg-line rounded-full h-2">
                                <div
                                  className="bg-gradient-to-r from-primary to-gradient-end h-2 rounded-full"
                                  style={{
                                    width: `${Math.min((eng.workload / Math.max(devices.length, 1)) * 100, 100)}%`,
                                  }}
                                />
                              </div>
                              <span className="text-xs text-ink-soft w-16">{eng.workload} devices</span>
                            </div>
                          </td>
                          <td className="px-4 py-3 text-right">
                            <button
                              onClick={() => handleRemove(eng.id, eng.email)}
                              className="text-dead text-xs hover:underline"
                            >
                              Remove
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        </div>
      </main>

      {showAddModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="tag-clip w-full max-w-md p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-display text-xl text-ink">Add Engineer</h3>
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
            {success && <p className="text-alive text-sm mb-4">{success}</p>}
            <form onSubmit={handleAdd} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-ink mb-1">Email</label>
                <input
                  type="email"
                  value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                  required
                  placeholder="engineer@safaricom.co.ke"
                  className="w-full rounded-lg border border-line bg-surface px-3 py-2 text-ink placeholder:text-ink-soft focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-ink mb-1">Full Name</label>
                <input
                  type="text"
                  value={form.full_name}
                  onChange={(e) => setForm({ ...form, full_name: e.target.value })}
                  required
                  placeholder="Jane Doe"
                  className="w-full rounded-lg border border-line bg-surface px-3 py-2 text-ink placeholder:text-ink-soft focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-ink mb-1">Role</label>
                <select
                  value={form.role}
                  onChange={(e) => setForm({ ...form, role: e.target.value })}
                  className="w-full rounded-lg border border-line bg-surface px-3 py-2 text-ink focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
                >
                  {ROLES.map((role) => (
                    <option key={role.value} value={role.value}>{role.label}</option>
                  ))}
                </select>
              </div>
              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="flex-1 rounded-lg border border-line px-4 py-2 text-sm font-medium text-ink hover:bg-surface-soft transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="flex-1 btn-primary"
                >
                  Add Engineer
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {showBulkModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="tag-clip w-full max-w-2xl p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-display text-xl text-ink">Bulk Import Engineers</h3>
              <button
                onClick={() => setShowBulkModal(false)}
                className="text-ink-soft hover:text-ink"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {error && <p className="text-dead text-sm mb-4">{error}</p>}
            {success && <p className="text-alive text-sm mb-4">{success}</p>}

            <form onSubmit={handleBulkImport} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-ink mb-1">
                  Engineer List
                </label>
                <p className="text-xs text-ink-soft mb-2">
                  Enter one engineer per line in format: <code className="bg-surface-soft px-1 rounded">email, full name</code>
                </p>
                <textarea
                  value={bulkText}
                  onChange={(e) => setBulkText(e.target.value)}
                  required
                  rows={8}
                  placeholder="engineer1@safaricom.co.ke, Jane Doe&#10;engineer2@safaricom.co.ke, John Smith&#10;engineer3@safaricom.co.ke, Alex Kamau"
                  className="w-full rounded-lg border border-line bg-surface px-3 py-2 text-ink placeholder:text-ink-soft focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent font-mono text-sm resize-none"
                />
              </div>

              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowBulkModal(false)}
                  className="flex-1 rounded-lg border border-line px-4 py-2 text-sm font-medium text-ink hover:bg-surface-soft transition-colors"
                >
                  Cancel
                </button>
                <button type="submit" className="flex-1 btn-primary">
                  Import All
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
