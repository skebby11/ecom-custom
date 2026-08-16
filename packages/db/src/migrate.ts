import { migrate } from 'drizzle-orm/better-sqlite3/migrator'
import { createDb, migrationsFolder, resolveDbPath } from './index.js'

const db = createDb()
migrate(db, { migrationsFolder })
console.log(`✓ migrazioni applicate su ${resolveDbPath()}`)
