import { dirname, isAbsolute, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'drizzle-kit'

// drizzle-kit carica questo file transpilato: non può importare i sorgenti TS
// del package, quindi il percorso del DB è risolto qui in modo autonomo.
// L'ancora è la posizione di questo file, non `process.cwd()`: lanciare
// `drizzle-kit --config packages/db/drizzle.config.ts` dalla root del monorepo
// altrimenti risolverebbe `./data/ecom.db` su un database diverso da quello
// che usa l'applicazione.
const packageRoot = dirname(fileURLToPath(import.meta.url))
const repoRoot = resolve(packageRoot, '..', '..')

const raw = (process.env.DATABASE_URL ?? './data/ecom.db').replace(/^file:/, '')
const url = isAbsolute(raw) ? raw : resolve(repoRoot, raw)

export default defineConfig({
  schema: './src/schema.ts',
  out: './drizzle',
  dialect: 'sqlite',
  dbCredentials: { url },
  strict: true,
})
