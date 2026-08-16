import { buildApp } from './app.js'
import { assertProductionEnv, env } from './env.js'

// prima di aprire la porta: fuori dallo sviluppo un deploy incompleto deve
// fallire subito e in modo leggibile, non al primo pagamento
try {
  assertProductionEnv()
} catch (error) {
  console.error(`✗ ${error instanceof Error ? error.message : String(error)}`)
  process.exit(1)
}

const app = buildApp()

app
  .listen({ port: env.API_PORT, host: env.API_HOST })
  .then((address) => {
    app.log.info(`API in ascolto su ${address}`)
  })
  .catch((err) => {
    app.log.error(err)
    process.exit(1)
  })
