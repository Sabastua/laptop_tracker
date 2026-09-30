import { existsSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'

const root = resolve(process.cwd())
const findings = []
const notes = []

const addFinding = (severity, rule, message, remediation, line = 1) => {
  findings.push({ severity, rule, message, remediation, line })
}

const migrationPath = join(root, 'supabase-migrations.sql')

console.log('Running Supabase schema security audit...\n')

if (!existsSync(migrationPath)) {
  console.error('supabase-migrations.sql not found')
  process.exit(1)
}

const sql = readFileSync(migrationPath, 'utf8')
const executableSql = sql.replace(/--[^\n]*/g, '')
const lineAt = (index) => sql.slice(0, index).split(/\r?\n/).length

const tables = [
  ...new Set(
    [...sql.matchAll(/CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?(?:public\.)?(\w+)/gi)].map(
      (match) => match[1].toLowerCase()
    )
  ),
]

const rlsEnabled = new Set(
  [...sql.matchAll(/ALTER\s+TABLE\s+(?:IF\s+EXISTS\s+)?(?:public\.)?(\w+)\s+ENABLE\s+ROW\s+LEVEL\s+SECURITY/gi)].map(
    (match) => match[1].toLowerCase()
  )
)

const policies = [...sql.matchAll(/CREATE\s+POLICY\s+(?:"([^"]+)"|(\w+))([\s\S]*?)ON\s+(?:public\.)?(\w+)\s+FOR\s+(\w+)/gi)].map(
  (match) => ({
    name: match[1] || match[2],
    table: match[4].toLowerCase(),
    command: match[5].toUpperCase(),
    body: match[3],
    line: lineAt(match.index),
  })
)

const views = [...new Set([...sql.matchAll(/CREATE\s+(?:OR\s+REPLACE\s+)?VIEW\s+(?:public\.)?(\w+)/gi)].map((m) => m[1].toLowerCase()))]

const functions = [...executableSql.matchAll(/CREATE\s+(?:OR\s+REPLACE\s+)?FUNCTION\s+(?:public\.)?(\w+)\s*\(([\s\S]*?)\)\s*RETURNS\s+(\w+)([\s\S]*?)\$\$([\s\S]*?)\$\$/gi)].map(
  (match) => ({
    name: match[1].toLowerCase(),
    args: match[2].trim(),
    returns: match[3].toLowerCase(),
    body: match[5],
    full: match[0],
    isDefiner: /SECURITY\s+DEFINER/i.test(match[4]),
    isInvoker: /SECURITY\s+INVOKER/i.test(match[4]),
    hasSearchPath: /search_path/i.test(match[4]),
    line: lineAt(match.index),
  })
)

console.log(`Tables: ${tables.length} | RLS enabled: ${rlsEnabled.size} | Policies: ${policies.length} | Functions: ${functions.length} | Views: ${views.length}\n`)

tables.forEach((table) => {
  if (!rlsEnabled.has(table)) {
    addFinding(
      'critical',
      'rls-missing',
      `Table ${table} never enables row level security. Any authenticated user can read every row.`,
      `Add ALTER TABLE public.${table} ENABLE ROW LEVEL SECURITY;`
    )
  }

  const tablePolicies = policies.filter((policy) => policy.table === table)
  const commands = new Set(tablePolicies.map((policy) => policy.command))

  if (rlsEnabled.has(table) && tablePolicies.length === 0) {
    addFinding(
      'high',
      'rls-no-policies',
      `Table ${table} has RLS enabled but zero policies, so all access is denied.`,
      'Add explicit policies, or confirm the deny-all behaviour is intended.'
    )
  }

  if (!commands.has('SELECT') && rlsEnabled.has(table) && tablePolicies.length > 0) {
    addFinding(
      'low',
      'rls-no-select',
      `Table ${table} has no SELECT policy, so it will not be readable by the app.`,
      'Add a SELECT policy if the frontend needs to read this table.'
    )
  }

  const unscoped = tablePolicies.filter(
    (policy) => /USING\s*\(\s*true\s*\)/i.test(policy.body) && /FOR\s+SELECT/i.test(policy.command)
  )

  unscoped.forEach((policy) => {
    if (policy.name.toLowerCase().includes('own')) return
    addFinding(
      'medium',
      'rls-broad-select',
      `Policy "${policy.name}" on ${table} allows SELECT to all authenticated users.`,
      'Scope the policy to the relevant rows, such as created_by = auth.uid().'
    )
  })
})

functions.forEach((fn) => {
  const isTrigger = fn.returns === 'trigger'

  if (fn.isDefiner && !fn.hasSearchPath) {
    addFinding(
      'high',
      'function-definer-no-search-path',
      `Function ${fn.name} is SECURITY DEFINER without a pinned search_path.`,
      'Add SET search_path = public to the function definition to block schema shadowing.',
      fn.line
    )
  }

  if (fn.isDefiner) {
    const exposesInternal = /\bSELECT\s+\*|\bpassword_hash\b|\bpasscode_hash\b/i.test(fn.body)
    const checksCaller =
      /auth\.uid\(\)|auth\.email\(\)/i.test(fn.body) ||
      /is_authorized_engineer|is_admin/i.test(fn.body) ||
      /NEW\.|OLD\./.test(fn.body)

    if (exposesInternal && !checksCaller) {
      addFinding(
        'medium',
        'function-definer-sensitive-data',
        `Function ${fn.name} is SECURITY DEFINER, touches credential data, and does not verify the caller.`,
        'Confirm the caller is authorised with auth.uid() before acting, and never return secret material.',
        fn.line
      )
    }
    if (!isTrigger && !checksCaller) {
      addFinding(
        'high',
        'function-definer-no-auth-check',
        `Function ${fn.name} is SECURITY DEFINER and callable directly, but performs no caller authorisation check.`,
        'Verify the caller with auth.uid() or is_authorized_engineer() before acting, or revoke EXECUTE from PUBLIC.',
        fn.line
      )
    }
  }
})

const grantsToAnon = [...executableSql.matchAll(/GRANT[^;]*\bTO\s+([^;]*\banon\b[^;]*);/gi)]

grantsToAnon.forEach((match) => {
  addFinding(
    'high',
    'grant-anon',
    `Privileges granted to the anon role: ${match[0].trim().slice(0, 90)}`,
    'Remove anon from the grant. The app requires an authenticated session on every route.'
  )
})

const revokesAnon = /REVOKE[^;]*\bFROM\s+anon\b/i.test(executableSql)

if (!revokesAnon) {
  addFinding(
    'medium',
    'no-revoke-anon',
    'The migration never revokes default privileges from the anon role.',
    'Add REVOKE ALL ON SCHEMA public FROM anon; before granting to authenticated.'
  )
}

const exposesPasscode = /handover_requests_safe[\s\S]{0,400}passcode_hash/i.test(sql)

if (exposesPasscode) {
  addFinding(
    'critical',
    'view-exposes-secret',
    'The safe handover view appears to expose passcode_hash.',
    'Exclude passcode_hash from any view readable by the client.'
  )
} else {
  notes.push('PASS  handover_requests_safe view excludes passcode_hash')
}

const domainEnforced = /enforce_email_domain/i.test(sql) && /enforce_email_domain[\s\S]{0,300}auth\.users/i.test(sql)

if (domainEnforced) {
  notes.push('PASS  email domain restriction trigger is attached to auth.users')
} else {
  addFinding(
    'high',
    'no-domain-restriction',
    'No trigger restricts new auth users to the corporate email domain.',
    'Attach an enforce_email_domain BEFORE INSERT trigger to auth.users.'
  )
}

if (/is_authorized_engineer/i.test(sql) && /role\s+IN\s*\('engineer',\s*'admin'\)/i.test(sql)) {
  notes.push('PASS  authorisation helper restricts access to engineer and admin roles')
} else {
  addFinding(
    'high',
    'weak-authorisation-helper',
    'is_authorized_engineer does not clearly restrict to engineer/admin roles.',
    'Ensure the helper checks role IN (\'engineer\', \'admin\').'
  )
}

const domains = new Set(
  [...executableSql.matchAll(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g)].map((match) =>
    match[0].toLowerCase()
  )
)
const hardcodedEmails = [...domains].filter((entry) => !entry.endsWith('safaricom.co.ke'))

if (hardcodedEmails.length > 0) {
  addFinding(
    'medium',
    'non-corporate-email',
    `Non-corporate email addresses appear in the migration: ${hardcodedEmails.slice(0, 3).join(', ')}`,
    'Remove or replace addresses that do not end in the approved corporate domain.'
  )
}

const severityOrder = { critical: 0, high: 1, medium: 2, low: 3 }
const sorted = [...findings].sort((a, b) => severityOrder[a.severity] - severityOrder[b.severity])

if (notes.length > 0) console.log(notes.join('\n'))
console.log('')

if (sorted.length === 0) {
  console.log('PASS  Schema audit found no issues')
  console.log('\nAll schema security checks passed.')
  process.exit(0)
}

for (const finding of sorted) {
  console.log(`[${finding.severity.toUpperCase()}] ${finding.rule}${finding.line > 1 ? ` (line ${finding.line})` : ''}`)
  console.log(`  ${finding.message}`)
  console.log(`  Fix: ${finding.remediation}`)
  console.log('')
}

const blocking = findings.filter((finding) => finding.severity === 'critical' || finding.severity === 'high')

if (blocking.length > 0) {
  console.log(`FAILED: ${blocking.length} critical/high schema issue(s) must be resolved.`)
  process.exit(1)
}

console.log('No critical or high schema issues. Review the lower-severity items above.')
