/**
 * Popola il database con dati demo. Eseguito da `npm run db:seed` (tsx).
 *
 * Idempotente:
 * - le tabelle di catalogo (collezioni, prodotti e tutto ciò che dipende da essi
 *   tramite `ON DELETE CASCADE`) vengono svuotate e ricreate dentro un'unica transazione;
 * - gli ordini (`orders`, `order_items`, `webhook_events`) NON vengono toccati: le
 *   righe ordine sono snapshot e `order_items.variant_id` non ha chiave esterna;
 * - l'utente admin viene creato oppure, se l'email esiste già, solo l'hash password
 *   viene aggiornato (nessun duplicato).
 *
 * ATTENZIONE — è distruttivo per i carrelli attivi: cancellare i prodotti fa
 * cascata su `variants` e da lì su `cart_items`, quindi i carrelli dei clienti
 * restano ma si svuotano. Per questo lo script è uno strumento di sviluppo e si
 * rifiuta di girare fuori da `NODE_ENV=development` senza `--force`.
 */
import { DEFAULT_VARIANT_TITLE } from '@ecom/shared/format'
import { sql } from 'drizzle-orm'
import { createDb } from './index.js'
import { hashPassword } from './password.js'
import {
  adminUsers,
  cartItems,
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
  return selection.length > 0 ? selection.join(' / ') : DEFAULT_VARIANT_TITLE
}

/** Password che non devono mai finire in un ambiente raggiungibile da fuori. */
const WEAK_PASSWORDS = new Set(['changeme123', 'password', 'admin1234', '12345678'])

/**
 * Le credenziali admin arrivano solo dall'ambiente, senza valori di ripiego:
 * un default nel codice significa che un'installazione lasciata a metà espone
 * un account amministratore dalle credenziali note.
 */
function readAdminCredentials(): { email: string; password: string } {
  const email = (process.env.ADMIN_EMAIL ?? '').trim()
  const password = process.env.ADMIN_PASSWORD ?? ''

  const problems: string[] = []
  if (!email) problems.push('ADMIN_EMAIL non è impostata')
  else if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) problems.push(`ADMIN_EMAIL non è un indirizzo valido: ${email}`)
  if (!password) problems.push('ADMIN_PASSWORD non è impostata')
  else if (password.length < 8) problems.push('ADMIN_PASSWORD deve essere di almeno 8 caratteri')

  // in sviluppo la password di esempio va bene; altrove è un account regalato
  if (process.env.NODE_ENV === 'production' && WEAK_PASSWORDS.has(password)) {
    problems.push('ADMIN_PASSWORD è una password di esempio: cambiala prima di seedare in produzione')
  }

  if (problems.length > 0) {
    console.error(`✗ Impossibile creare l'utente admin:\n  - ${problems.join('\n  - ')}`)
    console.error('\n  Imposta le variabili nel file .env (vedi .env.example) e rilancia il seed.')
    process.exit(1)
  }

  return { email, password }
}

/**
 * Il seed ricrea il catalogo da zero e questo svuota i carrelli attivi.
 * Fail-closed come `db:reset`: `NODE_ENV` non impostata è la norma in produzione,
 * quindi trattarla come sviluppo renderebbe la guardia inutile dove serve.
 */
function assertSafeToSeed(): void {
  const forced = process.argv.includes('--force')
  const nodeEnv = process.env.NODE_ENV ?? 'production'
  if (nodeEnv === 'development' || forced) return

  console.error(
    `✗ Rifiuto di rigenerare il catalogo con NODE_ENV="${nodeEnv}".\n` +
      '  Il seed cancella e ricrea tutti i prodotti: i carrelli attivi si svuotano.\n\n' +
      '  In sviluppo:  NODE_ENV=development npm run db:seed\n' +
      '  Per forzare:  npm run db:seed -- --force'
  )
  process.exit(1)
}

/** Righe carrello che la rigenerazione del catalogo porterà via. */
function countCartLinesAtRisk(): number {
  const [row] = db.select({ n: sql<number>`count(*)` }).from(cartItems).all()
  return row?.n ?? 0
}

// validate-first: fallire dopo aver già ricreato l'intero catalogo sarebbe
// solo lavoro sprecato, anche se la transazione poi lo annulla
assertSafeToSeed()
const admin = readAdminCredentials()
const cartLinesAtRisk = countCartLinesAtRisk()

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
      const optionIdByName = new Map<string, number>()
      const valueIdByOptionAndValue = new Map<string, Map<string, number>>()
      p.options.forEach((opt: ProductOptionSeed, optIdx: number) => {
        const optionResult = tx
          .insert(productOptions)
          .values({ productId, name: opt.name, position: optIdx })
          .run()
        const optionId = Number(optionResult.lastInsertRowid)
        optionIdByName.set(opt.name, optionId)

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
          const optionId = optionIdByName.get(option.name)
          if (valueId === undefined || optionId === undefined) return
          tx.insert(variantOptionValues).values({ variantId, optionValueId: valueId, optionId }).run()
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
    const passwordHash = hashPassword(admin.password)

    tx.insert(adminUsers)
      .values({ email: admin.email, passwordHash, name: 'Amministratore' })
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

console.log('')
if (cartLinesAtRisk > 0) {
  console.warn(`⚠ ${cartLinesAtRisk} righe di carrello sono state rimosse con il vecchio catalogo.`)
}
console.log('✓ Seed completato')
console.log(`  Collezioni : ${summary.collections}`)
console.log(
  `  Prodotti   : ${summary.products} (${summary.products - summary.draftProducts} attivi, ${summary.draftProducts} in bozza)`
)
console.log(`  Varianti   : ${summary.variants}`)
console.log(`  Admin      : ${admin.email}`)
console.log('  Password   : quella di ADMIN_PASSWORD nel tuo .env')
console.log('')
