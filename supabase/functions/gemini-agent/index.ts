/**
 * Gemini Agent Edge Function
 * 
 * Handles chat messages from engineers, calls Gemini with tool/function calling,
 * executes tools using the calling engineer's own Supabase client (RLS applies).
 * 
 * Deploy with: supabase functions deploy gemini-agent
 * Requires secret: GEMINI_API_KEY
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { GoogleGenerativeAI } from 'https://esm.sh/@google/generative-ai@0.21.0'

const GEMINI_API_KEY = Deno.env.get('GEMINI_API_KEY')!
const genAI = new GoogleGenerativeAI(GEMINI_API_KEY)

const MODEL = 'gemini-2.0-flash'

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

// Tool definitions for Gemini
const tools = [
  {
    functionDeclarations: [
      {
        name: 'get_device_by_qr',
        description: 'Look up a device by its QR code. Returns device details including status, location, and notes.',
        parameters: {
          type: 'object',
          properties: {
            qr_code: { type: 'string', description: 'The QR code of the device' },
          },
          required: ['qr_code'],
        },
      },
      {
        name: 'search_devices',
        description: 'Search devices by brand, model, serial number, or status.',
        parameters: {
          type: 'object',
          properties: {
            brand: { type: 'string', description: 'Device brand (e.g., Dell, HP)' },
            model: { type: 'string', description: 'Device model' },
            serial_number: { type: 'string', description: 'Device serial number' },
            status: {
              type: 'string',
              description: 'Device status',
              enum: ['dead', 'in_repair', 'repaired', 'active', 'disposed', 'stripped'],
            },
          },
        },
      },
      {
        name: 'log_device_action',
        description: 'Log an action performed on a device (e.g., diagnosed, repaired, tested).',
        parameters: {
          type: 'object',
          properties: {
            device_id: { type: 'string', description: 'UUID of the device' },
            action_type: {
              type: 'string',
              description: 'Type of action performed',
              enum: [
                'received', 'diagnosing', 'attempting_repair', 'parts_ordered',
                'testing', 'escalated', 'repaired', 'confirmed_dead', 'note',
                'part_recycled', 'stripped',
              ],
            },
            result: { type: 'string', description: 'Optional result summary' },
            notes: { type: 'string', description: 'Optional notes' },
          },
          required: ['device_id', 'action_type'],
        },
      },
      {
        name: 'get_my_devices',
        description: 'Get devices currently held by the calling engineer.',
        parameters: {
          type: 'object',
          properties: {},
        },
      },
    ],
  },
]

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS_HEADERS })
  }

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
    })
  }

  try {
    // Verify JWT and get user
    const authHeader = req.headers.get('Authorization')!
    const jwt = authHeader.replace('Bearer ', '')

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
      { global: { headers: { Authorization: authHeader } } }
    )

    const { data: { user }, error: userError } = await supabase.auth.getUser(jwt)
    if (userError || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
      })
    }

    // Check if user is authorized
    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single()

    if (!profile || profile.role === 'unauthorized') {
      return new Response(JSON.stringify({ error: 'Not authorized' }), {
        status: 403,
        headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
      })
    }

    // Parse request
    const { message } = await req.json()

    // Load chat history
    const { data: history } = await supabase
      .from('chat_messages')
      .select('role, content, tool_call, tool_result')
      .eq('engineer_id', user.id)
      .order('created_at', { ascending: true })
      .limit(50)

    // Save user message
    await supabase.from('chat_messages').insert({
      engineer_id: user.id,
      role: 'user',
      content: message,
    })

    // Build conversation for Gemini
    const model = genAI.getGenerativeModel({
      model: MODEL,
      tools,
      generationConfig: { temperature: 0.3 },
    })

    const chatHistory = (history || [])
      .filter((m) => m.role !== 'function')
      .map((m) => ({
        role: m.role === 'user' ? 'user' : 'model',
        parts: [{ text: m.content }],
      }))

    const chat = model.startChat({ history: chatHistory })

    // Send message to Gemini
    const result = await chat.sendMessage(message)
    const response = result.response
    const responseText = response.text()

    // Check for function calls
    const functionCalls = response.functionCalls()
    let toolCallData = null
    let toolResultData = null

    if (functionCalls && functionCalls.length > 0) {
      for (const call of functionCalls) {
        toolCallData = { name: call.name, args: call.args }

        // Execute the tool
        const toolResult = await executeTool(call.name, call.args, supabase, user.id)
        toolResultData = toolResult

        // Save function call and result
        await supabase.from('chat_messages').insert({
          engineer_id: user.id,
          role: 'function',
          content: `Called ${call.name}`,
          tool_call: toolCallData,
          tool_result: toolResultData,
        })

        // Send function response back to Gemini
        const followUp = await chat.sendMessage([
          { functionResponse: { name: call.name, response: toolResult } },
        ])

        const followUpText = followUp.response.text()

        // Save assistant response
        await supabase.from('chat_messages').insert({
          engineer_id: user.id,
          role: 'model',
          content: followUpText,
        })

        return new Response(
          JSON.stringify({
            role: 'model',
            content: followUpText,
            tool_call: toolCallData,
            tool_result: toolResultData,
          }),
          { headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
        )
      }
    }

    // No function calls — save and return text response
    await supabase.from('chat_messages').insert({
      engineer_id: user.id,
      role: 'model',
      content: responseText,
    })

    return new Response(
      JSON.stringify({ role: 'model', content: responseText }),
      { headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
    )
  } catch (error) {
    console.error('Gemini agent error:', error)
    return new Response(
      JSON.stringify({ error: error.message || 'Internal server error' }),
      {
        status: 500,
        headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
      }
    )
  }
})

// Tool executor — runs with the user's own Supabase client so RLS applies
async function executeTool(
  name: string,
  args: any,
  supabase: any,
  userId: string
): Promise<any> {
  switch (name) {
    case 'get_device_by_qr': {
      const { data, error } = await supabase
        .from('devices')
        .select('*')
        .eq('qr_code', args.qr_code)
        .single()

      if (error) return { error: error.message }
      return data
    }

    case 'search_devices': {
      let query = supabase.from('devices').select('*').limit(20)

      if (args.brand) query = query.ilike('brand', `%${args.brand}%`)
      if (args.model) query = query.ilike('model', `%${args.model}%`)
      if (args.serial_number) query = query.ilike('serial_number', `%${args.serial_number}%`)
      if (args.status) query = query.eq('status', args.status)

      const { data, error } = await query
      if (error) return { error: error.message }
      return { count: data.length, devices: data }
    }

    case 'log_device_action': {
      const { data: device } = await supabase
        .from('devices')
        .select('id')
        .eq('id', args.device_id)
        .single()

      if (!device) return { error: 'Device not found' }

      const { data, error } = await supabase
        .from('device_actions')
        .insert({
          device_id: args.device_id,
          engineer_id: userId,
          action_type: args.action_type,
          result: args.result || null,
          notes: args.notes || null,
        })
        .select()
        .single()

      if (error) return { error: error.message }
      return data
    }

    case 'get_my_devices': {
      const { data, error } = await supabase
        .from('device_handlers')
        .select('device_id, devices(*)')
        .eq('handler_id', userId)
        .is('released_at', null)

      if (error) return { error: error.message }
      return { count: data.length, devices: data.map((d: any) => d.devices) }
    }

    default:
      return { error: `Unknown tool: ${name}` }
  }
}
