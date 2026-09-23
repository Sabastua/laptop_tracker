import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import Navbar from '../components/Navbar'

export default function ScanDevice() {
  const navigate = useNavigate()
  const [scanning, setScanning] = useState(false)
  const [manualCode, setManualCode] = useState('')
  const [error, setError] = useState('')
  const [devices, setDevices] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetchRecentDevices()
  }, [])

  const fetchRecentDevices = async () => {
    setLoading(true)
    const { data, error } = await supabase
      .from('device_current_state')
      .select('id, qr_code, asset_tag, brand, model, status, current_handler_name')
      .order('marked_dead_at', { ascending: false })
      .limit(20)

    if (error) {
      console.error('Failed to fetch devices:', error)
      setError(error.message)
    } else {
      setDevices(data || [])
    }
    setLoading(false)
  }

  const handleScan = async () => {
    if (!manualCode.trim()) return

    setScanning(true)
    setError('')

    const { data, error } = await supabase
      .from('devices')
      .select('qr_code')
      .eq('qr_code', manualCode.trim())
      .maybeSingle()

    if (error || !data) {
      setError(error?.message || 'Device not found. Please check the QR code.')
    } else {
      navigate(`/device/${data.qr_code}`)
    }
    setScanning(false)
  }

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') {
      handleScan()
    }
  }

  return (
    <div className="min-h-dvh bg-surface">
      <Navbar />

      <main className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
        <div className="fade-in-up">
          <h1 className="font-display text-3xl text-ink mb-2">Scan Device</h1>
          <p className="text-ink-soft">Enter or scan a device QR code to view its details</p>
        </div>

        <div className="tag-clip p-6 fade-in-up">
          <div className="flex gap-3">
            <input
              type="text"
              value={manualCode}
              onChange={(e) => setManualCode(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Enter QR code or asset tag"
              className="flex-1 rounded-lg border border-line bg-surface px-4 py-2.5 text-ink placeholder:text-ink-soft focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
            />
            <button
              onClick={handleScan}
              disabled={scanning || !manualCode.trim()}
              className="btn-primary px-6 flex items-center justify-center disabled:opacity-50"
            >
              {scanning ? 'Searching...' : 'Lookup'}
            </button>
          </div>

          {error && (
            <p className="text-dead text-sm mt-3">{error}</p>
          )}
        </div>

        <div className="tag-clip p-6 fade-in-up">
          <h2 className="font-display text-lg text-ink mb-4">Recent Devices</h2>
          {loading ? (
            <p className="text-ink-soft text-sm">Loading...</p>
          ) : devices.length === 0 ? (
            <p className="text-ink-soft text-sm">No devices found.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="bg-surface-soft border-b border-line">
                  <tr>
                    <th className="px-4 py-3 font-medium text-ink-soft">QR Code</th>
                    <th className="px-4 py-3 font-medium text-ink-soft">Asset Tag</th>
                    <th className="px-4 py-3 font-medium text-ink-soft">Device</th>
                    <th className="px-4 py-3 font-medium text-ink-soft">Status</th>
                    <th className="px-4 py-3 font-medium text-ink-soft">Handler</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {devices.map((device) => (
                    <tr
                      key={device.id}
                      onClick={() => navigate(`/device/${device.qr_code}`)}
                      className="cursor-pointer hover:bg-surface-soft transition-colors"
                    >
                      <td className="px-4 py-3 font-mono text-xs text-ink">{device.qr_code}</td>
                      <td className="px-4 py-3 font-mono text-xs text-ink">{device.asset_tag || '—'}</td>
                      <td className="px-4 py-3">
                        <div className="text-ink">{device.brand} {device.model}</div>
                      </td>
                      <td className="px-4 py-3">
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-surface-soft border border-line text-ink">
                          {device.status?.replace('_', ' ') || '—'}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-ink-soft">{device.current_handler_name || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </main>
    </div>
  )
}
