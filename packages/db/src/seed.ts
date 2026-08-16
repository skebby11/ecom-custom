/**
 * Popola il database con dati demo. Eseguito da `npm run db:seed` (tsx).
 *
 * Idempotente:
 * - le tabelle di catalogo (collezioni, prodotti e tutto ciò che dipende da essi
 *   tramite `ON DELETE CASCADE`) vengono svuotate e ricreate dentro un'unica transazione;
 * - gli ordini (`orders`, `order_items`, `carts`, `webhook_events`) NON vengono toccati;
 * - l'utente admin viene creato oppure, se l'email esiste già, solo l'hash password
 *   viene aggiornato (nessun duplicato).
 */
import { createDb } from './index.js'
import { hashPassword } from './password.js'
import {
  adminUsers,
  collections,
  optionValues,
  productCollections,
  productImages,
  productOptions,
  products,
  variantOptionValues,
  variants,
} from './schema.js'
import { collectionsSeed, productsSeed, type ProductOptionSeed } from './seed-data.js'

const db = createDb()

interface SeedSummary {
  collections: number
  products: number
  draftProducts: number
  variants: number
}

function buildVariantTitle(selection: string[]): string {
  return selection.length > 0 ? selection.join(' / ') : 'Default'
}

function runSeed(): SeedSummary {
  return db.transaction((tx) => {
    // ---- 1. svuota il catalogo (cascade su immagini, opzioni, valori, varianti,
    //         collegamenti variante↔opzione e prodotto↔collezione) ------------
    tx.delete(products).run()
    tx.delete(collections).run()

    // ---- 2. ricrea le collezioni, mappando slug -> id ------------------------
    const collectionIdBySlug = new Map<string, number>()
    for (const c of collectionsSeed) {
      const result = tx
        .insert(collections)
        .values({
          slug: c.slug,
          title: c.title,
          description: c.description,
          imageUrl: c.imageUrl,
          position: c.position,
        })
        .run()
      collectionIdBySlug.set(c.slug, Number(result.lastInsertRowid))
    }

    // ---- 3. ricrea i prodotti con immagini, opzioni, varianti, collezioni ----
    let variantCount = 0
    let draftCount = 0

    for (const p of productsSeed) {
      const productResult = tx
        .insert(products)
        .values({
          slug: p.slug,
          title: p.title,
          excerpt: p.excerpt,
          description: p.description,
          status: p.status,
        })
        .run()
      const productId = Number(productResult.lastInsertRowid)
      if (p.status === 'draft') draftCount += 1

      // immagini deterministiche via picsum.photos, seed = slug prodotto
      for (let i = 0; i < p.imageCount; i += 1) {
        const n = i + 1
        tx.insert(productImages)
          .values({
            productId,
            url: `https://picsum.photos/seed/${p.slug}-${n}/800/1000`,
            alt: `${p.title} — immagine ${n}`,
            position: i,
          })
          .run()
      }

      // opzioni + valori, mappando nome opzione -> valore -> id
      const valueIdByOptionAndValue = new Map<string, Map<string, number>>()
      p.options.forEach((opt: ProductOptionSeed, optIdx: number) => {
        const optionResult = tx
          .insert(productOptions)
          .values({ productId, name: opt.name, position: optIdx })
          .run()
        const optionId = Number(optionResult.lastInsertRowid)

        const valueIdByValue = new Map<string, number>()
        opt.values.forEach((value, valueIdx) => {
          const valueResult = tx
            .insert(optionValues)
            .values({ optionId, value, position: valueIdx })
            .run()
          valueIdByValue.set(value, Number(valueResult.lastInsertRowid))
        })
        valueIdByOptionAndValue.set(opt.name, valueIdByValue)
      })

      // varianti + collegamento ai valori opzione selezionati
      p.variants.forEach((v, variantIdx) => {
        const variantResult = tx
          .insert(variants)
          .values({
            productId,
            sku: v.sku,
            title: buildVariantTitle(v.selection),
            priceCents: v.priceCents ?? p.priceCents,
            compareAtCents: p.compareAtCents ?? null,
            stock: v.stock,
            position: variantIdx,
          })
          .run()
        const variantId = Number(variantResult.lastInsertRowid)
        variantCount += 1

        v.selection.forEach((value, axisIdx) => {
          const option = p.options[axisIdx]
          if (!option) return
          const valueId = valueIdByOptionAndValue.get(option.name)?.get(value)
          if (valueId === undefined) return
          tx.insert(variantOptionValues).values({ variantId, optionValueId: valueId }).run()
        })
      })

      // collezioni collegate
      for (const collectionSlug of p.collectionSlugs) {
        const collectionId = collectionIdBySlug.get(collectionSlug)
        if (collectionId === undefined) continue
        tx.insert(productCollections).values({ productId, collectionId }).run()
      }
    }

    // ---- 4. utente admin: crea o aggiorna solo l'hash, mai duplicato ---------
    const adminEmail = (process.env.ADMIN_EMAIL ?? 'admin@example.com').trim()
    const adminPassword = process.env.ADMIN_PASSWORD ?? 'changeme123'
    const passwordHash = hashPassword(adminPassword)

    tx.insert(adminUsers)
      .values({ email: adminEmail, passwordHash, name: 'Amministratore' })
      .onConflictDoUpdate({ target: adminUsers.email, set: { passwordHash } })
      .run()

    return {
      collections: collectionsSeed.length,
      products: productsSeed.length,
      draftProducts: draftCount,
      variants: variantCount,
    } satisfies SeedSummary
  })
}

const summary = runSeed()
const adminEmail = (process.env.ADMIN_EMAIL ?? 'admin@example.com').trim()

console.log('')
console.log('✓ Seed completato')
console.log(`  Collezioni : ${summary.collections}`)
console.log(
  `  Prodotti   : ${summary.products} (${summary.products - summary.draftProducts} attivi, ${summary.draftProducts} in bozza)`
)
console.log(`  Varianti   : ${summary.variants}`)
console.log(`  Admin      : ${adminEmail}`)
console.log('  Password   : quella di ADMIN_PASSWORD nel tuo .env (default: changeme123)')
console.log('')
