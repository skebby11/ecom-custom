import { sql } from 'drizzle-orm'
import { relations } from 'drizzle-orm'
import { index, integer, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core'

/**
 * Convenzioni:
 * - tutti gli importi sono INTERI in centesimi (`*Cents`)
 * - i timestamp sono ISO-8601 in UTC salvati come TEXT (leggibili, ordinabili)
 * - gli id numerici sono autoincrement; ordini e carrelli usano id testuali (uuid)
 */
const now = sql`(strftime('%Y-%m-%dT%H:%M:%fZ','now'))`

/* ------------------------------------------------------------------ */
/* Catalogo                                                            */
/* ------------------------------------------------------------------ */
export const products = sqliteTable(
  'products',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    slug: text('slug').notNull(),
    title: text('title').notNull(),
    excerpt: text('excerpt'),
    description: text('description'),
    status: text('status', { enum: ['draft', 'active', 'archived'] })
      .notNull()
      .default('draft'),
    createdAt: text('created_at').notNull().default(now),
    updatedAt: text('updated_at').notNull().default(now),
  },
  (t) => ({
    slugIdx: uniqueIndex('products_slug_idx').on(t.slug),
    statusIdx: index('products_status_idx').on(t.status),
  })
)

export const productImages = sqliteTable(
  'product_images',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    productId: integer('product_id')
      .notNull()
      .references(() => products.id, { onDelete: 'cascade' }),
    url: text('url').notNull(),
    alt: text('alt'),
    position: integer('position').notNull().default(0),
  },
  (t) => ({ productIdx: index('product_images_product_idx').on(t.productId) })
)

/** Asse di variazione: "Taglia", "Colore". */
export const productOptions = sqliteTable(
  'product_options',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    productId: integer('product_id')
      .notNull()
      .references(() => products.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    position: integer('position').notNull().default(0),
  },
  (t) => ({ productIdx: index('product_options_product_idx').on(t.productId) })
)

/** Valore di un asse: "M", "Rosso". */
export const optionValues = sqliteTable(
  'option_values',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    optionId: integer('option_id')
      .notNull()
      .references(() => productOptions.id, { onDelete: 'cascade' }),
    value: text('value').notNull(),
    position: integer('position').notNull().default(0),
  },
  (t) => ({ optionIdx: index('option_values_option_idx').on(t.optionId) })
)

/** Unità acquistabile. Il prezzo vive qui, non sul prodotto. */
export const variants = sqliteTable(
  'variants',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    productId: integer('product_id')
      .notNull()
      .references(() => products.id, { onDelete: 'cascade' }),
    sku: text('sku').notNull(),
    /** "M / Rosso" — derivato dai valori opzione, denormalizzato per comodità */
    title: text('title').notNull().default('Default'),
    priceCents: integer('price_cents').notNull(),
    compareAtCents: integer('compare_at_cents'),
    stock: integer('stock').notNull().default(0),
    position: integer('position').notNull().default(0),
    createdAt: text('created_at').notNull().default(now),
  },
  (t) => ({
    skuIdx: uniqueIndex('variants_sku_idx').on(t.sku),
    productIdx: index('variants_product_idx').on(t.productId),
  })
)

/** Join variante ↔ valori opzione (una riga per asse). */
export const variantOptionValues = sqliteTable(
  'variant_option_values',
  {
    variantId: integer('variant_id')
      .notNull()
      .references(() => variants.id, { onDelete: 'cascade' }),
    optionValueId: integer('option_value_id')
      .notNull()
      .references(() => optionValues.id, { onDelete: 'cascade' }),
  },
  (t) => ({
    pk: uniqueIndex('variant_option_values_pk').on(t.variantId, t.optionValueId),
    valueIdx: index('variant_option_values_value_idx').on(t.optionValueId),
  })
)

export const collections = sqliteTable(
  'collections',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    slug: text('slug').notNull(),
    title: text('title').notNull(),
    description: text('description'),
    imageUrl: text('image_url'),
    position: integer('position').notNull().default(0),
  },
  (t) => ({ slugIdx: uniqueIndex('collections_slug_idx').on(t.slug) })
)

export const productCollections = sqliteTable(
  'product_collections',
  {
    productId: integer('product_id')
      .notNull()
      .references(() => products.id, { onDelete: 'cascade' }),
    collectionId: integer('collection_id')
      .notNull()
      .references(() => collections.id, { onDelete: 'cascade' }),
  },
  (t) => ({
    pk: uniqueIndex('product_collections_pk').on(t.productId, t.collectionId),
    collectionIdx: index('product_collections_collection_idx').on(t.collectionId),
  })
)

/* ------------------------------------------------------------------ */
/* Carrello                                                            */
/* ------------------------------------------------------------------ */
export const carts = sqliteTable('carts', {
  id: text('id').primaryKey(),
  email: text('email'),
  createdAt: text('created_at').notNull().default(now),
  updatedAt: text('updated_at').notNull().default(now),
})

export const cartItems = sqliteTable(
  'cart_items',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    cartId: text('cart_id')
      .notNull()
      .references(() => carts.id, { onDelete: 'cascade' }),
    variantId: integer('variant_id')
      .notNull()
      .references(() => variants.id, { onDelete: 'cascade' }),
    qty: integer('qty').notNull().default(1),
    createdAt: text('created_at').notNull().default(now),
  },
  (t) => ({
    cartIdx: index('cart_items_cart_idx').on(t.cartId),
    uniqueLine: uniqueIndex('cart_items_cart_variant_idx').on(t.cartId, t.variantId),
  })
)

/* ------------------------------------------------------------------ */
/* Ordini                                                              */
/* ------------------------------------------------------------------ */
export const orders = sqliteTable(
  'orders',
  {
    id: text('id').primaryKey(),
    /** numero leggibile mostrato al cliente, es. "ORD-2026-0001" */
    number: text('number').notNull(),
    email: text('email').notNull(),
    status: text('status', {
      enum: ['pending', 'paid', 'failed', 'fulfilled', 'cancelled'],
    })
      .notNull()
      .default('pending'),
    subtotalCents: integer('subtotal_cents').notNull(),
    shippingCents: integer('shipping_cents').notNull().default(0),
    totalCents: integer('total_cents').notNull(),
    currency: text('currency').notNull().default('EUR'),
    /** token opaco richiesto per consultare l'ordine senza login */
    accessToken: text('access_token').notNull(),
    shippingAddress: text('shipping_address', { mode: 'json' }).$type<Record<
      string,
      unknown
    > | null>(),
    stripeSessionId: text('stripe_session_id'),
    stripePaymentIntentId: text('stripe_payment_intent_id'),
    cartId: text('cart_id'),
    createdAt: text('created_at').notNull().default(now),
    updatedAt: text('updated_at').notNull().default(now),
  },
  (t) => ({
    numberIdx: uniqueIndex('orders_number_idx').on(t.number),
    sessionIdx: index('orders_stripe_session_idx').on(t.stripeSessionId),
    statusIdx: index('orders_status_idx').on(t.status),
  })
)

/** Righe ordine: snapshot immutabile, non seguono le modifiche al catalogo. */
export const orderItems = sqliteTable(
  'order_items',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    orderId: text('order_id')
      .notNull()
      .references(() => orders.id, { onDelete: 'cascade' }),
    variantId: integer('variant_id'),
    productSlug: text('product_slug').notNull(),
    productTitle: text('product_title').notNull(),
    variantTitle: text('variant_title').notNull(),
    sku: text('sku').notNull(),
    imageUrl: text('image_url'),
    unitPriceCents: integer('unit_price_cents').notNull(),
    qty: integer('qty').notNull(),
  },
  (t) => ({ orderIdx: index('order_items_order_idx').on(t.orderId) })
)

/** Idempotenza webhook Stripe: un evento processato una volta sola. */
export const webhookEvents = sqliteTable('webhook_events', {
  id: text('id').primaryKey(),
  type: text('type').notNull(),
  processedAt: text('processed_at').notNull().default(now),
})

/* ------------------------------------------------------------------ */
/* Admin                                                               */
/* ------------------------------------------------------------------ */
export const adminUsers = sqliteTable(
  'admin_users',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    email: text('email').notNull(),
    passwordHash: text('password_hash').notNull(),
    name: text('name'),
    createdAt: text('created_at').notNull().default(now),
  },
  (t) => ({ emailIdx: uniqueIndex('admin_users_email_idx').on(t.email) })
)

export const adminSessions = sqliteTable(
  'admin_sessions',
  {
    id: text('id').primaryKey(),
    userId: integer('user_id')
      .notNull()
      .references(() => adminUsers.id, { onDelete: 'cascade' }),
    expiresAt: text('expires_at').notNull(),
    createdAt: text('created_at').notNull().default(now),
  },
  (t) => ({ userIdx: index('admin_sessions_user_idx').on(t.userId) })
)

/* ------------------------------------------------------------------ */
/* Relations                                                           */
/* ------------------------------------------------------------------ */
export const productsRelations = relations(products, ({ many }) => ({
  images: many(productImages),
  options: many(productOptions),
  variants: many(variants),
  productCollections: many(productCollections),
}))

export const productImagesRelations = relations(productImages, ({ one }) => ({
  product: one(products, { fields: [productImages.productId], references: [products.id] }),
}))

export const productOptionsRelations = relations(productOptions, ({ one, many }) => ({
  product: one(products, { fields: [productOptions.productId], references: [products.id] }),
  values: many(optionValues),
}))

export const optionValuesRelations = relations(optionValues, ({ one, many }) => ({
  option: one(productOptions, {
    fields: [optionValues.optionId],
    references: [productOptions.id],
  }),
  variantLinks: many(variantOptionValues),
}))

export const variantsRelations = relations(variants, ({ one, many }) => ({
  product: one(products, { fields: [variants.productId], references: [products.id] }),
  optionLinks: many(variantOptionValues),
}))

export const variantOptionValuesRelations = relations(variantOptionValues, ({ one }) => ({
  variant: one(variants, { fields: [variantOptionValues.variantId], references: [variants.id] }),
  optionValue: one(optionValues, {
    fields: [variantOptionValues.optionValueId],
    references: [optionValues.id],
  }),
}))

export const collectionsRelations = relations(collections, ({ many }) => ({
  productCollections: many(productCollections),
}))

export const productCollectionsRelations = relations(productCollections, ({ one }) => ({
  product: one(products, { fields: [productCollections.productId], references: [products.id] }),
  collection: one(collections, {
    fields: [productCollections.collectionId],
    references: [collections.id],
  }),
}))

export const cartsRelations = relations(carts, ({ many }) => ({ items: many(cartItems) }))

export const cartItemsRelations = relations(cartItems, ({ one }) => ({
  cart: one(carts, { fields: [cartItems.cartId], references: [carts.id] }),
  variant: one(variants, { fields: [cartItems.variantId], references: [variants.id] }),
}))

export const ordersRelations = relations(orders, ({ many }) => ({ items: many(orderItems) }))

export const orderItemsRelations = relations(orderItems, ({ one }) => ({
  order: one(orders, { fields: [orderItems.orderId], references: [orders.id] }),
}))

export const adminUsersRelations = relations(adminUsers, ({ many }) => ({
  sessions: many(adminSessions),
}))

export const adminSessionsRelations = relations(adminSessions, ({ one }) => ({
  user: one(adminUsers, { fields: [adminSessions.userId], references: [adminUsers.id] }),
}))
