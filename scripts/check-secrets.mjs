import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { join, resolve } from 'node:path'

const root = resolve(process.cwd())
const failures = []
const notes = []

const fail = (message) => failures.push(message)
const pass = (message) => notes.push(`PASS  ${message}`)

const walk = (dir) => {
  if (!existsSync(dir)) return []

  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = join(dir, entry.name)
    if (entry.isDirectory()) return walk(full)
    return entry.isFile() ? [full] : []
  })
}

const git = (...args) => {
  try {
    return execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim()
  } catch {
    return ''
  }
}

console.log('Running secrets hygiene check...\n')

const trackedEnv = git('ls-files', '--', '.env', '.env.local', '.env.production')

if (trackedEnv) {
  fail(`Environment files are tracked by git: ${trackedEnv.split('\n').join(', ')}`)
} else {
  pass('No .env files tracked by git')
}

if (existsSync(join(root, '.env')) && !existsSync(join(root, '.env.example'))) {
  fail('.env exists but .env.example is missing (new contributors cannot configure the project)')
} else {
  pass('.env.example template present')
}

const supabaseUrlPattern = /https:\/\/[a-z0-9]{16,}\.supabase\.co/i
const jwtLikePattern = /\beyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{10,}/

const scannable = [
  ...walk(join(root, 'src')),
  ...walk(join(root, 'scripts')),
  ...walk(join(root, 'supabase')),
].filter((file) => /\.(jsx?|mjs|css|html|sql|json|ya?ml|md)$/.test(file) && statSync(file).size < 2_000_000)

const leaked = scannable.filter((file) => {
  const contents = readFileSync(file, 'utf8')
  return supabaseUrlPattern.test(contents) || jwtLikePattern.test(contents)
})

if (leaked.length > 0) {
  fail(
    `Supabase URL or key literal found in committed source: ${leaked
      .map((file) => file.replace(root, '.'))
      .join(', ')}`
  )
} else {
  pass(`No Supabase URL or key literals in ${scannable.length} source files`)
}

const ignoreCheck = git('check-ignore', '-q', '.env')

if (ignoreCheck === '' && git('check-ignore', '.env') === '') {
  fail('.env is not covered by .gitignore')
} else {
  pass('.env is covered by .gitignore')
}

const requiredKeys = ['VITE_SUPABASE_URL', 'VITE_SUPABASE_PUBLISHABLE_KEY', 'VITE_POSTHOG_KEY']
const examplePath = join(root, '.env.example')

if (existsSync(examplePath)) {
  const example = readFileSync(examplePath, 'utf8')
  const missingKeys = requiredKeys.filter((key) => !example.includes(key))

  if (missingKeys.length > 0) {
    fail(`.env.example is missing keys: ${missingKeys.join(', ')}`)
  } else {
    pass(`.env.example documents ${requiredKeys.length} required keys`)
  }
}

const migrationPath = join(root, 'supabase-migrations.sql')

if (existsSync(migrationPath)) {
  const migration = readFileSync(migrationPath, 'utf8')
  const requiredTables = [
    'public.profiles',
    'public.devices',
    'public.device_handlers',
    'public.device_actions',
    'public.device_parts',
    'public.handover_requests',
    'public.allowed_engineers',
    'public.device_reviews',
    'public.device_comments',
  ]
  const missingTables = requiredTables.filter(
    (table) => !migration.includes(`CREATE TABLE IF NOT EXISTS ${table}`)
  )

  if (missingTables.length > 0) {
    fail(`Migration script does not create: ${missingTables.join(', ')}`)
  } else {
    pass(`Migration script creates all ${requiredTables.length} required tables`)
  }

  const dollarQuoteCount = (migration.match(/\$\$/g) || []).length

  if (dollarQuoteCount % 2 !== 0) {
    fail(`Migration has an unbalanced $$ block (${dollarQuoteCount} occurrences)`)
  } else {
    pass('Migration function bodies are balanced')
  }
} else {
  fail('supabase-migrations.sql not found')
}

console.log(notes.join('\n'))

if (failures.length > 0) {
  console.log(`\nFAILED (${failures.length}):`)
  console.log(failures.map((message) => `  x ${message}`).join('\n'))
  process.exit(1)
}

console.log('\nAll secrets hygiene checks passed.')
