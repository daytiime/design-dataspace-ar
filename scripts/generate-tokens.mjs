#!/usr/bin/env node
/**
 * Generates, from the canonical tokens.json (CDS collections/modes/variables shape):
 *   1. styles/tokens/_variables.css  — the subset of CDS color primitives this app's
 *      theme layer actually resolves to, as plain :root custom properties (alias tokens
 *      become var() references), in CivicDataLab/DataSpaceFrontend's _variables.css
 *      naming style. Pruned, not the full palette — see the comment in buildVariablesCss.
 *   2. src/generated/tokens.css      — this app's Tailwind v4 theme layer, mechanically
 *      derived from tokens.json's "App Theme" collection: shadcn/ui's expected custom
 *      properties (--primary, --background, --success, ...) aliased onto the CDS
 *      primitives from _variables.css, plus the @theme inline block.
 *
 * tokens.json is the ONLY hand-authored source — including the app-role -> CDS-primitive
 * mapping, which lives in tokens.json's "App Theme" collection rather than as a hardcoded
 * table in this script. Never edit the two generated files directly.
 *
 * tokens.json's top-level `collections` array is scoped to what this app actually uses
 * (a pruned Colors collection + App Theme) — this script only ever reads that key. The
 * full reconciled CDS palette (base scales, semantic layer, spacing, borders, effects,
 * typography, motion, z-index) lives under the sibling `unusedCollections` key instead of
 * being deleted; it's inert reference material, not read here. Bringing a token back into
 * use means moving its collection (or entry) from `unusedCollections` into `collections`.
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

const appTheme = variablesOf('App Theme', 'Light')

/* ------------------------------------------------------- styles/tokens/_variables.css ---- */
// tokens.json's active Colors collection is already scoped to what this app uses, but this
// still walks the transitive closure of "App Theme"'s color aliases as a validity check: if
// "App Theme" ever references a primitive that isn't in the active Colors collection (e.g.
// one still parked under the top-level `unusedCollections` key), this throws instead of
// silently emitting a broken var() reference — the fix is to move that entry from
// `unusedCollections` into `collections` and rerun `npm run gen:tokens`.
function usedColorNames() {
  const byKebab = new Map()
  for (const v of variablesOf('Colors', 'Light')) byKebab.set(kebab(v.name), v)

  const roots = appTheme
    .filter((v) => v.type === 'color' && v.isAlias)
    .map((v) => kebab(v.value.name))
  const used = new Set()
  const stack = [...roots]
  while (stack.length) {
    const name = stack.pop()
    if (used.has(name)) continue
    used.add(name)
    const v = byKebab.get(name)
    if (!v) throw new Error(`"App Theme" references unknown CDS primitive: --${name}`)
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
 * The ${used.size} CDS color primitives this app's theme layer (src/generated/tokens.css,
 * derived from tokens.json's "App Theme" collection) actually resolves to. The full
 * reconciled CDS palette (base color scales, semantic layer, spacing, borders, effects,
 * typography, motion, z-index) lives under tokens.json's \`unusedCollections\` key instead
 * of being deleted — kept as reference, not read by this script.
 */

:root {
${lines.join('\n')}
}
`
}

/* ------------------------------------------------ src/generated/tokens.css (app theme) ---- */
// Comment-header grouping only (cosmetic) — tokens.json's "App Theme" collection has no
// group field of its own, so entries are bucketed by simple name/type pattern matching.
const GROUP_ORDER = ['Typography', 'Border radius', 'Base, brand & semantic colors', 'Chart palette', 'Sidebar', 'App-chrome surfaces']
function groupOf(v) {
  const name = kebab(v.name)
  if (name.startsWith('chart-')) return 'Chart palette'
  if (name === 'sidebar' || name.startsWith('sidebar-')) return 'Sidebar'
  if (['page-background', 'header-background', 'breadcrumb-background'].includes(name)) return 'App-chrome surfaces'
  if (v.type === 'fontFamily') return 'Typography'
  if (v.type === 'dimension') return 'Border radius'
  return 'Base, brand & semantic colors'
}
// Whether this entry gets a Tailwind @theme inline key, and under what name.
function themeKey(v) {
  const name = kebab(v.name)
  if (v.type === 'color') return `--color-${name}`
  if (v.type === 'fontFamily') return `--${name}`
  if (v.type === 'dimension' && name !== 'radius') return `--${name}` // radius (DEFAULT) has no theme key
  return null
}

function buildAppThemeCss() {
  const byGroup = new Map(GROUP_ORDER.map((g) => [g, []]))
  for (const v of appTheme) byGroup.get(groupOf(v)).push(v)

  const rootLines = []
  const themeLines = []
  for (const group of GROUP_ORDER) {
    const vars = byGroup.get(group)
    if (!vars.length) continue
    rootLines.push(`  /* ${group} */`)
    for (const v of vars) rootLines.push(cssLine(v, (s) => s))
    rootLines.push('')

    const themed = vars.filter((v) => themeKey(v))
    if (!themed.length) continue
    themeLines.push(`  /* ${group} */`)
    for (const v of themed) themeLines.push(`  ${themeKey(v)}: var(--${kebab(v.name)});`)
    themeLines.push('')
  }

  return `/* GENERATED FROM tokens.json — DO NOT EDIT.
 * Regenerate with: npm run gen:tokens
 * Canonical source of truth: ../../tokens.json ("App Theme" collection)
 *
 * This app's Tailwind v4 theme layer. Every color custom property below aliases a
 * CDS primitive defined in styles/tokens/_variables.css (imported first by
 * src/index.css) — shadcn/ui role names (--primary, --background, ...) have no
 * equivalent in CDS's own vocabulary, so tokens.json's "App Theme" collection
 * hand-maps them; font-family and the radius scale have no CDS equivalent at all
 * and are literal there.
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
  `[gen:tokens] ${used.size}/${totalColors} color tokens used → styles/tokens/_variables.css; ${appTheme.length} app-theme tokens → src/generated/tokens.css`,
)
