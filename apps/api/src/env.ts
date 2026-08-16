import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { z } from 'zod'

/**
 * Carica `.env` dalla root del monorepo (best-effort). In produzione le
 * variabili sono tipicamente iniettate dall'ambiente, quindi un file
 * mancante non è un errore fatale.
 */
function loadDotEnv(): void {
  if (typeof process.loadEnvFile !== 'function') return
  const srcDir = fileURLToPath(new URL('.', import.meta.url))
  const repoRoot = resolve(srcDir, '..', '..', '..')
  try {
    process.loadEnvFile(resolve(repoRoot, '.env'))
  } catch {
    // nessun .env presente: si prosegue con le variabili già nell'ambiente
  }
}

loadDotEnv()

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  DATABASE_URL: z.string().min(1).default('./data/ecom.db'),
  API_PORT: z.coerce.number().int().positive().default(3001),
  API_HOST: z.string().min(1).default('0.0.0.0'),
  PUBLIC_SITE_URL: z.string().min(1).default('http://localhost:4321'),
  STRIPE_SECRET_KEY: z.string().optional(),
  STRIPE_PUBLISHABLE_KEY: z.string().optional(),
  STRIPE_WEBHOOK_SECRET: z.string().optional(),
})

export const env = envSchema.parse(process.env)

/**
 * Fuori dallo sviluppo, restare sui default di `.env.example` è quasi sempre un
 * deploy incompleto: `PUBLIC_SITE_URL` sbagliata rompe i redirect di Stripe e i
 * controlli di origine dello storefront. Meglio non partire affatto che partire
 * in uno stato che fallisce solo al primo pagamento.
 */
export function assertProductionEnv(): void {
  if ((process.env.NODE_ENV ?? 'production') === 'development') return

  const problems: string[] = []
  if (env.PUBLIC_SITE_URL.includes('localhost') || env.PUBLIC_SITE_URL.includes('127.0.0.1')) {
    problems.push(`PUBLIC_SITE_URL punta ancora a ${env.PUBLIC_SITE_URL}`)
  }

  if (problems.length > 0) {
    throw new Error(
      `Configurazione non valida per NODE_ENV="${process.env.NODE_ENV ?? 'production'}":\n` +
        problems.map((p) => `  - ${p}`).join('\n')
    )
  }
}

/** Placeholder presente in `.env.example`: equivale a "non configurato". */
export const STRIPE_PLACEHOLDER_KEY = 'sk_test_xxx'

export function isStripeConfigured(): boolean {
  return Boolean(env.STRIPE_SECRET_KEY) && env.STRIPE_SECRET_KEY !== STRIPE_PLACEHOLDER_KEY
}
