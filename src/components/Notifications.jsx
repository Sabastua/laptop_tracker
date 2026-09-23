import { useState, useEffect, useRef, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../hooks/useAuth'

export default function Notifications() {
  const { profile } = useAuth()
  const [notifications, setNotifications] = useState([])
  const [showDropdown, setShowDropdown] = useState(false)
  const dropdownRef = useRef(null)

  const fetchNotifications = useCallback(async () => {
    if (!profile) return

    const { data, error } = await supabase
      .from('notifications')
      .select('id, device_id, notification_type, message, is_read, created_at, device:device_id(qr_code, asset_tag)')
      .eq('recipient_id', profile.id)
      .eq('is_read', false)
      .order('created_at', { ascending: false })
      .limit(10)

    if (error) {
      console.error('Failed to fetch notifications:', error)
    } else {
      setNotifications(data || [])
    }
  }, [profile])

  useEffect(() => {
    fetchNotifications()

    const channel = supabase
      .channel('notifications:public')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'notifications',
        },
        (payload) => {
          if (payload.new.recipient_id === profile?.id && !payload.new.is_read) {
            setNotifications((prev) => [payload.new, ...prev.slice(0, 9)])
          }
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [profile, fetchNotifications])

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setShowDropdown(false)
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const handleMarkRead = async (notificationId) => {
    const { error } = await supabase
      .from('notifications')
      .update({ is_read: true })
      .eq('id', notificationId)

    if (error) {
      console.error('Failed to mark notification as read:', error)
    } else {
      setNotifications((prev) => prev.filter((n) => n.id !== notificationId))
    }
  }

  const formatTime = (date) => {
    const d = new Date(date)
    const now = new Date()
    const diffMs = now.getTime() - d.getTime()
    const diffMins = Math.floor(diffMs / 60000)
    const diffHours = Math.floor(diffMins / 60)
    const diffDays = Math.floor(diffHours / 24)

    if (diffMins < 1) return 'just now'
    if (diffMins < 60) return `${diffMins}m ago`
    if (diffHours < 24) return `${diffHours}h ago`
    if (diffDays < 7) return `${diffDays}d ago`
    return d.toLocaleDateString()
  }

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={() => setShowDropdown(!showDropdown)}
        className="relative p-2 text-white hover:bg-white/10 rounded-lg transition-colors"
      >
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.07V11c0-1.5-.5-2.91-1.42-4.034A3.996 3.996 0 0014 6V5a2 2 0 10-4 0v1c0 1.657-.894 3.077-2.293 3.866C6.151 11.195 5 12.603 5 14.25V15l-1.405 1.405A2.032 2.032 0 004 17.93V19a2 2 0 002 2h12a2 2 0 002-2v-1.07l-.595-.595z"
          />
        </svg>
        {notifications.length > 0 && (
          <span className="absolute -top-1 -right-1 flex items-center justify-center w-5 h-5 text-xs font-medium text-white bg-red-500 rounded-full">
            {notifications.length > 9 ? '9+' : notifications.length}
          </span>
        )}
      </button>

      {showDropdown && (
        <div className="fixed inset-0 z-50 pointer-events-none">
          <div className="pointer-events-auto absolute right-0 mt-2 w-80 bg-white rounded-lg shadow-lg border border-line z-50">
            <div className="px-4 py-3 border-b border-line">
              <h3 className="font-medium text-ink">Notifications</h3>
            </div>

            {notifications.length === 0 ? (
              <div className="px-4 py-6 text-center text-ink-soft text-sm">
                No new notifications
              </div>
            ) : (
              <div className="max-h-80 overflow-y-auto">
                {notifications.map((note) => (
                  <div
                    key={note.id}
                    className="px-4 py-3 border-b border-line last:border-b-0 hover:bg-surface-soft transition-colors cursor-pointer"
                    onClick={() => handleMarkRead(note.id)}
                  >
                    <p className="text-sm font-medium text-ink">{note.message}</p>
                    <p className="text-xs text-ink-soft mt-1">
                      {formatTime(note.created_at)}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
