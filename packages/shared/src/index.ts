import { z } from 'zod'
import { orderStatuses, productSortValues, productStatuses } from './format.js'

/**
 * Gli helper puri (prezzi, spedizione, slug, enum) vivono in `./format.ts` e sono
 * ri-esportati qui per comodità. Il codice che gira nel browser deve importarli da
 * `@ecom/shared/format`: importarli da qui trascinerebbe zod (~57 kB) nel bundle.
 */
export * from './format.js'

/* ------------------------------------------------------------------ */
/* Catalogo — payload restituiti dall'API pubblica                     */
/* ------------------------------------------------------------------ */
export const imageSchema = z.object({
  id: z.number(),
  url: z.string(),
  alt: z.string().nullable(),
  position: z.number(),
})

export const optionValueSchema = z.object({
  id: z.number(),
  value: z.string(),
  position: z.number(),
})

export const productOptionSchema = z.object({
  id: z.number(),
  name: z.string(),
  position: z.number(),
  values: z.array(optionValueSchema),
})

export const variantSchema = z.object({
  id: z.number(),
  sku: z.string(),
  title: z.string(),
  priceCents: z.number().int(),
  compareAtCents: z.number().int().nullable(),
  stock: z.number().int(),
  /** id dei option_values che compongono questa variante */
  optionValueIds: z.array(z.number()),
})

export const productListItemSchema = z.object({
  id: z.number(),
  slug: z.string(),
  title: z.string(),
  excerpt: z.string().nullable(),
  priceCents: z.number().int(),
  compareAtCents: z.number().int().nullable(),
  image: imageSchema.nullable(),
  inStock: z.boolean(),
})

export const productDetailSchema = productListItemSchema.extend({
  description: z.string().nullable(),
  status: z.enum(productStatuses),
  images: z.array(imageSchema),
  options: z.array(productOptionSchema),
  variants: z.array(variantSchema),
  collections: z.array(z.object({ id: z.number(), slug: z.string(), title: z.string() })),
})

export const collectionSchema = z.object({
  id: z.number(),
  slug: z.string(),
  title: z.string(),
  description: z.string().nullable(),
  imageUrl: z.string().nullable(),
  productCount: z.number().optional(),
})

export type Image = z.infer<typeof imageSchema>
export type ProductOption = z.infer<typeof productOptionSchema>
export type Variant = z.infer<typeof variantSchema>
export type ProductListItem = z.infer<typeof productListItemSchema>
export type ProductDetail = z.infer<typeof productDetailSchema>
export type Collection = z.infer<typeof collectionSchema>

/* ------------------------------------------------------------------ */
/* Query PLP                                                           */
/* ------------------------------------------------------------------ */
/**
 * Booleano da querystring. Accetta le forme che un form HTML o un link possono
 * produrre e rifiuta il resto, invece di considerare vero tutto ciò che non è
 * la stringa vuota.
 */
export const booleanQueryParam = z
  .union([z.boolean(), z.enum(['true', '1', 'on', 'yes', 'false', '0', 'off', 'no', ''])])
  .transform((value) => {
    if (typeof value === 'boolean') return value
    return value === 'true' || value === '1' || value === 'on' || value === 'yes'
  })

export const productQuerySchema = z.object({
  q: z.string().trim().min(1).optional(),
  collection: z.string().trim().min(1).optional(),
  sort: z.enum(productSortValues).default('new'),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(60).default(12),
  minPrice: z.coerce.number().int().min(0).optional(),
  maxPrice: z.coerce.number().int().min(0).optional(),
  // `z.coerce.boolean()` usa `Boolean(input)`: qualsiasi stringa non vuota
  // diventa `true`, quindi `?inStock=false` filtrerebbe al contrario
  inStock: booleanQueryParam.optional(),
})
export type ProductQuery = z.infer<typeof productQuerySchema>

export const paginatedSchema = <T extends z.ZodTypeAny>(item: T) =>
  z.object({
    items: z.array(item),
    total: z.number(),
    page: z.number(),
    pages: z.number(),
    limit: z.number(),
  })

export type Paginated<T> = { items: T[]; total: number; page: number; pages: number; limit: number }

/* ------------------------------------------------------------------ */
/* Carrello                                                            */
/* ------------------------------------------------------------------ */
export const cartItemSchema = z.object({
  id: z.number(),
  variantId: z.number(),
  productSlug: z.string(),
  productTitle: z.string(),
  variantTitle: z.string(),
  sku: z.string(),
  imageUrl: z.string().nullable(),
  unitPriceCents: z.number().int(),
  qty: z.number().int(),
  lineTotalCents: z.number().int(),
  /** stock residuo della variante, per avvisi in UI */
  availableStock: z.number().int(),
})

export const cartSchema = z.object({
  id: z.string(),
  items: z.array(cartItemSchema),
  subtotalCents: z.number().int(),
  shippingCents: z.number().int(),
  totalCents: z.number().int(),
  itemCount: z.number().int(),
  currency: z.string(),
})

export type CartItem = z.infer<typeof cartItemSchema>
export type Cart = z.infer<typeof cartSchema>

export const addToCartSchema = z.object({
  variantId: z.number().int().positive(),
  qty: z.number().int().min(1).max(99).default(1),
})
export const updateCartItemSchema = z.object({ qty: z.number().int().min(0).max(99) })

/* ------------------------------------------------------------------ */
/* Checkout / Ordini                                                   */
/* ------------------------------------------------------------------ */
export const addressSchema = z.object({
  name: z.string().min(2),
  line1: z.string().min(2),
  line2: z.string().optional().nullable(),
  city: z.string().min(2),
  postalCode: z.string().min(3),
  province: z.string().optional().nullable(),
  country: z.string().length(2).default('IT'),
  phone: z.string().optional().nullable(),
})
export type Address = z.infer<typeof addressSchema>

export const checkoutSessionSchema = z.object({
  cartId: z.string().min(1),
  email: z.string().email(),
  shippingAddress: addressSchema.optional(),
})

export const orderItemSchema = z.object({
  id: z.number(),
  productTitle: z.string(),
  variantTitle: z.string(),
  sku: z.string(),
  imageUrl: z.string().nullable(),
  unitPriceCents: z.number().int(),
  qty: z.number().int(),
  lineTotalCents: z.number().int(),
})

export const orderSchema = z.object({
  id: z.string(),
  number: z.string(),
  email: z.string(),
  status: z.enum(orderStatuses),
  items: z.array(orderItemSchema),
  subtotalCents: z.number().int(),
  shippingCents: z.number().int(),
  totalCents: z.number().int(),
  currency: z.string(),
  shippingAddress: addressSchema.nullable(),
  createdAt: z.string(),
})
export type Order = z.infer<typeof orderSchema>
export type OrderItem = z.infer<typeof orderItemSchema>

/* ------------------------------------------------------------------ */
/* Admin                                                               */
/* ------------------------------------------------------------------ */
export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
})

export const adminVariantInputSchema = z.object({
  id: z.number().int().optional(),
  sku: z.string().min(1),
  title: z.string().min(1),
  priceCents: z.number().int().min(0),
  compareAtCents: z.number().int().min(0).nullable().optional(),
  stock: z.number().int().min(0).default(0),
  optionValues: z.array(z.string()).default([]),
})

export const adminProductInputSchema = z.object({
  slug: z
    .string()
    .min(1)
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'slug non valido (usa lettere minuscole e trattini)'),
  title: z.string().min(1),
  excerpt: z.string().nullable().optional(),
  description: z.string().nullable().optional(),
  status: z.enum(productStatuses).default('draft'),
  images: z
    .array(z.object({ url: z.string().min(1), alt: z.string().nullable().optional() }))
    .default([]),
  options: z
    .array(z.object({ name: z.string().min(1), values: z.array(z.string().min(1)).min(1) }))
    .default([]),
  variants: z.array(adminVariantInputSchema).min(1),
  collectionSlugs: z.array(z.string()).default([]),
})
export type AdminProductInput = z.infer<typeof adminProductInputSchema>

export const adminOrderUpdateSchema = z.object({ status: z.enum(orderStatuses) })

export const adminCollectionInputSchema = z.object({
  slug: z
    .string()
    .min(1)
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'slug non valido (usa lettere minuscole e trattini)'),
  title: z.string().min(1),
  description: z.string().nullable().optional(),
  imageUrl: z.string().nullable().optional(),
})
export type AdminCollectionInput = z.infer<typeof adminCollectionInputSchema>

/** Riga della tabella prodotti in admin: aggregati sulle varianti, non sul prodotto. */
export const adminProductRowSchema = z.object({
  id: z.number(),
  slug: z.string(),
  title: z.string(),
  status: z.enum(productStatuses),
  image: imageSchema.nullable(),
  variantCount: z.number().int(),
  /** null se il prodotto non ha ancora varianti */
  minPriceCents: z.number().int().nullable(),
  totalStock: z.number().int(),
  updatedAt: z.string(),
})
export type AdminProductRow = z.infer<typeof adminProductRowSchema>

export const lowStockVariantSchema = z.object({
  variantId: z.number(),
  sku: z.string(),
  variantTitle: z.string(),
  stock: z.number().int(),
  productId: z.number(),
  productTitle: z.string(),
  productSlug: z.string(),
})
export type LowStockVariant = z.infer<typeof lowStockVariantSchema>

export const adminStatsSchema = z.object({
  products: z.number().int(),
  orders: z.number().int(),
  revenueCents: z.number().int(),
  pendingOrders: z.number().int(),
  lowStock: z.array(lowStockVariantSchema),
})
export type AdminStats = z.infer<typeof adminStatsSchema>


/* ------------------------------------------------------------------ */
/* Errori API — forma unica di risposta d'errore                       */
/* ------------------------------------------------------------------ */
export const apiErrorSchema = z.object({
  error: z.object({
    code: z.string(),
    message: z.string(),
    details: z.unknown().optional(),
  }),
})
export type ApiError = z.infer<typeof apiErrorSchema>

