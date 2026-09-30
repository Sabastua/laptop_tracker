import posthog from 'posthog-js'

const apiKey = import.meta.env.VITE_POSTHOG_KEY
const apiHost = import.meta.env.VITE_POSTHOG_HOST || 'https://us.i.posthog.com'
const enabled = Boolean(apiKey) && import.meta.env.PROD

const SENSITIVE_KEY_PATTERN =
  /(email|mail|serial|asset|qr|passcode|password|token|secret|phone|full_?name|first_?name|last_?name|address|note|comment|body|review|ip)/i

const EMAIL_PATTERN = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi
const UUID_PATTERN = /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi
const SERIAL_PATTERN = /\b(?:SN|CN|SERIAL)[-_A-Z0-9]{4,}\b/gi
const ASSET_TAG_PATTERN = /\b[A-Z]{2,6}-\d{2,}\b/gi
const QR_PATTERN = /\bQR-\d+\b/gi

const scrubString = (value) =>
  value
    .replace(EMAIL_PATTERN, '[redacted-email]')
    .replace(UUID_PATTERN, '[redacted-id]')
    .replace(SERIAL_PATTERN, '[redacted-serial]')
    .replace(ASSET_TAG_PATTERN, '[redacted-tag]')
    .replace(QR_PATTERN, '[redacted-qr]')

export const scrubProperties = (properties) => {
  if (!properties || typeof properties !== 'object') return properties

  return Object.fromEntries(
    Object.entries(properties).map(([key, value]) => {
      if (SENSITIVE_KEY_PATTERN.test(key)) {
        return [key, '[redacted]']
      }

      if (typeof value === 'string') {
        return [key, scrubString(value)]
      }

      if (Array.isArray(value)) {
        return [key, value.map((entry) => (typeof entry === 'string' ? scrubString(entry) : entry))]
      }

      if (value && typeof value === 'object') {
        return [key, scrubProperties(value)]
      }

      return [key, value]
    })
  )
}

let initialized = false

export const analytics = {
  enabled,

  init() {
    if (initialized || !enabled) return

    initialized = true

    posthog.init(apiKey, {
      api_host: apiHost,
      autocapture: true,
      capture_pageview: 'history_change',
      capture_pageleave: 'if_capture_pageview',
      mask_all_text: true,
      mask_all_element_attributes: true,
      person_profiles: 'identified_only',
      session_recording: {
        maskInputOptions: { password: true, text: true, email: true, tel: true, number: true },
      },
      before_send: (event) => {
        if (!event || event.event === '$exception') return event

        return { ...event, properties: scrubProperties(event.properties) }
      },
    })
  },

  identify(user) {
    if (!enabled || !user?.id) return

    this.init()
    posthog.identify(String(user.id), { role: user.role, is_admin: user.role === 'admin' })
  },

  capture(event, properties) {
    if (!enabled) return

    this.init()
    posthog.capture(event, scrubProperties(properties))
  },

  reset() {
    if (!enabled) return

    posthog.reset()
  },
}

export default analytics
