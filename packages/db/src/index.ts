import { existsSync, mkdirSync } from 'node:fs'
import { dirname, isAbsolute, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import Database from 'better-sqlite3'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import * as schema from './schema.js'

export * from './schema.js'
export { schema }
export { hashPassword, verifyPassword } from './password.js'

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
/** monorepo root: packages/db/.. /.. */
const repoRoot = resolve(packageRoot, '..', '..')

/** Percorso del file SQLite. Relativo ⇒ risolto dalla root del monorepo. */
export function resolveDbPath(): string {
  const raw = process.env.DATABASE_URL ?? './data/ecom.db'
  const clean = raw.replace(/^file:/, '')
  return isAbsolute(clean) ? clean : resolve(repoRoot, clean)
}

let _db: ReturnType<typeof createDb> | null = null

export function createDb(path = resolveDbPath()) {
  mkdirSync(dirname(path), { recursive: true })
  const sqlite = new Database(path)
  sqlite.pragma('journal_mode = WAL')
  sqlite.pragma('foreign_keys = ON')
  sqlite.pragma('busy_timeout = 5000')
  return drizzle(sqlite, { schema })
}

/** Singleton condiviso dal processo API. */
export function getDb() {
  if (!_db) _db = createDb()
  return _db
}

export type DB = ReturnType<typeof createDb>

export function dbFileExists(): boolean {
  return existsSync(resolveDbPath())
}

export const migrationsFolder = resolve(packageRoot, 'drizzle')
