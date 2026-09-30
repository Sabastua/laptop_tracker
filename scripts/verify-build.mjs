import { readdirSync, readFileSync, existsSync, statSync } from 'node:fs'
import { join, resolve } from 'node:path'

const root = resolve(process.cwd())
const distDir = join(root, 'dist')
const failures = []
const notes = []

const fail = (message) => failures.push(message)
const pass = (message) => notes.push(`PASS  ${message}`)

const readDirSafe = (dir) => {
  if (!existsSync(dir)) return []
  return readdirSync(dir, { withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => join(dir, entry.name))
}

const walk = (dir) => readDirSafe(dir).flatMap((file) => {
  const stats = statSync(file)
  if (stats.isDirectory()) return walk(file)
  return [file]
})

const walkAll = (dir) => {
  if (!existsSync(dir)) return []
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = join(dir, entry.name)
    if (entry.isDirectory()) return walkAll(full)
    return entry.isFile() ? [full] : []
  })
}

const REQUIRED_ROUTES = ['/login', '/auth/callback', '/pending-access', '/device/', '/handover', '/parts-recycling', '/chat', '/admin']

console.log('Running build verification...\n')

if (!existsSync(distDir)) {
  fail('dist/ not found. Run `npm run build` before verification.')
} else {
  const indexPath = join(distDir, 'index.html')

  if (!existsSync(indexPath)) {
    fail('dist/index.html not found')
  } else {
    const html = readFileSync(indexPath, 'utf8')
    const scriptMatch = html.match(/<script[^>]+src="([^"]+)"/)
    const styleMatch = html.match(/<link[^>]+href="([^"]+\.css)"/)

    if (!scriptMatch) {
      fail('dist/index.html has no bundled script reference')
    } else if (!existsSync(join(distDir, scriptMatch[1].replace(/^\//, '')))) {
      fail(`Bundled script ${scriptMatch[1]} is referenced but missing on disk`)
    } else {
      pass(`Bundle entry present: ${scriptMatch[1]}`)
    }

    if (!styleMatch) {
      fail('dist/index.html has no bundled stylesheet reference')
    } else if (!existsSync(join(distDir, styleMatch[1].replace(/^\//, '')))) {
      fail(`Stylesheet ${styleMatch[1]} is referenced but missing on disk`)
    } else {
      pass(`Stylesheet present: ${styleMatch[1]}`)
    }

    if (!/<div id="root">/.test(html)) {
      fail('index.html is missing the #root mount point expected by src/main.jsx')
    } else {
      pass('index.html has the #root mount point')
    }
  }

  const assetsDir = join(distDir, 'assets')
  const assets = readDirSafe(assetsDir)
  const jsAssets = assets.filter((file) => file.endsWith('.js'))
  const cssAssets = assets.filter((file) => file.endsWith('.css'))

  if (jsAssets.length === 0) fail('No JavaScript assets emitted')
  if (cssAssets.length === 0) fail('No CSS assets emitted (Tailwind may not be compiling)')

  const bundle = jsAssets.map((file) => readFileSync(file, 'utf8')).join('\n')
  const missingRoutes = REQUIRED_ROUTES.filter((route) => !bundle.includes(route))

  if (missingRoutes.length > 0) {
    fail(`Expected routes missing from bundle: ${missingRoutes.join(', ')}`)
  } else {
    pass(`All ${REQUIRED_ROUTES.length} expected routes present in bundle`)
  }

  const totalBytes = assets.reduce((sum, file) => sum + statSync(file).size, 0)
  const totalKb = Math.round(totalBytes / 1024)

  if (totalKb > 2048) {
    fail(`Bundle is ${totalKb} kB, over the 2048 kB budget`)
  } else {
    pass(`Bundle size within budget: ${totalKb} kB`)
  }
}

const pagesDir = join(root, 'src', 'pages')
const pageFiles = readDirSafe(pagesDir).filter((file) => file.endsWith('.jsx'))
const sourceFiles = walkAll(join(root, 'src'))
const sourceText = sourceFiles.map((file) => readFileSync(file, 'utf8')).join('\n')
const orphanPages = pageFiles.filter((file) => {
  const name = file.split(/[\\/]/).pop().replace('.jsx', '')
  return !sourceText.includes(`./pages/${name}`) && !sourceText.includes(`pages/${name}`)
})

if (orphanPages.length > 0) {
  fail(`Unreferenced page files: ${orphanPages.map((file) => file.split(/[\\/]/).pop()).join(', ')}`)
} else {
  pass(`All ${pageFiles.length} page components are referenced`)
}

const placeholders = pageFiles.filter((file) => /\bTODO\b|\bFIXME\b/.test(readFileSync(file, 'utf8')))

if (placeholders.length > 0) {
  fail(`TODO/FIXME markers left in: ${placeholders.map((file) => file.split(/[\\/]/).pop()).join(', ')}`)
} else {
  pass('No TODO/FIXME markers left in pages')
}

console.log(notes.join('\n'))

if (failures.length > 0) {
  console.log(`\nFAILED (${failures.length}):`)
  console.log(failures.map((message) => `  x ${message}`).join('\n'))
  process.exit(1)
}

console.log('\nAll build verification checks passed.')
