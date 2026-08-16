import { rmSync } from 'node:fs'
import { resolveDbPath } from './index.js'

const path = resolveDbPath()
for (const suffix of ['', '-wal', '-shm']) {
  rmSync(`${path}${suffix}`, { force: true })
}
console.log(`✓ database rimosso: ${path}\n  esegui  npm run db:migrate && npm run db:seed`)
