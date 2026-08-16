import { isAbsolute, resolve } from 'node:path'
import { defineConfig } from 'drizzle-kit'

// drizzle-kit carica questo file in CJS: non può importare i sorgenti TS del
// package, quindi il percorso del DB è risolto qui in modo autonomo.
const raw = (process.env.DATABASE_URL ?? './data/ecom.db').replace(/^file:/, '')
const repoRoot = resolve(process.cwd(), '..', '..')
const url = isAbsolute(raw) ? raw : resolve(repoRoot, raw)

export default defineConfig({
  schema: './src/schema.ts',
  out: './drizzle',
  dialect: 'sqlite',
  dbCredentials: { url },
  strict: true,
})
