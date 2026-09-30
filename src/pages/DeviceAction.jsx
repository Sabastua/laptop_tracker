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

const STATUS_COLORS = {
  active: '#10b981', repaired: '#6366f1', in_repair: '#f59e0b',
  dead: '#ef4444', stripped: '#64748b', disposed: '#94a3b8',
}

const STATUS_LABELS = {
  dead: 'Dead', in_repair: 'In Repair', repaired: 'Repaired',
  active: 'Active', disposed: 'Disposed', stripped: 'Stripped',
}

const STAR_LABELS = ['Terrible', 'Poor', 'Fair', 'Good', 'Excellent']

export default function DeviceAction() {
  const { qrCode } = useParams()
  const navigate = useNavigate()
  const { profile } = useAuth()
  const [device, setDevice] = useState(null)
  const [actions, setActions] = useState([])
  const [handlers, setHandlers] = useState([])
  const [reviews, setReviews] = useState([])
  const [comments, setComments] = useState([])
  const [parts, setParts] = useState([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [form, setForm] = useState({
    action_type: '',
    result: '',
    notes: '',
  })
  const [reviewForm, setReviewForm] = useState({ rating: 5, title: '', body: '' })
  const [commentForm, setCommentForm] = useState('')
  const [showReviewModal, setShowReviewModal] = useState(false)

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
      .select('*, engineer:engineer_id(full_name, email)')
      .eq('device_id', deviceData.id)
      .order('action_at', { ascending: false })

    const { data: handlersData } = await supabase
      .from('device_handlers')
      .select('*, handler:handler_id(full_name, email)')
      .eq('device_id', deviceData.id)
      .order('assigned_at', { ascending: false })

    const { data: reviewsData } = await supabase
      .from('device_reviews')
      .select('*, engineer:engineer_id(full_name, email)')
      .eq('device_id', deviceData.id)
      .order('created_at', { ascending: false })

    const { data: commentsData } = await supabase
      .from('device_comments')
      .select('*, engineer:engineer_id(full_name, email)')
      .eq('device_id', deviceData.id)
      .order('created_at', { ascending: true })

    const { data: partsData } = await supabase
      .from('device_parts')
      .select('*')
      .eq('device_id', deviceData.id)
      .order('part_type')

    setActions(actionsData || [])
    setHandlers(handlersData || [])
    setReviews(reviewsData || [])
    setComments(commentsData || [])
    setParts(partsData || [])
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

  const handleAddReview = async (e) => {
    e.preventDefault()
    setSaving(true)
    setError('')

    const { error: reviewError } = await supabase.from('device_reviews').insert({
      device_id: device.id,
      engineer_id: profile.id,
      rating: reviewForm.rating,
      title: reviewForm.title || null,
      body: reviewForm.body || null,
    })

    if (reviewError) {
      setError(reviewError.message)
    } else {
      setReviewForm({ rating: 5, title: '', body: '' })
      setShowReviewModal(false)
      fetchDeviceData()
    }
    setSaving(false)
  }

  const handleAddComment = async (e) => {
    e.preventDefault()
    if (!commentForm.trim()) return

    setSaving(true)
    setError('')

    const { error: commentError } = await supabase.from('device_comments').insert({
      device_id: device.id,
      engineer_id: profile.id,
      body: commentForm.trim(),
    })

    if (commentError) {
      setError(commentError.message)
    } else {
      setCommentForm('')
      fetchDeviceData()
    }
    setSaving(false)
  }

  const handleDeleteReview = async (reviewId) => {
    if (!confirm('Delete this review?')) return
    await supabase.from('device_reviews').delete().eq('id', reviewId)
    fetchDeviceData()
  }

  const handleDeleteComment = async (commentId) => {
    if (!confirm('Delete this comment?')) return
    await supabase.from('device_comments').delete().eq('id', commentId)
    fetchDeviceData()
  }

  const formatDate = (date) => {
    if (!date) return '—'
    return new Date(date).toLocaleString('en-KE', {
      dateStyle: 'medium',
      timeStyle: 'short',
    })
  }

  const averageRating = reviews.length
    ? reviews.reduce((sum, r) => sum + (r.rating || 0), 0) / reviews.length
    : 0

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
    <>
      <div className="min-h-dvh bg-surface">
      <Navbar />
      <header className="border-b border-line bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex items-center justify-between">
          <div>
            <h1 className="font-display text-xl text-ink">Device Details</h1>
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

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
        {error && (
          <div className="tag-clip p-4 bg-red-50 border-dead">
            <p className="text-dead text-sm">{error}</p>
          </div>
        )}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="glass-card p-6">
            <h2 className="font-display text-lg text-ink mb-4">Current Status</h2>
            <div className="flex items-center gap-4">
              <div
                className="w-14 h-14 rounded-xl flex items-center justify-center text-white text-2xl font-bold"
                style={{ backgroundColor: STATUS_COLORS[device?.status] || '#64748b' }}
              >
                {device?.status?.charAt(0).toUpperCase()}
              </div>
              <div>
                <span
                  className="inline-flex items-center px-3 py-1 rounded-full text-sm font-medium border"
                  style={{
                    color: STATUS_COLORS[device?.status] || '#64748b',
                    backgroundColor: `${STATUS_COLORS[device?.status] || '#64748b'}14`,
                    borderColor: `${STATUS_COLORS[device?.status] || '#64748b'}40`,
                  }}
                >
                  {STATUS_LABELS[device?.status] || device?.status}
                </span>
                <p className="text-xs text-ink-soft mt-2">
                  Marked dead: {formatDate(device?.marked_dead_at)}
                </p>
              </div>
            </div>
            {device?.notes && (
              <div className="mt-4">
                <span className="block text-ink-soft text-xs mb-1">Problem Notes</span>
                <p className="text-ink bg-surface p-3 rounded-md border border-line text-sm">
                  {device.notes}
                </p>
              </div>
            )}
          </div>

          <div className="glass-card p-6">
            <h2 className="font-display text-lg text-ink mb-4">Asset Information</h2>
            <div className="space-y-3 text-sm">
              <div className="flex justify-between">
                <span className="text-ink-soft">Asset Tag</span>
                <span className="font-mono text-ink font-medium">{device?.asset_tag || '—'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-ink-soft">Serial Number</span>
                <span className="font-mono text-ink font-medium">{device?.serial_number || '—'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-ink-soft">Brand</span>
                <span className="text-ink">{device?.brand || '—'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-ink-soft">Model</span>
                <span className="text-ink">{device?.model || '—'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-ink-soft">Location</span>
                <span className="text-ink">{device?.location || '—'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-ink-soft">QR Code</span>
                <span className="font-mono text-ink-soft text-xs">{device?.qr_code}</span>
              </div>
            </div>
          </div>
        </div>

        <div className="glass-card p-6">
          <h2 className="font-display text-lg text-ink mb-4">Custody Trail</h2>
          {handlers.length === 0 ? (
            <p className="text-ink-soft text-sm">No custody records yet.</p>
          ) : (
            <div className="space-y-3">
              {handlers.map((handler) => (
                <div
                  key={handler.id}
                  className="bg-surface border border-line rounded-lg p-4 flex items-center justify-between"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center text-primary font-medium">
                      {(handler.handler?.full_name || 'U').charAt(0)}
                    </div>
                    <div>
                      <p className="text-sm font-medium text-ink">
                        {handler.handler?.full_name || 'Unknown'}
                      </p>
                      <p className="text-xs text-ink-soft font-mono">
                        {handler.handler?.email}
                      </p>
                    </div>
                  </div>
                  <div className="text-right text-xs text-ink-soft">
                    <p>Assigned: {formatDate(handler.assigned_at)}</p>
                    {handler.released_at && <p>Released: {formatDate(handler.released_at)}</p>}
                    {!handler.released_at && (
                      <span className="text-alive font-medium">Current holder</span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="glass-card p-6">
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

        <div className="glass-card p-6">
          <h2 className="font-display text-lg text-ink mb-4">Activity History</h2>
          {actions.length === 0 ? (
            <p className="text-ink-soft text-sm">No actions recorded yet.</p>
          ) : (
            <div className="space-y-3">
              {actions.map((action) => (
                <div key={action.id} className="bg-surface border border-line rounded-lg p-4">
                  <div className="flex items-center justify-between mb-2">
                    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-white border border-line text-ink">
                      {action.action_type?.replace('_', ' ')}
                    </span>
                    <span className="text-xs text-ink-soft">{formatDate(action.action_at)}</span>
                  </div>
                  {action.result && <p className="text-sm text-ink mb-1"><strong>Result:</strong> {action.result}</p>}
                  {action.notes && <p className="text-sm text-ink-soft">{action.notes}</p>}
                  <p className="text-xs text-ink-soft mt-2">
                    By {action.engineer?.full_name || action.engineer?.email || action.engineer_id?.slice(0, 8)}
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="glass-card p-6">
          <h2 className="font-display text-lg text-ink mb-4">Hardware Specs</h2>
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div className="bg-surface-soft rounded-lg p-4">
              <span className="block text-ink-soft text-xs mb-1">Brand</span>
              <span className="text-ink font-medium">{device?.brand || '—'}</span>
            </div>
            <div className="bg-surface-soft rounded-lg p-4">
              <span className="block text-ink-soft text-xs mb-1">Model</span>
              <span className="text-ink font-medium">{device?.model || '—'}</span>
            </div>
            <div className="bg-surface-soft rounded-lg p-4">
              <span className="block text-ink-soft text-xs mb-1">Serial Number</span>
              <span className="font-mono text-ink">{device?.serial_number || '—'}</span>
            </div>
            <div className="bg-surface-soft rounded-lg p-4">
              <span className="block text-ink-soft text-xs mb-1">Asset Tag</span>
              <span className="font-mono text-ink">{device?.asset_tag || '—'}</span>
            </div>
          </div>
          {parts.length > 0 && (
            <div className="mt-4">
              <span className="block text-ink-soft text-xs mb-2">Parts Inventory</span>
              <div className="flex flex-wrap gap-2">
                {parts.map((part) => (
                  <span
                    key={part.id}
                    className="inline-flex items-center px-2.5 py-1 rounded-full text-xs border"
                    style={{
                      color: part.status === 'available' ? '#f59e0b' : '#10b981',
                      backgroundColor: part.status === 'available' ? '#fef3c7' : '#dcfce7',
                      borderColor: part.status === 'available' ? '#fcd34d' : '#6ee7b7',
                    }}
                  >
                    {part.part_type?.replace('_', ' ')} — {part.status}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="glass-card p-6">
          <h2 className="font-display text-lg text-ink mb-4">Custody History</h2>
          {handlers.length === 0 ? (
            <p className="text-ink-soft text-sm">No custody records yet.</p>
          ) : (
            <div className="space-y-3">
              {handlers.map((handler) => (
                <div key={handler.id} className="bg-surface border border-line rounded-lg p-4 flex items-center justify-between">
                  <div>
                    <p className="text-sm text-ink">{handler.handler?.full_name || 'Unknown'}</p>
                    <p className="text-xs text-ink-soft font-mono">{handler.handler?.email}</p>
                  </div>
                  <div className="text-right text-xs text-ink-soft">
                    <p>Assigned: {formatDate(handler.assigned_at)}</p>
                    {handler.released_at && <p>Released: {formatDate(handler.released_at)}</p>}
                    {!handler.released_at && <span className="text-alive font-medium">Current holder</span>}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="glass-card p-6">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="font-display text-lg text-ink">Engineer Reviews</h2>
              <p className="text-sm text-ink-soft mt-1">
                {reviews.length} review{reviews.length !== 1 ? 's' : ''} · Average {averageRating.toFixed(1)} / 5
              </p>
            </div>
            <button
              type="button"
              onClick={() => setShowReviewModal(true)}
              className="btn-outline text-sm flex items-center gap-2"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              Write Review
            </button>
          </div>

          {reviews.length === 0 ? (
            <p className="text-ink-soft text-sm">No reviews yet. Be the first to review this device.</p>
          ) : (
            <div className="space-y-4">
              {reviews.map((review) => (
                <div key={review.id} className="bg-surface border border-line rounded-lg p-4">
                  <div className="flex items-start justify-between mb-2">
                    <div>
                      <div className="flex items-center gap-2">
                        <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-primary text-xs font-medium">
                          {(review.engineer?.full_name || 'U').charAt(0)}
                        </div>
                        <div>
                          <p className="text-sm font-medium text-ink">
                            {review.engineer?.full_name || review.engineer?.email || 'Engineer'}
                          </p>
                          <div className="flex items-center gap-1">
                            {[1, 2, 3, 4, 5].map((star) => (
                              <svg
                                key={star}
                                className="w-3 h-3"
                                fill={star <= review.rating ? 'currentColor' : 'none'}
                                stroke="currentColor"
                                viewBox="0 0 24 24"
                                style={{ color: star <= review.rating ? '#f59e0b' : '#cbd5e1' }}
                              >
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11.05 4.93A.5.5 0 009.92 4.24L7.72 3.88a.5.5 0 00-.47.08L5.22 2.26a.5.5 0 00-.3.48l.38 2.14a.5.5 0 00.28.4l1.93.98a.5.5 0 01.28.4l-.38 2.14a.5.5 0 00.48.63h2.14a.5.5 0 00.47-.3l.98-1.93a.5.5 0 01.4-.28l2.14-.38a.5.5 0 00.3-.48l-.98-1.93a.5.5 0 00-.48-.3l-2.14-.38a.5.5 0 00-.47.08l-1.93.98a.5.5 0 00-.28.4z" />
                              </svg>
                            ))}
                            <span className="text-xs text-ink-soft ml-1">
                              {STAR_LABELS[review.rating - 1]}
                            </span>
                          </div>
                        </div>
                      </div>
                      <span className="text-xs text-ink-soft">{formatDate(review.created_at)}</span>
                    </div>
                    {review.engineer_id === profile?.id && (
                      <button
                        type="button"
                        onClick={() => handleDeleteReview(review.id)}
                        className="text-ink-soft hover:text-dead text-xs"
                      >
                        Delete
                      </button>
                    )}
                  </div>
                  {review.title && <p className="text-sm font-medium text-ink mb-1">{review.title}</p>}
                  {review.body && <p className="text-sm text-ink-soft">{review.body}</p>}
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="glass-card p-6">
          <h2 className="font-display text-lg text-ink mb-4">Comments & Discussion</h2>
          <form onSubmit={handleAddComment} className="flex gap-3 mb-4">
            <input
              type="text"
              value={commentForm}
              onChange={(e) => setCommentForm(e.target.value)}
              placeholder="Add a comment..."
              className="flex-1 rounded-lg border border-line bg-white px-4 py-2 text-sm text-ink placeholder:text-ink-soft focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
            />
            <button
              type="submit"
              disabled={saving || !commentForm.trim()}
              className="btn-primary px-4 py-2 text-sm disabled:opacity-50"
            >
              Post
            </button>
          </form>
          {comments.length === 0 ? (
            <p className="text-ink-soft text-sm">No comments yet.</p>
          ) : (
            <div className="space-y-3">
              {comments.map((comment) => (
                <div key={comment.id} className="bg-surface border border-line rounded-lg p-4">
                  <div className="flex items-start justify-between">
                    <div className="flex items-start gap-3">
                      <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-primary text-xs font-medium">
                        {(comment.engineer?.full_name || 'U').charAt(0)}
                      </div>
                      <div>
                        <p className="text-sm font-medium text-ink">
                          {comment.engineer?.full_name || comment.engineer?.email || 'Engineer'}
                        </p>
                        <p className="text-sm text-ink mt-1">{comment.body}</p>
                        <p className="text-xs text-ink-soft mt-1">{formatDate(comment.created_at)}</p>
                      </div>
                    </div>
                    {comment.engineer_id === profile?.id && (
                      <button
                        type="button"
                        onClick={() => handleDeleteComment(comment.id)}
                        className="text-ink-soft hover:text-dead text-xs"
                      >
                        Delete
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </main>
    </div>

    {showReviewModal && (
      <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
        <div className="glass-card w-full max-w-lg p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-display text-xl text-ink">Write a Review</h3>
            <button
              onClick={() => setShowReviewModal(false)}
              className="text-ink-soft hover:text-ink"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {error && <p className="text-dead text-sm mb-4">{error}</p>}

          <form onSubmit={handleAddReview} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-ink mb-2">Rating</label>
              <div className="flex gap-2">
                {[1, 2, 3, 4, 5].map((star) => (
                  <button
                    key={star}
                    type="button"
                    onClick={() => setReviewForm({ ...reviewForm, rating: star })}
                    className="w-10 h-10 rounded-lg border border-line flex items-center justify-center transition-colors"
                    style={{
                      backgroundColor: star <= reviewForm.rating ? '#fef3c7' : '#ffffff',
                      borderColor: star <= reviewForm.rating ? '#f59e0b' : '#e2e8f0',
                    }}
                  >
                    <svg
                      className="w-5 h-5"
                      fill={star <= reviewForm.rating ? 'currentColor' : 'none'}
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                      style={{ color: star <= reviewForm.rating ? '#f59e0b' : '#94a3b8' }}
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11.05 4.93A.5.5 0 009.92 4.24L7.72 3.88a.5.5 0 00-.47.08L5.22 2.26a.5.5 0 00-.3.48l.38 2.14a.5.5 0 00.28.4l1.93.98a.5.5 0 01.28.4l-.38 2.14a.5.5 0 00.48.63h2.14a.5.5 0 00.47-.3l.98-1.93a.5.5 0 01.4-.28l2.14-.38a.5.5 0 00.3-.48l-.98-1.93a.5.5 0 00-.48-.3l-2.14-.38a.5.5 0 00-.47.08l-1.93.98a.5.5 0 00-.28.4z" />
                    </svg>
                  </button>
                ))}
              </div>
              <p className="text-xs text-ink-soft mt-1">{STAR_LABELS[reviewForm.rating - 1]}</p>
            </div>

            <div>
              <label className="block text-sm font-medium text-ink mb-1">Title (Optional)</label>
              <input
                type="text"
                value={reviewForm.title}
                onChange={(e) => setReviewForm({ ...reviewForm, title: e.target.value })}
                placeholder="Brief summary"
                className="w-full rounded-lg border border-line bg-white px-3 py-2 text-ink placeholder:text-ink-soft focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-ink mb-1">Review (Optional)</label>
              <textarea
                value={reviewForm.body}
                onChange={(e) => setReviewForm({ ...reviewForm, body: e.target.value })}
                rows={3}
                placeholder="Share your experience..."
                className="w-full rounded-lg border border-line bg-white px-3 py-2 text-ink placeholder:text-ink-soft focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
              />
            </div>

            <div className="flex gap-3 pt-2">
              <button
                type="button"
                onClick={() => setShowReviewModal(false)}
                className="flex-1 rounded-lg border border-line px-4 py-2 text-sm font-medium text-ink hover:bg-surface-soft transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={saving}
                className="flex-1 btn-primary disabled:opacity-50"
              >
                {saving ? 'Saving...' : 'Submit Review'}
              </button>
            </div>
          </form>
        </div>
      </div>
    )}
    </>
  )
}
