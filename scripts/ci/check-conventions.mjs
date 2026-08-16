#!/usr/bin/env node
/**
 * Fa rispettare in CI alcune regole non negoziabili di CLAUDE.md che finora
 * erano affidate solo alla revisione manuale. Tre controlli indipendenti:
 *
 *   1. Niente float per il denaro (Math.round/parseFloat su importi in apps/*).
 *   2. Niente contratti Zod duplicati fuori da packages/shared.
 *   3. docs/API.md aggiornata quando una PR tocca apps/api/src/routes/.
 *
 * Uso: node scripts/ci/check-conventions.mjs
 * Va eseguito dalla radice del repo. Esce con codice 1 se trova violazioni.
 */
import { execFileSync } from 'node:child_process'
import { readFileSync, readdirSync } from 'node:fs'
import { join, relative } from 'node:path'

const ROOT = process.cwd()
const violations = []

/* ------------------------------------------------------------------ */
/* Utility                                                             */
/* ------------------------------------------------------------------ */

const SKIP_DIRS = new Set(['node_modules', 'dist', '.astro', 'coverage'])

/** Elenca ricorsivamente i file con una delle estensioni date sotto una
 * directory. Camminata manuale (niente fs.globSync/readdir recursive) per
 * restare compatibile con qualunque Node >=20, non solo le patch più recenti. */
function listFiles(dir, extensions) {
  const out = []
  function walk(current) {
    let entries
    try {
      entries = readdirSync(current, { withFileTypes: true })
    } catch {
      return
    }
    for (const entry of entries) {
      if (SKIP_DIRS.has(entry.name)) continue
      const full = join(current, entry.name)
      if (entry.isDirectory()) {
        walk(full)
      } else if (extensions.some((ext) => entry.name.endsWith(ext))) {
        out.push(relative(ROOT, full))
      }
    }
  }
  walk(dir)
  return out
}

function readLines(relPath) {
  return readFileSync(join(ROOT, relPath), 'utf8').split('\n')
}

/** true se la riga, tolti gli spazi iniziali, è un commento o parte di un
 * blocco di commento: evita falsi positivi su codice mostrato come esempio
 * nei commenti (es. packages/shared/src/format.ts documenta l'anti-pattern
 * proprio per spiegare perché va evitato). */
function isCommentLine(line) {
  const t = line.trim()
  return t.startsWith('//') || t.startsWith('*') || t.startsWith('/*')
}

/* ------------------------------------------------------------------ */
/* 1. Niente float per il denaro                                       */
/* ------------------------------------------------------------------ */
function checkMoneyFloats() {
  const files = listFiles(join(ROOT, 'apps'), ['.ts', '.tsx', '.astro'])
  for (const relPath of files) {
    const lines = readLines(relPath)
    lines.forEach((line, idx) => {
      if (isCommentLine(line)) return
      if (/Math\.round\(/.test(line)) {
        violations.push({
          rule: 'Tutti gli importi sono interi in centesimi. Mai float per il denaro (CLAUDE.md § Regole non negoziabili)',
          file: relPath,
          line: idx + 1,
          detail: `trovato "Math.round(": usa la conversione su stringa di euroToCents() da @ecom/shared, non Math.round su un float`,
        })
      }
      if (/parseFloat\(/.test(line)) {
        violations.push({
          rule: 'Tutti gli importi sono interi in centesimi. Mai float per il denaro (CLAUDE.md § Regole non negoziabili)',
          file: relPath,
          line: idx + 1,
          detail: `trovato "parseFloat(": usa euroToCents() da @ecom/shared, che fa il parsing su stringa senza passare da un float`,
        })
      }
    })
  }
}

/* ------------------------------------------------------------------ */
/* 2. Niente contratti Zod duplicati fuori da packages/shared           */
/* ------------------------------------------------------------------ */
// Debito noto, individuato scrivendo questo stesso controllo: rotta e schema
// da correggere in un intervento a parte (fuori scope per la PR CI), non
// silenziato senza motivo. Rimuovere la riga qui sotto quando è risolto.
const KNOWN_EXCEPTIONS = new Set(['apps/api/src/routes/admin/collections.ts:collectionInputSchema'])

function importedFromShared(fileContent) {
  const names = new Set()
  const re = /import\s+(?:type\s+)?\{([^}]*)\}\s+from\s+['"]@ecom\/shared['"]/gs
  let m
  while ((m = re.exec(fileContent))) {
    for (const part of m[1].split(',')) {
      const name = part.trim().split(/\s+as\s+/)[0].trim()
      if (name) names.add(name)
    }
  }
  return names
}

function checkDuplicateContracts() {
  const files = listFiles(join(ROOT, 'apps'), ['.ts'])
  for (const relPath of files) {
    const content = readFileSync(join(ROOT, relPath), 'utf8')
    const shared = importedFromShared(content)
    const lines = content.split('\n')
    lines.forEach((line, idx) => {
      if (isCommentLine(line)) return
      // Un payload di richiesta (request.body) validato con uno schema Zod
      // non importato da @ecom/shared: il candidato più concreto per un
      // contratto duplicato. Le query string (request.query) e la
      // validazione di process.env (env.ts) restano fuori di proposito:
      // non sono contratti condivisi col frontend, sono dettagli locali.
      const match = line.match(/\b(\w+Schema)\.(?:parse|safeParse)\(\s*request\.body\s*\)/)
      if (!match) return
      const schemaName = match[1]
      if (shared.has(schemaName)) return
      const key = `${relPath}:${schemaName}`
      if (KNOWN_EXCEPTIONS.has(key)) return
      violations.push({
        rule: 'I contratti stanno in packages/shared/src/index.ts, non duplicati in locale (CLAUDE.md § Regole non negoziabili)',
        file: relPath,
        line: idx + 1,
        detail: `"${schemaName}" valida request.body ma non risulta importato da '@ecom/shared': se è un payload di rotta, lo schema Zod deve vivere in packages/shared`,
      })
    })
  }
}

/* ------------------------------------------------------------------ */
/* 3. docs/API.md aggiornata quando cambiano le rotte                  */
/* ------------------------------------------------------------------ */
function checkApiDocsUpdated() {
  if (process.env.GITHUB_EVENT_NAME !== 'pull_request') return

  const baseSha = process.env.PR_BASE_SHA
  const headSha = process.env.PR_HEAD_SHA
  if (!baseSha || !headSha) {
    console.warn(
      '[check-conventions] PR_BASE_SHA/PR_HEAD_SHA non impostate: salto il controllo su docs/API.md (serve fetch-depth adeguato in checkout).'
    )
    return
  }

  let changed
  try {
    changed = execFileSync('git', ['diff', '--name-only', baseSha, headSha], {
      cwd: ROOT,
      encoding: 'utf8',
    })
      .split('\n')
      .map((s) => s.trim())
      .filter(Boolean)
  } catch (err) {
    console.warn(`[check-conventions] git diff fallito, salto il controllo su docs/API.md: ${err.message}`)
    return
  }

  const touchesRoutes = changed.some((f) => f.startsWith('apps/api/src/routes/'))
  const touchesDocs = changed.includes('docs/API.md')
  if (touchesRoutes && !touchesDocs) {
    violations.push({
      rule: 'docs/API.md è la specifica delle rotte: va aggiornata nello stesso commit che cambia una rotta (CLAUDE.md § Regole non negoziabili)',
      file: 'docs/API.md',
      line: null,
      detail: `la PR modifica file sotto apps/api/src/routes/ ma non tocca docs/API.md (file cambiati: ${changed.length})`,
    })
  }
}

/* ------------------------------------------------------------------ */
/* Esecuzione                                                          */
/* ------------------------------------------------------------------ */
checkMoneyFloats()
checkDuplicateContracts()
checkApiDocsUpdated()

if (violations.length === 0) {
  console.log('[check-conventions] Nessuna violazione delle convenzioni di CLAUDE.md.')
  process.exit(0)
}

console.error(`[check-conventions] ${violations.length} violazione/i delle convenzioni di CLAUDE.md:\n`)
for (const v of violations) {
  const loc = v.line ? `${v.file}:${v.line}` : v.file
  console.error(`- ${loc}\n  Regola: ${v.rule}\n  ${v.detail}\n`)
}
process.exit(1)
