#!/usr/bin/env node
/**
 * Generates, from the canonical tokens.json (CDS collections/modes/variables shape):
 *   1. styles/tokens/_variables.css  — the subset of CDS color primitives this app's
 *      theme layer actually resolves to, as plain :root custom properties (alias tokens
 *      become var() references), in CivicDataLab/DataSpaceFrontend's _variables.css
 *      naming style. Pruned, not the full palette — see the comment in buildVariablesCss.
 *   2. src/generated/tokens.css      — this app's Tailwind v4 theme layer: shadcn/ui's
 *      expected custom properties (--primary, --background, --success, ...) aliased
 *      onto the CDS primitives from _variables.css, plus the @theme inline block.
 *
 * tokens.json is the ONLY hand-authored source. Never edit the outputs directly.
 *   Run: npm run gen:tokens   (also runs automatically via predev / prebuild)
 *
 * Load order matters: src/index.css must import _variables.css before tokens.css,
 * since tokens.css's aliases resolve against the custom properties _variables.css defines.
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const tokens = JSON.parse(readFileSync(resolve(root, 'tokens.json'), 'utf8'))

const kebab = (p) => p.toLowerCase().replace(/\s+/g, '-').replace(/\//g, '-')
const findCollection = (name) => tokens.collections.find((c) => c.name === name)
const variablesOf = (collectionName, modeName) => {
  const col = findCollection(collectionName)
  const mode = modeName ? col.modes.find((m) => m.name === modeName) : col.modes[0]
  return mode.variables
}

/* ------------------------------------------------ src/generated/tokens.css (app theme) ---- */
// Maps this app's Tailwind/shadcn roles onto CDS primitives defined in _variables.css.
// This mapping is app-specific (CDS has no "primary"/"muted"/"success" vocabulary of its
// own) and is therefore hand-maintained here rather than derived from tokens.json.
const colorRoleMap = {
  background: 'surface-default',
  foreground: 'text-default',
  card: 'surface-default',
  'card-foreground': 'text-default',
  popover: 'surface-default',
  'popover-foreground': 'text-default',
  primary: 'brand-blue-primary-color',
  'primary-foreground': 'brand-white',
  secondary: 'surface-subdued',
  'secondary-foreground': 'text-default',
  muted: 'surface-subdued',
  'muted-foreground': 'text-medium',
  accent: 'brand-orange-secondary-color',
  'accent-foreground': 'brand-blue-primary-color',
  destructive: 'action-primary-critical-default',
  'destructive-foreground': 'brand-white',
  success: 'action-primary-success-default',
  'success-foreground': 'brand-white',
  warning: 'base-amber-solid-9',
  'warning-foreground': 'brand-blue-primary-color',
  border: 'border-disabled',
  input: 'border-disabled',
  ring: 'brand-blue-primary-color',
}
const chartRoleMap = {
  'chart-1': 'brand-orange-secondary-color',
  'chart-2': 'brand-chart-2',
  'chart-3': 'brand-chart-3',
  'chart-4': 'brand-chart-4',
  'chart-5': 'brand-chart-5',
}
const sidebarRoleMap = {
  sidebar: 'base-gray-slate-solid-1',
  'sidebar-foreground': 'text-default',
  'sidebar-primary': 'brand-blue-primary-color',
  'sidebar-primary-foreground': 'brand-white',
  'sidebar-accent': 'brand-orange-secondary-color',
  'sidebar-accent-foreground': 'brand-blue-primary-color',
  'sidebar-border': 'border-disabled',
  'sidebar-ring': 'brand-blue-primary-color',
}
const surfaceRoleMap = {
  'page-background': 'base-gray-slate-solid-3',
  'header-background': 'brand-header-background-color',
  'breadcrumb-background': 'brand-orange-secondary-color',
}

/* ------------------------------------------------------- styles/tokens/_variables.css ---- */
// tokens.json carries the full reconciled CDS palette (295 color tokens), but this app
// only ever reaches CDS primitives through the four role maps above — nothing in src/
// references a base/semantic CDS token directly (verified by grep). So _variables.css is
// pruned to the transitive closure of what those role maps actually resolve to, rather
// than shipping ~275 unused custom properties. Extend a role map (or add roots here) and
// rerun `npm run gen:tokens` to pull more of tokens.json's palette in.
function usedColorNames() {
  const byKebab = new Map()
  for (const v of variablesOf('Colors', 'Light')) byKebab.set(kebab(v.name), v)

  const roots = [
    ...Object.values(colorRoleMap),
    ...Object.values(chartRoleMap),
    ...Object.values(sidebarRoleMap),
    ...Object.values(surfaceRoleMap),
  ]
  const used = new Set()
  const stack = [...roots]
  while (stack.length) {
    const name = stack.pop()
    if (used.has(name)) continue
    used.add(name)
    const v = byKebab.get(name)
    if (!v) throw new Error(`role map references unknown CDS primitive: --${name}`)
    if (v.isAlias) stack.push(kebab(v.value.name))
  }
  return used
}

function cssLine(v, formatLiteral) {
  const name = `--${kebab(v.name)}`
  const value = v.isAlias ? `var(--${kebab(v.value.name)})` : formatLiteral(v.value)
  return `  ${name}: ${value};`
}

function buildVariablesCss() {
  const used = usedColorNames()
  const lines = []
  for (const v of variablesOf('Colors', 'Light')) {
    if (used.has(kebab(v.name))) lines.push(cssLine(v, (s) => s))
  }

  return `/* GENERATED FROM tokens.json — DO NOT EDIT.
 * Regenerate with: npm run gen:tokens
 * Canonical source of truth: ../../tokens.json
 *
 * CDS color primitives — pruned to the ${used.size} of tokens.json's 295 that this app's
 * theme layer (src/generated/tokens.css) actually resolves to. tokens.json itself still
 * carries the full palette (base color scales, semantic layer, spacing, borders, effects,
 * typography, motion, z-index) as a complete reconciled reference; nothing here or in the
 * app is meant to be the canonical CDS source, just what's wired up today.
 */

:root {
${lines.join('\n')}
}
`
}

function buildAppThemeCss() {
  const rootLines = []
  const themeLines = []
  const push = (title, roleMap, themed = true) => {
    rootLines.push(`  /* ${title} */`)
    for (const [role, primitive] of Object.entries(roleMap)) rootLines.push(`  --${role}: var(--${primitive});`)
    rootLines.push('')
    if (!themed) return
    themeLines.push(`  /* ${title} */`)
    for (const role of Object.keys(roleMap)) themeLines.push(`  --color-${role}: var(--${role});`)
    themeLines.push('')
  }

  rootLines.push('  /* Typography */')
  rootLines.push(`  --font-sans: 'Inter', system-ui, sans-serif;`)
  rootLines.push(`  --font-mono: 'JetBrains Mono', monospace;`)
  rootLines.push('')
  themeLines.push('  /* Typography */')
  themeLines.push('  --font-sans: var(--font-sans);')
  themeLines.push('  --font-mono: var(--font-mono);')
  themeLines.push('')

  rootLines.push('  /* Border radius — app-specific proportional scale, no CDS equivalent */')
  rootLines.push('  --radius: 0.625rem;')
  rootLines.push('  --radius-sm: calc(var(--radius) - 2px);')
  rootLines.push('  --radius-md: var(--radius);')
  rootLines.push('  --radius-lg: calc(var(--radius) + 4px);')
  rootLines.push('  --radius-xl: calc(var(--radius) + 8px);')
  rootLines.push('')
  themeLines.push('  /* Border radius */')
  themeLines.push('  --radius-sm: var(--radius-sm);')
  themeLines.push('  --radius-md: var(--radius-md);')
  themeLines.push('  --radius-lg: var(--radius-lg);')
  themeLines.push('  --radius-xl: var(--radius-xl);')
  themeLines.push('')

  push('Base, brand & semantic colors', colorRoleMap)
  push('Chart palette', chartRoleMap)
  push('Sidebar', sidebarRoleMap)
  push('App-chrome surfaces', surfaceRoleMap)

  return `/* GENERATED FROM tokens.json — DO NOT EDIT.
 * Regenerate with: npm run gen:tokens
 * Canonical source of truth: ../../tokens.json
 *
 * This app's Tailwind v4 theme layer. Every custom property below aliases a
 * CDS primitive defined in styles/tokens/_variables.css (imported first by
 * src/index.css) — shadcn/ui role names (--primary, --background, ...) have
 * no equivalent in CDS's own vocabulary, so this mapping is hand-maintained
 * in scripts/generate-tokens.mjs rather than derived from tokens.json.
 */

:root {
${rootLines.join('\n').replace(/\n+$/, '')}
}

@theme inline {
${themeLines.join('\n').replace(/\n+$/, '')}
}
`
}

/* ---------------------------------------------------------------------- write ---- */
mkdirSync(resolve(root, 'styles/tokens'), { recursive: true })
mkdirSync(resolve(root, 'src/generated'), { recursive: true })
writeFileSync(resolve(root, 'styles/tokens/_variables.css'), buildVariablesCss())
writeFileSync(resolve(root, 'src/generated/tokens.css'), buildAppThemeCss())

const totalColors = variablesOf('Colors', 'Light').length
const used = usedColorNames()
console.log(
  `[gen:tokens] ${used.size}/${totalColors} color tokens used → styles/tokens/_variables.css; app theme layer → src/generated/tokens.css`,
)
