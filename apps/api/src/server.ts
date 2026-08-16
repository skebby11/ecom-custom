import { buildApp } from './app.js'
import { env } from './env.js'

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
