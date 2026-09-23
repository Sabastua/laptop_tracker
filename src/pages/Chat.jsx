import { useState, useRef, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../hooks/useAuth'
import Navbar from '../components/Navbar'

async function callChatFunction(message, engineerId) {
  const { data, error } = await supabase.functions.invoke('gemini-agent', {
    body: JSON.stringify({ message, engineer_id: engineerId }),
  })

  if (error) {
    return { success: false, error: error.message }
  }

  return { success: true, data }
}

export default function Chat() {
  const { profile } = useAuth()
  const [messages, setMessages] = useState([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const messagesEndRef = useRef(null)

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const handleSend = async () => {
    if (!input.trim() || loading) return

    const userMessage = input.trim()
    setInput('')
    setLoading(true)

    const newUserMessage = {
      id: Date.now(),
      role: 'user',
      content: userMessage,
      timestamp: new Date().toISOString(),
    }

    setMessages((prev) => [...prev, newUserMessage])

    try {
      const result = await callChatFunction(userMessage, profile?.id)

      if (result.success) {
        const botResponse = {
          id: Date.now() + 1,
          role: 'assistant',
          content: result.data?.content || result.data?.text || 'No response received',
          timestamp: new Date().toISOString(),
        }
        setMessages((prev) => [...prev, botResponse])
      } else {
        const errorMessage = {
          id: Date.now() + 1,
          role: 'assistant',
          content: `Error: ${result.error || 'Failed to get response from AI agent.'}`,
          timestamp: new Date().toISOString(),
        }
        setMessages((prev) => [...prev, errorMessage])
      }
    } catch (err) {
      const errorMessage = {
        id: Date.now() + 1,
        role: 'assistant',
        content: `Error: ${err.message || 'Unexpected error occurred.'}`,
        timestamp: new Date().toISOString(),
      }
      setMessages((prev) => [...prev, errorMessage])
    } finally {
      setLoading(false)
    }
  }

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  return (
    <div className="min-h-dvh bg-surface flex flex-col">
      <Navbar />

      <div className="max-w-4xl mx-auto w-full flex-1 flex flex-col px-4 sm:px-6 lg:px-8 py-8">
        <div className="fade-in-up mb-6">
          <h1 className="font-display text-3xl text-ink mb-2">AI Assistant</h1>
          <p className="text-ink-soft">Ask questions about your devices, maintenance history, and repair guidance</p>
        </div>

        <div className="flex-1 overflow-y-auto space-y-4 mb-4">
          {messages.length === 0 ? (
            <div className="text-center py-12">
              <div className="w-16 h-16 mx-auto rounded-full bg-primary/10 flex items-center justify-center mb-4">
                <svg className="w-8 h-8 text-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M8 10h.01M12 10h.01M16 10h.01M9 16h6m-3-6h.01M9 16a3 3 0 106 0 3 3 0 01-6 0z"
                  />
                </svg>
              </div>
              <p className="text-ink-soft">No messages yet. Start a conversation about your devices.</p>
            </div>
          ) : (
            messages.map((msg) => (
              <div
                key={msg.id}
                className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
              >
                <div
                  className={`max-w-[80%] rounded-lg px-4 py-3 text-sm ${
                    msg.role === 'user'
                      ? 'bg-gradient-to-r from-primary to-gradient-end text-white'
                      : 'bg-surface-soft border border-line text-ink'
                  }`}
                >
                  <p className="whitespace-pre-wrap">{msg.content}</p>
                  <p
                    className={`text-xs mt-1 opacity-70 ${
                      msg.role === 'user' ? 'text-white/70' : 'text-ink-soft'
                    }`}
                  >
                    {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </p>
                </div>
              </div>
            ))
          )}
          {loading && (
            <div className="flex justify-start">
              <div className="bg-surface-soft border border-line rounded-lg px-4 py-3">
                <div className="flex items-center gap-2 text-ink-soft text-sm">
                  <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                    <circle
                      className="opacity-25"
                      cx="12"
                      cy="12"
                      r="10"
                      stroke="currentColor"
                      strokeWidth="4"
                      fill="none"
                    />
                    <path
                      className="opacity-75"
                      fill="currentColor"
                      d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                    />
                  </svg>
                  Thinking...
                </div>
              </div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>

        <div className="tag-clip p-4">
          <div className="flex gap-3">
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Ask about your devices..."
              rows={2}
              disabled={loading}
              className="flex-1 rounded-lg border border-line bg-surface px-4 py-2.5 text-ink placeholder:text-ink-soft focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent resize-none disabled:opacity-50"
            />
            <button
              onClick={handleSend}
              disabled={loading || !input.trim()}
              className="btn-primary px-6 flex items-center justify-center disabled:opacity-50"
            >
              {loading ? (
                <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
                  <circle
                    className="opacity-25"
                    cx="12"
                    cy="12"
                    r="10"
                    stroke="currentColor"
                    strokeWidth="4"
                    fill="none"
                  />
                  <path
                    className="opacity-75"
                    fill="currentColor"
                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                  />
                </svg>
              ) : (
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M12 19V5m0 0l7 7m-7-7l-7 7"
                  />
                </svg>
              )}
            </button>
          </div>
          <p className="text-xs text-ink-soft mt-2">
            Press Enter to send, Shift+Enter for a new line
          </p>
        </div>
      </div>
    </div>
  )
}
