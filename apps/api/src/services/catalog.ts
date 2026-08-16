import {
  cartItems,
  collections,
  getDb,
  optionValues,
  productCollections,
  productImages,
  productOptions,
  products,
  variantOptionValues,
  variants,
} from '@ecom/db'
import type {
  AdminProductInput,
  AdminProductRow,
  Collection,
  Image,
  Paginated,
  ProductDetail,
  ProductListItem,
  ProductQuery,
  ProductStatus,
} from '@ecom/shared'
import { and, desc, eq, inArray, like, or, sql } from 'drizzle-orm'
import { notFound } from '../errors.js'

type ProductRow = typeof products.$inferSelect
type VariantRow = typeof variants.$inferSelect
type ImageRow = typeof productImages.$inferSelect

/**
 * `AdminProductRow` vive in `@ecom/shared`: la tabella prodotti dell'admin mostra
 * aggregati (numero varianti, prezzo minimo, stock totale) diversi da quelli della
 * vetrina pubblica, quindi il tipo è condiviso e non ricalcolato lato client.
 */

function groupBy<T, K>(rows: T[], keyFn: (row: T) => K): Map<K, T[]> {
  const map = new Map<K, T[]>()
  for (const row of rows) {
    const key = keyFn(row)
    const list = map.get(key)
    if (list) list.push(row)
    else map.set(key, [row])
  }
  return map
}

/** priceCents = min tra le varianti, compareAtCents = quello della variante più economica. */
function summarizeVariants(rows: VariantRow[]): {
  priceCents: number
  compareAtCents: number | null
  inStock: boolean
} {
  let priceCents = Number.POSITIVE_INFINITY
  let compareAtCents: number | null = null
  let inStock = false
  for (const v of rows) {
    if (v.stock > 0) inStock = true
    if (v.priceCents < priceCents) {
      priceCents = v.priceCents
      compareAtCents = v.compareAtCents ?? null
    }
  }
  if (!Number.isFinite(priceCents)) priceCents = 0
  return { priceCents, compareAtCents, inStock }
}

function firstImage(rows: ImageRow[]): Image | null {
  if (rows.length === 0) return null
  const sorted = [...rows].sort((a, b) => a.position - b.position)
  const img = sorted[0]!
  return { id: img.id, url: img.url, alt: img.alt, position: img.position }
}

function toImage(row: ImageRow): Image {
  return { id: row.id, url: row.url, alt: row.alt, position: row.position }
}

/* ------------------------------------------------------------------ */
/* Catalogo pubblico                                                   */
/* ------------------------------------------------------------------ */

export async function listProducts(query: ProductQuery): Promise<Paginated<ProductListItem>> {
  const db = getDb()

  const conditions = [eq(products.status, 'active')]
  if (query.q) {
    const pattern = `%${query.q}%`
    conditions.push(or(like(products.title, pattern), like(products.excerpt, pattern))!)
  }

  if (query.collection) {
    const collectionProductIds = await db
      .select({ id: productCollections.productId })
      .from(productCollections)
      .innerJoin(collections, eq(collections.id, productCollections.collectionId))
      .where(eq(collections.slug, query.collection))

    if (collectionProductIds.length === 0) {
      return { items: [], total: 0, page: query.page, pages: 0, limit: query.limit }
    }
    conditions.push(
      inArray(
        products.id,
        collectionProductIds.map((r) => r.id)
      )
    )
  }

  // ordinati per data di creazione: base per il sort "new" (default)
  const baseProducts = await db
    .select()
    .from(products)
    .where(and(...conditions))
    .orderBy(desc(products.createdAt))

  if (baseProducts.length === 0) {
    return { items: [], total: 0, page: query.page, pages: 0, limit: query.limit }
  }

  const ids = baseProducts.map((p) => p.id)
  // niente query per prodotto: due query batch per tutte le varianti/immagini della pagina filtrata
  const [allVariants, allImages] = await Promise.all([
    db.select().from(variants).where(inArray(variants.productId, ids)),
    db.select().from(productImages).where(inArray(productImages.productId, ids)),
  ])
  const variantsByProduct = groupBy(allVariants, (v) => v.productId)
  const imagesByProduct = groupBy(allImages, (i) => i.productId)

  let items: ProductListItem[] = baseProducts.map((p) => {
    const summary = summarizeVariants(variantsByProduct.get(p.id) ?? [])
    return {
      id: p.id,
      slug: p.slug,
      title: p.title,
      excerpt: p.excerpt,
      priceCents: summary.priceCents,
      compareAtCents: summary.compareAtCents,
      image: firstImage(imagesByProduct.get(p.id) ?? []),
      inStock: summary.inStock,
    }
  })

  if (query.minPrice !== undefined) items = items.filter((i) => i.priceCents >= query.minPrice!)
  if (query.maxPrice !== undefined) items = items.filter((i) => i.priceCents <= query.maxPrice!)
  if (query.inStock) items = items.filter((i) => i.inStock)

  if (query.sort === 'price-asc') items.sort((a, b) => a.priceCents - b.priceCents)
  else if (query.sort === 'price-desc') items.sort((a, b) => b.priceCents - a.priceCents)
  else if (query.sort === 'title') items.sort((a, b) => a.title.localeCompare(b.title))
  // 'new': già ordinato da createdAt desc

  const total = items.length
  const pages = Math.max(1, Math.ceil(total / query.limit))
  const start = (query.page - 1) * query.limit
  const pageItems = items.slice(start, start + query.limit)

  return { items: pageItems, total, page: query.page, pages, limit: query.limit }
}

async function buildProductDetail(product: ProductRow): Promise<ProductDetail> {
  const db = getDb()

  const [productVariants, productImagesRows, productOptionsRows, prodCollections] = await Promise.all([
    db.select().from(variants).where(eq(variants.productId, product.id)).orderBy(variants.position),
    db.select().from(productImages).where(eq(productImages.productId, product.id)).orderBy(productImages.position),
    db.select().from(productOptions).where(eq(productOptions.productId, product.id)).orderBy(productOptions.position),
    db
      .select({ id: collections.id, slug: collections.slug, title: collections.title })
      .from(productCollections)
      .innerJoin(collections, eq(collections.id, productCollections.collectionId))
      .where(eq(productCollections.productId, product.id)),
  ])

  const optionIds = productOptionsRows.map((o) => o.id)
  const optionValueRows = optionIds.length
    ? await db.select().from(optionValues).where(inArray(optionValues.optionId, optionIds)).orderBy(optionValues.position)
    : []
  const valuesByOption = groupBy(optionValueRows, (v) => v.optionId)

  const variantIds = productVariants.map((v) => v.id)
  const variantOptionRows = variantIds.length
    ? await db.select().from(variantOptionValues).where(inArray(variantOptionValues.variantId, variantIds))
    : []
  const optionValueIdsByVariant = groupBy(variantOptionRows, (r) => r.variantId)

  const summary = summarizeVariants(productVariants)

  return {
    id: product.id,
    slug: product.slug,
    title: product.title,
    excerpt: product.excerpt,
    priceCents: summary.priceCents,
    compareAtCents: summary.compareAtCents,
    image: firstImage(productImagesRows),
    inStock: summary.inStock,
    description: product.description,
    status: product.status,
    images: productImagesRows.map(toImage),
    options: productOptionsRows.map((o) => ({
      id: o.id,
      name: o.name,
      position: o.position,
      values: (valuesByOption.get(o.id) ?? []).map((v) => ({ id: v.id, value: v.value, position: v.position })),
    })),
    variants: productVariants.map((v) => ({
      id: v.id,
      sku: v.sku,
      title: v.title,
      priceCents: v.priceCents,
      compareAtCents: v.compareAtCents ?? null,
      stock: v.stock,
      optionValueIds: (optionValueIdsByVariant.get(v.id) ?? []).map((r) => r.optionValueId),
    })),
    collections: prodCollections,
  }
}

export async function getProductDetailBySlug(slug: string): Promise<ProductDetail | null> {
  const db = getDb()
  const [product] = await db
    .select()
    .from(products)
    .where(and(eq(products.slug, slug), eq(products.status, 'active')))
    .limit(1)
  if (!product) return null
  return buildProductDetail(product)
}

export async function listCollections(): Promise<Collection[]> {
  const db = getDb()
  const rows = await db.select().from(collections).orderBy(collections.position)

  const counts = await db
    .select({ collectionId: productCollections.collectionId, count: sql<number>`count(*)` })
    .from(productCollections)
    .innerJoin(products, eq(products.id, productCollections.productId))
    .where(eq(products.status, 'active'))
    .groupBy(productCollections.collectionId)
  const countByCollection = new Map(counts.map((c) => [c.collectionId, c.count]))

  return rows.map((c) => ({
    id: c.id,
    slug: c.slug,
    title: c.title,
    description: c.description,
    imageUrl: c.imageUrl,
    productCount: countByCollection.get(c.id) ?? 0,
  }))
}

export async function getCollectionBySlug(slug: string): Promise<Collection | null> {
  const db = getDb()
  const [row] = await db.select().from(collections).where(eq(collections.slug, slug)).limit(1)
  if (!row) return null

  const [countRow] = await db
    .select({ count: sql<number>`count(*)` })
    .from(productCollections)
    .innerJoin(products, eq(products.id, productCollections.productId))
    .where(and(eq(productCollections.collectionId, row.id), eq(products.status, 'active')))

  return {
    id: row.id,
    slug: row.slug,
    title: row.title,
    description: row.description,
    imageUrl: row.imageUrl,
    productCount: countRow?.count ?? 0,
  }
}

/* ------------------------------------------------------------------ */
/* Admin — prodotti                                                    */
/* ------------------------------------------------------------------ */

export async function adminGetProductById(id: number): Promise<ProductDetail | null> {
  const db = getDb()
  const [product] = await db.select().from(products).where(eq(products.id, id)).limit(1)
  if (!product) return null
  return buildProductDetail(product)
}

export async function adminListProducts(params: {
  q?: string
  page: number
  limit: number
  status?: ProductStatus
}): Promise<Paginated<AdminProductRow>> {
  const db = getDb()

  const conditions = []
  if (params.status) conditions.push(eq(products.status, params.status))
  if (params.q) {
    const pattern = `%${params.q}%`
    conditions.push(or(like(products.title, pattern), like(products.slug, pattern))!)
  }

  const rows = await db
    .select()
    .from(products)
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(desc(products.updatedAt))

  const total = rows.length
  const start = (params.page - 1) * params.limit
  const pageRows = rows.slice(start, start + params.limit)
  const ids = pageRows.map((p) => p.id)

  const [variantRows, imageRows] = ids.length
    ? await Promise.all([
        db.select().from(variants).where(inArray(variants.productId, ids)),
        db.select().from(productImages).where(inArray(productImages.productId, ids)),
      ])
    : [[], []]
  const variantsByProduct = groupBy(variantRows, (v) => v.productId)
  const imagesByProduct = groupBy(imageRows, (i) => i.productId)

  const items: AdminProductRow[] = pageRows.map((p) => {
    const productVariants = variantsByProduct.get(p.id) ?? []
    return {
      id: p.id,
      slug: p.slug,
      title: p.title,
      status: p.status,
      image: firstImage(imagesByProduct.get(p.id) ?? []),
      variantCount: productVariants.length,
      minPriceCents: productVariants.length
        ? Math.min(...productVariants.map((v) => v.priceCents))
        : null,
      totalStock: productVariants.reduce((sum, v) => sum + v.stock, 0),
      updatedAt: p.updatedAt,
    }
  })

  return { items, total, page: params.page, pages: Math.max(1, Math.ceil(total / params.limit)), limit: params.limit }
}

export async function adminCreateProduct(input: AdminProductInput): Promise<ProductDetail> {
  const db = getDb()

  const productId = await db.transaction(async (tx) => {
    const [product] = await tx
      .insert(products)
      .values({
        slug: input.slug,
        title: input.title,
        excerpt: input.excerpt ?? null,
        description: input.description ?? null,
        status: input.status,
      })
      .returning()

    if (input.images.length) {
      await tx.insert(productImages).values(
        input.images.map((img, position) => ({
          productId: product!.id,
          url: img.url,
          alt: img.alt ?? null,
          position,
        }))
      )
    }

    // opzioni + valori: options[i] corrisponde posizionalmente a optionValues[i] di ogni variante
    const optionValueIdsByAxis: number[][] = []
    for (let i = 0; i < input.options.length; i++) {
      const opt = input.options[i]!
      const [optionRow] = await tx
        .insert(productOptions)
        .values({ productId: product!.id, name: opt.name, position: i })
        .returning()
      const valueIds: number[] = []
      for (let j = 0; j < opt.values.length; j++) {
        const [valueRow] = await tx
          .insert(optionValues)
          .values({ optionId: optionRow!.id, value: opt.values[j]!, position: j })
          .returning()
        valueIds.push(valueRow!.id)
      }
      optionValueIdsByAxis.push(valueIds)
    }

    for (let vIdx = 0; vIdx < input.variants.length; vIdx++) {
      const variantInput = input.variants[vIdx]!
      const [variantRow] = await tx
        .insert(variants)
        .values({
          productId: product!.id,
          sku: variantInput.sku,
          title: variantInput.title,
          priceCents: variantInput.priceCents,
          compareAtCents: variantInput.compareAtCents ?? null,
          stock: variantInput.stock,
          position: vIdx,
        })
        .returning()

      const links = variantInput.optionValues
        .map((value, axisIndex) => {
          const axis = input.options[axisIndex]
          if (!axis) return null
          const idx = axis.values.indexOf(value)
          const valueId = idx >= 0 ? optionValueIdsByAxis[axisIndex]?.[idx] : undefined
          return valueId !== undefined ? { variantId: variantRow!.id, optionValueId: valueId } : null
        })
        .filter((l): l is { variantId: number; optionValueId: number } => l !== null)

      if (links.length) await tx.insert(variantOptionValues).values(links)
    }

    if (input.collectionSlugs.length) {
      const collectionRows = await tx.select().from(collections).where(inArray(collections.slug, input.collectionSlugs))
      if (collectionRows.length) {
        await tx.insert(productCollections).values(collectionRows.map((c) => ({ productId: product!.id, collectionId: c.id })))
      }
    }

    return product!.id
  })

  const detail = await adminGetProductById(productId)
  if (!detail) throw new Error('Prodotto creato ma non ritrovato: stato incoerente')
  return detail
}

export async function adminReplaceProduct(id: number, input: AdminProductInput): Promise<ProductDetail> {
  const db = getDb()

  await db.transaction(async (tx) => {
    const [existing] = await tx.select().from(products).where(eq(products.id, id)).limit(1)
    if (!existing) throw notFound('Prodotto non trovato')

    await tx
      .update(products)
      .set({
        slug: input.slug,
        title: input.title,
        excerpt: input.excerpt ?? null,
        description: input.description ?? null,
        status: input.status,
        updatedAt: new Date().toISOString(),
      })
      .where(eq(products.id, id))

    // immagini: replace completo
    await tx.delete(productImages).where(eq(productImages.productId, id))
    if (input.images.length) {
      await tx.insert(productImages).values(
        input.images.map((img, position) => ({ productId: id, url: img.url, alt: img.alt ?? null, position }))
      )
    }

    // varianti assenti dal payload: rimosse. Prima si liberano le righe carrello che le referenziano.
    const existingVariants = await tx.select().from(variants).where(eq(variants.productId, id))
    const keepIds = new Set(input.variants.map((v) => v.id).filter((v): v is number => v !== undefined))
    const toDelete = existingVariants.filter((v) => !keepIds.has(v.id)).map((v) => v.id)
    if (toDelete.length) {
      await tx.delete(cartItems).where(inArray(cartItems.variantId, toDelete))
      await tx.delete(variants).where(inArray(variants.id, toDelete))
    }

    // opzioni: replace completo (la cascata su option_values / variant_option_values è del DB,
    // qui ricostruiamo comunque i link espliciti per ogni variante subito dopo)
    await tx.delete(productOptions).where(eq(productOptions.productId, id))
    const optionValueIdsByAxis: number[][] = []
    for (let i = 0; i < input.options.length; i++) {
      const opt = input.options[i]!
      const [optionRow] = await tx
        .insert(productOptions)
        .values({ productId: id, name: opt.name, position: i })
        .returning()
      const valueIds: number[] = []
      for (let j = 0; j < opt.values.length; j++) {
        const [valueRow] = await tx
          .insert(optionValues)
          .values({ optionId: optionRow!.id, value: opt.values[j]!, position: j })
          .returning()
        valueIds.push(valueRow!.id)
      }
      optionValueIdsByAxis.push(valueIds)
    }

    const resolveLinks = (variantId: number, selections: string[]) =>
      selections
        .map((value, axisIndex) => {
          const axis = input.options[axisIndex]
          if (!axis) return null
          const idx = axis.values.indexOf(value)
          const valueId = idx >= 0 ? optionValueIdsByAxis[axisIndex]?.[idx] : undefined
          return valueId !== undefined ? { variantId, optionValueId: valueId } : null
        })
        .filter((l): l is { variantId: number; optionValueId: number } => l !== null)

    for (let vIdx = 0; vIdx < input.variants.length; vIdx++) {
      const variantInput = input.variants[vIdx]!
      let variantId: number
      if (variantInput.id !== undefined && keepIds.has(variantInput.id)) {
        variantId = variantInput.id
        await tx
          .update(variants)
          .set({
            sku: variantInput.sku,
            title: variantInput.title,
            priceCents: variantInput.priceCents,
            compareAtCents: variantInput.compareAtCents ?? null,
            stock: variantInput.stock,
            position: vIdx,
          })
          .where(eq(variants.id, variantId))
      } else {
        const [row] = await tx
          .insert(variants)
          .values({
            productId: id,
            sku: variantInput.sku,
            title: variantInput.title,
            priceCents: variantInput.priceCents,
            compareAtCents: variantInput.compareAtCents ?? null,
            stock: variantInput.stock,
            position: vIdx,
          })
          .returning()
        variantId = row!.id
      }

      const links = resolveLinks(variantId, variantInput.optionValues)
      if (links.length) await tx.insert(variantOptionValues).values(links)
    }

    // collezioni: replace completo
    await tx.delete(productCollections).where(eq(productCollections.productId, id))
    if (input.collectionSlugs.length) {
      const collectionRows = await tx.select().from(collections).where(inArray(collections.slug, input.collectionSlugs))
      if (collectionRows.length) {
        await tx.insert(productCollections).values(collectionRows.map((c) => ({ productId: id, collectionId: c.id })))
      }
    }
  })

  const detail = await adminGetProductById(id)
  if (!detail) throw notFound('Prodotto non trovato')
  return detail
}

export async function adminDeleteProduct(id: number): Promise<void> {
  const db = getDb()
  const [existing] = await db.select({ id: products.id }).from(products).where(eq(products.id, id)).limit(1)
  if (!existing) throw notFound('Prodotto non trovato')
  // la cascata FK del DB elimina immagini, opzioni, varianti, righe carrello e collezioni collegate
  await db.delete(products).where(eq(products.id, id))
}

/* ------------------------------------------------------------------ */
/* Admin — collezioni                                                  */
/* ------------------------------------------------------------------ */

export type CollectionInput = { slug: string; title: string; description?: string | null; imageUrl?: string | null }

export async function adminListCollections(): Promise<Collection[]> {
  return listCollections()
}

export async function adminCreateCollection(input: CollectionInput): Promise<Collection> {
  const db = getDb()
  const [row] = await db
    .insert(collections)
    .values({
      slug: input.slug,
      title: input.title,
      description: input.description ?? null,
      imageUrl: input.imageUrl ?? null,
    })
    .returning()
  return { id: row!.id, slug: row!.slug, title: row!.title, description: row!.description, imageUrl: row!.imageUrl, productCount: 0 }
}

export async function adminUpdateCollection(id: number, input: CollectionInput): Promise<Collection> {
  const db = getDb()
  const [existing] = await db.select().from(collections).where(eq(collections.id, id)).limit(1)
  if (!existing) throw notFound('Collezione non trovata')

  await db
    .update(collections)
    .set({
      slug: input.slug,
      title: input.title,
      description: input.description ?? null,
      imageUrl: input.imageUrl ?? null,
    })
    .where(eq(collections.id, id))

  const updated = await getCollectionBySlug(input.slug)
  if (!updated) throw new Error('Collezione aggiornata ma non ritrovata: stato incoerente')
  return updated
}

export async function adminDeleteCollection(id: number): Promise<void> {
  const db = getDb()
  const [existing] = await db.select({ id: collections.id }).from(collections).where(eq(collections.id, id)).limit(1)
  if (!existing) throw notFound('Collezione non trovata')
  await db.delete(collections).where(eq(collections.id, id))
}
