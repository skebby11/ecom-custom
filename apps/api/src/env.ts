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

/**
 * NODE_ENV normalizzato una sola volta, usato ovunque nel processo. Prima
 * `assertProductionEnv()` trattava un valore assente come "production" (fail
 * closed) mentre lo schema Zod di `env.NODE_ENV` lo faceva ricadere su
 * "development" (fail open): con `PUBLIC_SITE_URL` configurata correttamente
 * il server partiva comunque, ma `buildApp()` restava convinto di essere in
 * sviluppo e riapriva CORS a `localhost` con `credentials: true`. Un solo
 * default, coerente e restrittivo, elimina la divergenza.
 */
const effectiveNodeEnv: 'development' | 'production' | 'test' =
  process.env.NODE_ENV === 'development' || process.env.NODE_ENV === 'test'
    ? process.env.NODE_ENV
    : 'production'

const envSchema = z.object({
  DATABASE_URL: z.string().min(1).default('./data/ecom.db'),
  API_PORT: z.coerce.number().int().positive().default(3001),
  API_HOST: z.string().min(1).default('0.0.0.0'),
  PUBLIC_SITE_URL: z.string().min(1).default('http://localhost:4321'),
  STRIPE_SECRET_KEY: z.string().optional(),
  STRIPE_PUBLISHABLE_KEY: z.string().optional(),
  STRIPE_WEBHOOK_SECRET: z.string().optional(),
})

export const env = { ...envSchema.parse(process.env), NODE_ENV: effectiveNodeEnv }

/** Hostname dell'URL, o `undefined` se non è un URL valido (niente eccezioni qui). */
function safeHostname(value: string): string | undefined {
  try {
    return new URL(value).hostname.toLowerCase().replace(/^\[|\]$/g, '')
  } catch {
    return undefined
  }
}

/**
 * Fuori dallo sviluppo, restare sui default di `.env.example` è quasi sempre un
 * deploy incompleto: `PUBLIC_SITE_URL` sbagliata rompe i redirect di Stripe e i
 * controlli di origine dello storefront. Meglio non partire affatto che partire
 * in uno stato che fallisce solo al primo pagamento.
 */
export function assertProductionEnv(): void {
  if (env.NODE_ENV === 'development') return

  const problems: string[] = []

  // Confrontiamo l'hostname isolato, non il testo dell'URL: una ricerca
  // testuale non blocca `127.0.0.2`/altri indirizzi `127/8`/`::1`, e rifiuta
  // per errore host pubblici che contengono "localhost" nel path.
  const hostname = safeHostname(env.PUBLIC_SITE_URL)
  const isLoopback =
    hostname === 'localhost' || hostname === '::1' || /^127(?:\.\d{1,3}){3}$/.test(hostname ?? '')
  if (isLoopback) {
    problems.push(`PUBLIC_SITE_URL punta ancora a ${env.PUBLIC_SITE_URL}`)
  }

  if (problems.length > 0) {
    throw new Error(
      `Configurazione non valida per NODE_ENV="${env.NODE_ENV}":\n` +
        problems.map((p) => `  - ${p}`).join('\n')
    )
  }
}

/** Placeholder presente in `.env.example`: equivale a "non configurato". */
export const STRIPE_PLACEHOLDER_KEY = 'sk_test_xxx'

export function isStripeConfigured(): boolean {
  return Boolean(env.STRIPE_SECRET_KEY) && env.STRIPE_SECRET_KEY !== STRIPE_PLACEHOLDER_KEY
}
