import type {
  Cart,
  Collection,
  Order,
  Paginated,
  ProductDetail,
  ProductListItem,
} from '@ecom/shared'

/** Base URL usata dal server Astro (SSR). Rete interna in produzione. */
export const API_URL = (
  import.meta.env.API_URL ??
  process.env.API_URL ??
  'http://localhost:3001'
).replace(/\/$/, '')

/** Base URL usata dal browser. Esposta al client, quindi prefisso PUBLIC_. */
export const PUBLIC_API_URL = (
  import.meta.env.PUBLIC_API_URL ??
  process.env.PUBLIC_API_URL ??
  'http://localhost:3001'
).replace(/\/$/, '')

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly details?: unknown
  ) {
    super(message)
    this.name = 'ApiError'
  }
}

type RequestOptions = RequestInit & {
  /** Query string serializzata automaticamente, i valori nulli sono scartati. */
  query?: Record<string, string | number | boolean | undefined | null>
}

/** Tempo massimo di attesa per una richiesta verso l'API prima di abortirla. */
const REQUEST_TIMEOUT_MS = 8000

/**
 * Wrapper fetch verso l'API. Lancia `ApiError` sulle risposte non-2xx così che
 * le pagine possano decidere fra 404 e messaggio d'errore inline.
 */
export async function apiFetch<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { query, headers, signal: callerSignal, ...init } = options
  const url = new URL(`${API_URL}${path.startsWith('/') ? path : `/${path}`}`)

  for (const [key, value] of Object.entries(query ?? {})) {
    if (value !== undefined && value !== null && value !== '') {
      url.searchParams.set(key, String(value))
    }
  }

  // Senza un deadline, un'API che accetta la connessione ma non risponde mai
  // terrebbe in sospeso l'intera richiesta SSR (es. `loadCart` nel middleware,
  // eseguito per ogni visita). Il timeout usa il proprio AbortController ma
  // rispetta comunque un eventuale `signal` passato dal chiamante.
  const timeoutController = new AbortController()
  const timeoutId = setTimeout(() => timeoutController.abort(), REQUEST_TIMEOUT_MS)
  if (callerSignal) {
    if (callerSignal.aborted) timeoutController.abort()
    else callerSignal.addEventListener('abort', () => timeoutController.abort(), { once: true })
  }

  let res: Response
  try {
    res = await fetch(url, {
      ...init,
      signal: timeoutController.signal,
      headers: {
        Accept: 'application/json',
        ...(init.body ? { 'Content-Type': 'application/json' } : {}),
        ...headers,
      },
    })
  } catch (cause) {
    if (timeoutController.signal.aborted && !callerSignal?.aborted) {
      throw new ApiError(503, 'API_TIMEOUT', `Timeout nella richiesta a ${API_URL} (oltre ${REQUEST_TIMEOUT_MS}ms)`, cause)
    }
    throw new ApiError(503, 'API_UNREACHABLE', `API non raggiungibile su ${API_URL}`, cause)
  } finally {
    clearTimeout(timeoutId)
  }

  if (res.status === 204) return undefined as T

  const text = await res.text()
  const body = text ? (JSON.parse(text) as unknown) : null

  if (!res.ok) {
    const err = (body as { error?: { code?: string; message?: string; details?: unknown } })?.error
    throw new ApiError(
      res.status,
      err?.code ?? 'INTERNAL_ERROR',
      err?.message ?? `Richiesta fallita (${res.status})`,
      err?.details
    )
  }

  return body as T
}

/** Come `apiFetch` ma restituisce `null` su 404, per le pagine di dettaglio. */
export async function apiFetchOrNull<T>(
  path: string,
  options: RequestOptions = {}
): Promise<T | null> {
  try {
    return await apiFetch<T>(path, options)
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) return null
    throw error
  }
}

/* ------------------------------------------------------------------ */
/* Helper tipizzati per le rotte usate dalle pagine                    */
/* ------------------------------------------------------------------ */
export const api = {
  products: (query: RequestOptions['query'] = {}) =>
    apiFetch<Paginated<ProductListItem>>('/api/products', { query }),

  product: (slug: string) => apiFetchOrNull<ProductDetail>(`/api/products/${slug}`),

  collections: () => apiFetch<Collection[]>('/api/collections'),

  collection: (slug: string) => apiFetchOrNull<Collection>(`/api/collections/${slug}`),

  cart: (id: string) => apiFetchOrNull<Cart>(`/api/cart/${id}`),

  createCart: () => apiFetch<Cart>('/api/cart', { method: 'POST' }),

  // `id` è codificato come singolo segmento di path: senza `encodeURIComponent`
  // uno `/` nell'id cambierebbe il percorso interrogato sull'API.
  order: (id: string, token: string) =>
    apiFetchOrNull<Order>(`/api/orders/${encodeURIComponent(id)}`, { query: { token } }),
}
