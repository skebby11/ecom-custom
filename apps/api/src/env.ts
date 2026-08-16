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
  SESSION_SECRET: z.string().min(1).default('dev-secret-change-me'),
  STRIPE_SECRET_KEY: z.string().optional(),
  STRIPE_PUBLISHABLE_KEY: z.string().optional(),
  STRIPE_WEBHOOK_SECRET: z.string().optional(),
})

export const env = envSchema.parse(process.env)

/** Placeholder presente in `.env.example`: equivale a "non configurato". */
export const STRIPE_PLACEHOLDER_KEY = 'sk_test_xxx'

export function isStripeConfigured(): boolean {
  return Boolean(env.STRIPE_SECRET_KEY) && env.STRIPE_SECRET_KEY !== STRIPE_PLACEHOLDER_KEY
}
