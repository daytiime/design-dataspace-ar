#!/usr/bin/env node
/**
 * Generates, from the canonical tokens.json (CDS collections/modes/variables shape):
 *   1. styles/tokens/_variables.css  — the CDS primitive + semantic palette as plain
 *      :root custom properties (alias tokens become var() references, matching
 *      CivicDataLab/DataSpaceFrontend's styles/tokens/_variables.css format).
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

/* ------------------------------------------------------- styles/tokens/_variables.css ---- */
function cssLine(v, formatLiteral) {
  const name = `--${kebab(v.name)}`
  const value = v.isAlias ? `var(--${kebab(v.value.name)})` : formatLiteral(v.value)
  return `  ${name}: ${value};`
}

function buildVariablesCss() {
  const lines = []

  lines.push('  /* Colors */')
  for (const v of variablesOf('Colors', 'Light')) lines.push(cssLine(v, (s) => s))
  lines.push('')

  lines.push('  /* Spacing */')
  for (const v of variablesOf('Spacing / Numericals')) lines.push(cssLine(v, (n) => `${n}px`))
  lines.push('')

  lines.push('  /* Borders */')
  for (const v of variablesOf('Borders')) lines.push(cssLine(v, (n) => `${n}px`))
  lines.push('')

  lines.push('  /* Effects (shadows) */')
  for (const v of variablesOf('Effects')) {
    const name = `--${kebab(v.name)}`
    const layers = v.value.effects.map((e) => {
      const inset = e.type === 'INNER_SHADOW' ? 'inset ' : ''
      const { r, g, b, a } = e.color
      return `${inset}${e.offset.x}px ${e.offset.y}px ${e.radius}px ${e.spread}px rgba(${r}, ${g}, ${b}, ${a})`
    })
    lines.push(`  ${name}: ${layers.join(', ')};`)
  }
  lines.push('')

  lines.push('  /* Typography scale */')
  for (const v of variablesOf('Typography Scale')) lines.push(cssLine(v, (s) => s))
  lines.push('')

  lines.push('  /* Motion */')
  for (const v of variablesOf('Motion')) lines.push(cssLine(v, (s) => s))
  lines.push('')

  lines.push('  /* Z-index */')
  for (const v of variablesOf('Z-Index')) lines.push(cssLine(v, (n) => `${n}`))

  return `/* GENERATED FROM tokens.json — DO NOT EDIT.
 * Regenerate with: npm run gen:tokens
 * Canonical source of truth: ../../tokens.json
 *
 * CDS primitive + semantic palette. This app's own Tailwind theme
 * (shadcn/ui roles like --primary, --background) lives in
 * src/generated/tokens.css and aliases onto the custom properties below —
 * that file must be imported after this one.
 */

:root {
${lines.join('\n').replace(/\n+$/, '')}
}
`
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

const colorCount = variablesOf('Colors', 'Light').length
console.log(
  `[gen:tokens] ${colorCount} color tokens → styles/tokens/_variables.css; app theme layer → src/generated/tokens.css`,
)
