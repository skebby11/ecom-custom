import { rmSync } from 'node:fs'
import { resolveDbPath } from './index.js'

/**
 * Cancella il database. È distruttivo e irreversibile: un `DATABASE_URL`
 * rimasto esportato nella shell basta a puntare al database sbagliato, quindi
 * lo script si ferma fuori dallo sviluppo e richiede un flag esplicito per
 * forzare.
 */
const path = resolveDbPath()
const forced = process.argv.includes('--force')
// fail-closed: `NODE_ENV` non impostata è la norma su una macchina di produzione,
// quindi trattarla come sviluppo renderebbe la guardia inutile proprio dove serve.
// Serve un `NODE_ENV=development` esplicito, oppure `--force`.
const nodeEnv = process.env.NODE_ENV ?? 'production'

if (nodeEnv !== 'development' && !forced) {
  console.error(
    `✗ Rifiuto di cancellare il database con NODE_ENV="${nodeEnv}".\n` +
      `  Percorso: ${path}\n\n` +
      '  In sviluppo:  NODE_ENV=development npm run db:reset\n' +
      '  Per forzare:  npm run db:reset -- --force'
  )
  process.exit(1)
}

if (!forced) {
  console.log(`Sto per cancellare: ${path}`)
}

for (const suffix of ['', '-wal', '-shm']) {
  rmSync(`${path}${suffix}`, { force: true })
}

console.log(`✓ database rimosso: ${path}\n  esegui  npm run db:migrate && npm run db:seed`)
