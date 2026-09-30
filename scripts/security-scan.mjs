import { readdirSync, readFileSync, existsSync, statSync } from 'node:fs'
import { join, relative, resolve, sep } from 'node:path'

const root = resolve(process.cwd())
const findings = []
const notes = []

const addFinding = ({ rule, severity, file, line, message, remediation }) => {
  findings.push({ rule, severity, file, line, message, remediation })
}

const walk = (dir) => {
  if (!existsSync(dir)) return []

  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = join(dir, entry.name)
    if (entry.isDirectory()) return walk(full)
    return entry.isFile() ? [full] : []
  })
}

const SKIP_DIRECTORIES = new Set(['node_modules', 'dist', '.git', 'coverage', 'build'])

const collectFiles = (dir) => {
  if (!existsSync(dir)) return []

  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    if (SKIP_DIRECTORIES.has(entry.name)) return []
    const full = join(dir, entry.name)
    if (entry.isDirectory()) return collectFiles(full)
    return entry.isFile() ? [full] : []
  })
}

const files = [
  ...collectFiles(join(root, 'src')),
  ...collectFiles(join(root, 'scripts')),
  ...collectFiles(join(root, 'supabase')),
  ...collectFiles(join(root, '.github')),
  ...['supabase-migrations.sql', 'supabase-seed-data.sql', 'setup-supabase.sh']
    .map((name) => join(root, name))
    .filter((file) => existsSync(file) && statSync(file).isFile()),
]
  .filter((file) => /\.(jsx?|mjs|cjs|sql|ya?ml|sh)$/.test(file))
  .filter((file) => statSync(file).size < 1_500_000)
  .filter((file) => !file.endsWith(`${sep}security-scan.mjs`))

const rel = (file) => relative(root, file).replace(/\\/g, '/')

const stripComments = (line) => line.replace(/\/\/.*$/, '').replace(/\/\*.*?\*\//g, '')

const RULES = [
  {
    rule: 'xss-dangerously-set-inner-html',
    severity: 'high',
    test: (line) => /dangerouslySetInnerHTML/.test(line),
    message: 'dangerouslySetInnerHTML bypasses React escaping and can execute injected script.',
    remediation: 'Render text as children, or sanitise with DOMPurify before injecting HTML.',
  },
  {
    rule: 'xss-inner-html',
    severity: 'high',
    test: (line) => /\.innerHTML\s*(=|\+=)/.test(line),
    message: 'Direct innerHTML assignment can introduce XSS.',
    remediation: 'Use textContent, or sanitise the value before assignment.',
  },
  {
    rule: 'xss-document-write',
    severity: 'high',
    test: (line) => /document\.write/.test(line),
    message: 'document.write renders unescaped content into the page.',
    remediation: 'Build DOM nodes explicitly instead of writing raw markup.',
  },
  {
    rule: 'code-injection-eval',
    severity: 'critical',
    test: (line) => /\beval\s*\(/.test(line) || /new\s+Function\s*\(/.test(line),
    message: 'eval or Function constructor executes arbitrary code at runtime.',
    remediation: 'Replace with explicit logic or a lookup table.',
  },
  {
    rule: 'dynamic-import-untrusted',
    severity: 'high',
    test: (line) => /import\s*\(\s*[A-Za-z_$][\w$]*\s*\)/.test(line) && /import\s*\(/.test(line),
    message: 'Dynamic import with a variable specifier can load attacker-controlled modules.',
    remediation: 'Import statically, or validate the specifier against an explicit allowlist.',
  },
  {
    rule: 'secret-service-role-key',
    severity: 'critical',
    test: (line) => /service_role/i.test(line) || /SERVICE_ROLE_KEY/.test(line),
    message: 'Supabase service_role key grants full database access and must never reach the browser.',
    remediation: 'Remove it. Server-side calls only, via Supabase Edge Functions with a server-side secret.',
  },
  {
    rule: 'secret-hardcoded-password',
    severity: 'high',
    test: (line) =>
      /(password|passwd|secret|api[_-]?key|token)\s*[:=]\s*['"][^'"]{8,}['"]/i.test(line),
    message: 'Credential appears to be hardcoded in source.',
    remediation: 'Move the value to an environment variable and ensure the file is gitignored.',
  },
  {
    rule: 'secret-jwt-literal',
    severity: 'critical',
    test: (line) => /\beyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\./.test(line),
    message: 'A JWT-shaped literal is present in the source.',
    remediation: 'Remove it and rotate the credential if it was ever valid.',
  },
  {
    rule: 'insecure-transport',
    severity: 'medium',
    test: (line) => /http:\/\/(?!localhost|127\.0\.0\.1)/.test(line),
    message: 'Plain HTTP URL will send data unencrypted.',
    remediation: 'Use https:// for all non-local endpoints.',
  },
  {
    rule: 'token-in-local-storage',
    severity: 'medium',
    test: (line) => /localStorage\.setItem\([^)]*(token|session|jwt|auth)/i.test(line),
    message: 'Storing auth tokens in localStorage exposes them to any injected script.',
    remediation: 'Keep tokens in httpOnly cookies or rely on the Supabase session in memory.',
  },
  {
    rule: 'logging-sensitive-data',
    severity: 'low',
    appliesTo: 'app',
    test: (line) =>
      /console\.(log|debug|info)\(/.test(line) &&
      /(password|token|secret|passcode|serial|asset_tag|email)/i.test(line),
    message: 'Console logging of sensitive fields exposes them in browser devtools and CI logs.',
    remediation: 'Remove the log or redact the value.',
  },
  {
    rule: 'target-blank-no-noopener',
    severity: 'medium',
    test: (line) => /target="_blank"/.test(line) && !/rel=/.test(line),
    message: 'target="_blank" without rel="noopener" lets the new page access window.opener.',
    remediation: 'Add rel="noopener noreferrer" to the anchor.',
  },
  {
    rule: 'sql-string-concatenation',
    severity: 'high',
    test: (line) => /(SELECT|INSERT|UPDATE|DELETE)\b.*['"`]\s*\+/.test(line),
    message: 'SQL built by string concatenation is vulnerable to injection.',
    remediation: 'Use parameterised queries or a vetted query builder.',
  },
  {
    rule: 'security-definer-without-search-path',
    severity: 'high',
    test: (line, context = { lookahead: '' }) =>
      /SECURITY\s+DEFINER/i.test(line) && !/search_path/i.test(context.lookahead),
    message: 'SECURITY DEFINER function without a pinned search_path can be hijacked via schema shadowing.',
    remediation: 'Add SET search_path = public (or a fully qualified schema) to the function definition.',
  },
  {
    rule: 'grant-to-anon',
    severity: 'high',
    test: (line) => /GRANT[^;]*\bTO\s+anon\b/i.test(line),
    message: 'Granting privileges to the anon role exposes data to unauthenticated callers.',
    remediation: 'Grant only to authenticated, and rely on RLS policies for row filtering.',
  },
]

console.log('Running static security scan...\n')

const textFiles = files.filter((file) => /\.(jsx?|mjs|cjs)$/.test(file))
const appFiles = textFiles.filter((file) => rel(file).startsWith('src/'))
const sqlFiles = files.filter((file) => /\.sql$/.test(file))

for (const file of appFiles) {
  const lines = readFileSync(file, 'utf8').split(/\r?\n/)

  lines.forEach((rawLine, index) => {
    const line = stripComments(rawLine)
    if (!line.trim()) return

    for (const rule of RULES) {
      if (rule.contextOnly) continue
      if (rule.appliesTo === 'app' && !rel(file).startsWith('src/')) continue
      if (rule.test(line)) {        addFinding({
          rule: rule.rule,
          severity: rule.severity,
          file: rel(file),
          line: index + 1,
          message: rule.message,
          remediation: rule.remediation,
        })
      }
    }
  })
}

for (const file of sqlFiles) {
  const lines = readFileSync(file, 'utf8').split(/\r?\n/)
  const contents = lines.join('\n')

  lines.forEach((rawLine, index) => {
    const line = stripComments(rawLine)
    if (!line.trim()) return

    const lookahead = lines
      .slice(index, index + 6)
      .map(stripComments)
      .join(' ')

    for (const rule of RULES) {
      if (!rule.test(line, { lookahead })) continue

      addFinding({
        rule: rule.rule,
        severity: rule.severity,
        file: rel(file),
        line: index + 1,
        message: rule.message,
        remediation: rule.remediation,
      })
    }
  })

  const tables = [...contents.matchAll(/CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?(?:public\.)?(\w+)/gi)].map(
    (match) => match[1].toLowerCase()
  )
  const enabled = new Set(
    [...contents.matchAll(/ALTER\s+TABLE\s+(?:IF\s+EXISTS\s+)?(?:public\.)?(\w+)\s+ENABLE\s+ROW\s+LEVEL\s+SECURITY/gi)].map(
      (match) => match[1].toLowerCase()
    )
  )
  const policies = new Set(
    [...contents.matchAll(/CREATE\s+POLICY[^;]*?\bON\s+(?:public\.)?(\w+)/gi)].map((match) =>
      match[1].toLowerCase()
    )
  )

  tables.forEach((table) => {
    if (!enabled.has(table)) {
      addFinding({
        rule: 'rls-not-enabled',
        severity: 'high',
        file: rel(file),
        line: 1,
        message: `Table ${table} is never enabled for row level security.`,
        remediation: 'Add ALTER TABLE public.' + table + ' ENABLE ROW LEVEL SECURITY;',
      })
    }

    if (!policies.has(table)) {
      addFinding({
        rule: 'rls-no-policies',
        severity: 'high',
        file: rel(file),
        line: 1,
        message: `Table ${table} has row level security enabled but no access policies.`,
        remediation: 'Add explicit SELECT/INSERT/UPDATE policies scoped to the authenticated role.',
      })
    }
  })

  if (tables.length > 0 && enabled.size === 0) {
    addFinding({
      rule: 'rls-missing-entirely',
      severity: 'critical',
      file: rel(file),
      line: 1,
      message: 'The migration creates tables but never enables row level security anywhere.',
      remediation: 'Enable RLS on every table and define policies before exposing data.',
    })
  }

  const definesObjects = /CREATE\s+(OR\s+REPLACE\s+)?(TABLE|FUNCTION|VIEW|PROCEDURE)/i.test(contents)
  const revokesAnon =
    /REVOKE[^;]*\bFROM\s+anon\b/i.test(contents) || /REVOKE[^;]*\bFROM\s+PUBLIC\b/i.test(contents)

  if (definesObjects && !revokesAnon) {
    notes.push(
      'WARN  no REVOKE targeting anon/PUBLIC; Supabase default grants may leave objects reachable pre-login'
    )
  }
}

const counts = findings.reduce((acc, finding) => {
  acc[finding.severity] = (acc[finding.severity] || 0) + 1
  return acc
}, {})

const order = { critical: 0, high: 1, medium: 2, low: 3 }
const sorted = [...findings].sort(
  (a, b) => order[a.severity] - order[b.severity] || a.file.localeCompare(b.file) || a.line - b.line
)

if (notes.length > 0) console.log(notes.join('\n'))

if (sorted.length === 0) {
  console.log(`PASS  Scanned ${files.length} files, no security issues detected`)
  console.log('\nAll static security checks passed.')
  process.exit(0)
}

console.log(`\nScanned ${files.length} files. Findings by severity:`)
console.log(
  ['critical', 'high', 'medium', 'low']
    .filter((severity) => counts[severity])
    .map((severity) => `  ${severity}: ${counts[severity]}`)
    .join('\n')
)

console.log('')
for (const finding of sorted) {
  console.log(`[${finding.severity.toUpperCase()}] ${finding.file}:${finding.line} — ${finding.rule}`)
  console.log(`  ${finding.message}`)
  console.log(`  Fix: ${finding.remediation}`)
  console.log('')
}

const blocking = counts.critical || counts.high || 0

if (blocking > 0) {
  console.log(`FAILED: ${blocking} critical/high finding(s) must be resolved.`)
  process.exit(1)
}

console.log('No critical or high findings. Review the lower-severity items above.')
