import type { AstroGlobal } from 'astro'
import type {
  AdminCollectionInput,
  AdminProductInput,
  AdminProductRow,
  AdminStats,
  Collection,
  LowStockVariant,
  Order,
  OrderStatus,
  Paginated,
  ProductDetail,
  ProductStatus,
} from '@ecom/shared'
import { API_URL, ApiError } from './api'

/* `AdminProductRow`, `AdminStats`, `LowStockVariant` e `AdminCollectionInput`
   vivono in `@ecom/shared`: sono lo stesso contratto che l'API serializza. */
export type { AdminProductRow, AdminStats, LowStockVariant }

export interface AdminUser {
  id: number
  email: string
  name?: string | null
}

/** Forma di `error.details` quando l'API risponde con `zodError.flatten()`. */
export interface ZodFlatten {
  formErrors: string[]
  fieldErrors: Record<string, string[] | undefined>
}

/* ------------------------------------------------------------------ */
/* Client HTTP lato server: inoltra il cookie della richiesta Astro     */
/* entrante verso l'API, così la sessione admin viaggia senza esporre   */
/* nulla al browser.                                                    */
/* ------------------------------------------------------------------ */
type Query = Record<string, string | number | boolean | undefined | null>

interface AdminFetchOptions {
  request: Request
  method?: string
  body?: unknown
  query?: Query
}

function buildUrl(path: string, query?: Query): URL {
  const url = new URL(`${API_URL}${path.startsWith('/') ? path : `/${path}`}`)
  for (const [key, value] of Object.entries(query ?? {})) {
    if (value !== undefined && value !== null && value !== '') {
      url.searchParams.set(key, String(value))
    }
  }
  return url
}

/** Esegue la richiesta verso l'API e restituisce la `Response` grezza (non parsata). */
async function rawFetch(url: URL, init: RequestInit): Promise<Response> {
  try {
    return await fetch(url, init)
  } catch (cause) {
    throw new ApiError(503, 'API_UNREACHABLE', `API non raggiungibile su ${API_URL}`, cause)
  }
}

/** Legge tutti gli header `Set-Cookie` di una risposta, gestendo anche i runtime senza `getSetCookie`. */
function extractSetCookies(res: Response): string[] {
  const headers = res.headers as Headers & { getSetCookie?: () => string[] }
  if (typeof headers.getSetCookie === 'function') return headers.getSetCookie()
  const single = res.headers.get('set-cookie')
  return single ? [single] : []
}

/**
 * Chiamata autenticata verso `/api/admin/*`: inoltra l'header Cookie della
 * richiesta Astro entrante e lancia `ApiError` sulle risposte non-2xx.
 */
export async function adminFetch<T>(path: string, options: AdminFetchOptions): Promise<T> {
  const { request, method = 'GET', body, query } = options
  const url = buildUrl(path, query)
  const cookie = request.headers.get('cookie')

  const res = await rawFetch(url, {
    method,
    headers: {
      Accept: 'application/json',
      ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      ...(cookie ? { Cookie: cookie } : {}),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  })

  const text = await res.text()
  const parsed = text ? (JSON.parse(text) as unknown) : null

  if (!res.ok) {
    const err = (parsed as { error?: { code?: string; message?: string; details?: unknown } })
      ?.error
    throw new ApiError(
      res.status,
      err?.code ?? 'INTERNAL_ERROR',
      err?.message ?? `Richiesta fallita (${res.status})`,
      err?.details
    )
  }

  return parsed as T
}

/** Come `adminFetch` ma restituisce `null` su 404, per le pagine di dettaglio. */
async function adminFetchOrNull<T>(path: string, options: AdminFetchOptions): Promise<T | null> {
  try {
    return await adminFetch<T>(path, options)
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) return null
    throw error
  }
}

/* ------------------------------------------------------------------ */
/* Sessione                                                            */
/* ------------------------------------------------------------------ */

/**
 * Verifica la sessione admin chiamando `GET /api/admin/me`. Da usare a inizio
 * pagina: `const session = await requireSession(Astro); if (session instanceof
 * Response) return session`. Su 401 restituisce un redirect a `/admin/login`.
 */
export async function requireSession(Astro: AstroGlobal): Promise<AdminUser | Response> {
  try {
    const data = await adminFetch<{ user: AdminUser }>('/api/admin/me', { request: Astro.request })
    return data.user
  } catch (error) {
    if (error instanceof ApiError && error.status === 401) {
      const next = encodeURIComponent(Astro.url.pathname + Astro.url.search)
      return Astro.redirect(`/admin/login?next=${next}`)
    }
    throw error
  }
}

export async function adminLogin(
  email: string,
  password: string
): Promise<{ ok: true; setCookies: string[] } | { ok: false; message: string; details?: unknown }> {
  const res = await rawFetch(buildUrl('/api/admin/login'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ email, password }),
  })

  if (res.ok) return { ok: true, setCookies: extractSetCookies(res) }

  const text = await res.text()
  const body = text
    ? (JSON.parse(text) as { error?: { message?: string; details?: unknown } })
    : null
  return {
    ok: false,
    message: body?.error?.message ?? 'Credenziali non valide.',
    details: body?.error?.details,
  }
}

/** Esegue il logout sull'API e restituisce gli header Set-Cookie da propagare al browser. */
export async function adminLogout(request: Request): Promise<string[]> {
  const cookie = request.headers.get('cookie')
  const res = await rawFetch(buildUrl('/api/admin/logout'), {
    method: 'POST',
    headers: { Accept: 'application/json', ...(cookie ? { Cookie: cookie } : {}) },
  })
  return extractSetCookies(res)
}

/* ------------------------------------------------------------------ */
/* Dashboard                                                           */
/* ------------------------------------------------------------------ */
export function getStats(request: Request): Promise<AdminStats> {
  return adminFetch<AdminStats>('/api/admin/stats', { request })
}

/* ------------------------------------------------------------------ */
/* Prodotti                                                            */
/* ------------------------------------------------------------------ */
export interface ListProductsQuery {
  q?: string
  status?: ProductStatus | ''
  page?: number
  limit?: number
}

export function listProducts(
  request: Request,
  query: ListProductsQuery = {}
): Promise<Paginated<AdminProductRow>> {
  return adminFetch<Paginated<AdminProductRow>>('/api/admin/products', {
    request,
    query: { q: query.q, status: query.status || undefined, page: query.page, limit: query.limit },
  })
}

export function getProduct(request: Request, id: number | string): Promise<ProductDetail | null> {
  return adminFetchOrNull<ProductDetail>(`/api/admin/products/${id}`, { request })
}

export function createProduct(request: Request, input: AdminProductInput): Promise<ProductDetail> {
  return adminFetch<ProductDetail>('/api/admin/products', { request, method: 'POST', body: input })
}

export function updateProduct(
  request: Request,
  id: number | string,
  input: AdminProductInput
): Promise<ProductDetail> {
  return adminFetch<ProductDetail>(`/api/admin/products/${id}`, {
    request,
    method: 'PUT',
    body: input,
  })
}

export function deleteProduct(request: Request, id: number | string): Promise<{ ok: true }> {
  return adminFetch<{ ok: true }>(`/api/admin/products/${id}`, { request, method: 'DELETE' })
}

/* ------------------------------------------------------------------ */
/* Ordini                                                              */
/* ------------------------------------------------------------------ */
export interface ListOrdersQuery {
  status?: OrderStatus | ''
  page?: number
  limit?: number
}

export function listOrders(
  request: Request,
  query: ListOrdersQuery = {}
): Promise<Paginated<Order>> {
  return adminFetch<Paginated<Order>>('/api/admin/orders', {
    request,
    query: { status: query.status || undefined, page: query.page, limit: query.limit },
  })
}

export function getOrder(request: Request, id: number | string): Promise<Order | null> {
  return adminFetchOrNull<Order>(`/api/admin/orders/${id}`, { request })
}

export function updateOrderStatus(
  request: Request,
  id: number | string,
  status: OrderStatus
): Promise<Order> {
  return adminFetch<Order>(`/api/admin/orders/${id}`, { request, method: 'PATCH', body: { status } })
}

/* ------------------------------------------------------------------ */
/* Collezioni                                                          */
/* ------------------------------------------------------------------ */
export function listCollections(request: Request): Promise<Collection[]> {
  return adminFetch<Collection[]>('/api/admin/collections', { request })
}

export function saveCollection(
  request: Request,
  input: AdminCollectionInput,
  id?: number | string
): Promise<Collection> {
  return id
    ? adminFetch<Collection>(`/api/admin/collections/${id}`, { request, method: 'PUT', body: input })
    : adminFetch<Collection>('/api/admin/collections', { request, method: 'POST', body: input })
}

export function deleteCollection(request: Request, id: number | string): Promise<{ ok: true }> {
  return adminFetch<{ ok: true }>(`/api/admin/collections/${id}`, { request, method: 'DELETE' })
}
