/**
 * Helper puri, senza dipendenze: importabili dagli script che girano nel browser
 * senza trascinare zod nel bundle. `@ecom/shared` li ri-esporta, ma il codice
 * client deve importare da `@ecom/shared/format`.
 */

/* ------------------------------------------------------------------ */
/* Money                                                               */
/* ------------------------------------------------------------------ */
/** Tutti gli importi sono interi in centesimi. Mai float. */
export const CURRENCY = 'EUR'

export function formatPrice(cents: number, locale = 'it-IT', currency = CURRENCY): string {
  return new Intl.NumberFormat(locale, { style: 'currency', currency }).format(cents / 100)
}

/**
 * Converte un importo scritto a mano ("29,90", "29.9", "1.299,00") in centesimi.
 * Il parsing è su stringa: `Math.round(parseFloat(x) * 100)` perde precisione su
 * valori come 19.99 e produce prezzi sbagliati di un centesimo.
 */
export function euroToCents(input: string): number | null {
  const raw = input.trim().replace(/\s|€/g, '')
  if (!raw) return null

  // separatore decimale = l'ultimo fra virgola e punto; gli altri sono migliaia
  const lastComma = raw.lastIndexOf(',')
  const lastDot = raw.lastIndexOf('.')
  const decimalSep = lastComma > lastDot ? ',' : lastDot > lastComma ? '.' : ''

  let intPart = raw
  let decPart = ''
  if (decimalSep) {
    const idx = raw.lastIndexOf(decimalSep)
    intPart = raw.slice(0, idx)
    decPart = raw.slice(idx + 1)
  }

  intPart = intPart.replace(/[.,]/g, '')
  if (!/^-?\d*$/.test(intPart) || !/^\d*$/.test(decPart)) return null
  if (intPart === '' && decPart === '') return null

  const negative = intPart.startsWith('-')
  const digits = negative ? intPart.slice(1) : intPart
  const cents = Number(`${digits || '0'}${decPart.padEnd(2, '0').slice(0, 2)}`)
  if (!Number.isFinite(cents)) return null
  return negative ? -cents : cents
}

/** Inverso di `euroToCents`, per riempire gli input dell'admin. */
export function centsToEuroInput(cents: number): string {
  return (cents / 100).toFixed(2).replace('.', ',')
}

/* ------------------------------------------------------------------ */
/* Regole di business condivise                                        */
/* ------------------------------------------------------------------ */
/** Spedizione gratuita sopra questa soglia (centesimi). */
export const FREE_SHIPPING_THRESHOLD_CENTS = 5000
/** Costo di spedizione forfettario (centesimi). */
export const FLAT_SHIPPING_CENTS = 590

export function calcShippingCents(subtotalCents: number): number {
  if (subtotalCents <= 0) return 0
  return subtotalCents >= FREE_SHIPPING_THRESHOLD_CENTS ? 0 : FLAT_SHIPPING_CENTS
}

/** Soglia sotto la quale una variante è segnalata come "sotto scorta" in admin. */
export const LOW_STOCK_THRESHOLD = 5

export function slugify(input: string): string {
  return input
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

/* ------------------------------------------------------------------ */
/* Enum — servono anche ai form, che non validano con zod              */
/* ------------------------------------------------------------------ */
export const productStatuses = ['draft', 'active', 'archived'] as const
export type ProductStatus = (typeof productStatuses)[number]

export const orderStatuses = ['pending', 'paid', 'failed', 'fulfilled', 'cancelled'] as const
export type OrderStatus = (typeof orderStatuses)[number]

export const productSortValues = ['new', 'price-asc', 'price-desc', 'title'] as const
export type ProductSort = (typeof productSortValues)[number]
