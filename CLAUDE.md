# Istruzioni per Claude Code su questo repository

## Cos'è
Stack ecommerce custom riutilizzabile: alternativa leggera a Shopify/WooCommerce per progetti
con catalogo piccolo. Monorepo npm workspaces, due processi.

```
apps/storefront   Astro 5 SSR (adapter node) + Tailwind v4 — sito pubblico e /admin
apps/api          Fastify 5 + Stripe + sessioni admin
packages/db       Drizzle ORM + SQLite (schema, migrazioni, seed)
packages/shared   Zod: contratti condivisi fra API e frontend
```

## Regole non negoziabili

**I contratti stanno in `packages/shared/src/index.ts`.** Server e frontend importano gli stessi
schemi Zod e gli stessi tipi. Se cambi la forma di un payload, cambiala lì e aggiorna entrambi i
lati: non duplicare mai un tipo in locale.

**`docs/API.md` è la specifica delle rotte.** Se aggiungi o modifichi un endpoint, aggiorna quel
file nello stesso commit. È il documento che gli altri agenti e gli altri sviluppatori leggono
prima di scrivere codice.

**Tutti gli importi sono interi in centesimi.** Mai float per il denaro. La conversione
euro → centesimi si fa su stringa, non con `Math.round(x * 100)` su un float già degradato.
Formattazione solo con `formatPrice()` di `@ecom/shared`.

**Il prezzo e lo stock vivono sulla variante, non sul prodotto.** Un prodotto senza opzioni ha
comunque una variante `Default`. La lista prodotti espone il prezzo minimo fra le varianti.

**Le righe d'ordine sono uno snapshot immutabile.** Titolo, SKU, prezzo e immagine sono copiati
al momento del checkout: modificare un prodotto non deve mai alterare un ordine passato.

**Le regole di business condivise stanno in `@ecom/shared`**, non sparse: spedizione
(`calcShippingCents`), soglia gratuita, slugify. Se una regola serve a entrambi i lati, va lì.

## Frontend

Astro con **zero JS di default**. Nessun framework UI: gli unici punti con JavaScript sono il
selettore varianti nella PDP, le azioni del carrello, il polling della pagina ordine e l'editor
prodotto nell'admin. Filtri, ordinamento e paginazione della PLP sono `<form method="get">` che
ricaricano la pagina. Non introdurre React/Vue/Svelte per risolvere problemi che un form risolve.

I colori e i token del tema vivono nel blocco `@theme` di
`apps/storefront/src/styles/global.css`: è il punto unico per il rebranding su un nuovo cliente.

Il carrello è lato server; il browser conserva solo `cart_id` in un cookie. Le mutazioni passano
dal proxy Astro `src/pages/api/cart.ts` così il client non gestisce né creazione carrello né CORS.

## Comandi

```bash
npm install                          # una volta
npm run db:migrate && npm run db:seed
npm run dev                          # API :3001 + storefront :4321 in parallelo
npm run db:reset                     # cancella il DB, poi rifai migrate + seed
npm run typecheck
```

Dopo aver modificato `packages/db/src/schema.ts`: `npm run db:generate` per creare la migrazione,
poi `npm run db:migrate`. Non editare a mano i file SQL generati in `packages/db/drizzle/`.

## Stripe

Sandbox/test only in sviluppo. Senza chiavi in `.env` il sito funziona interamente e solo il
checkout risponde `503 STRIPE_NOT_CONFIGURED` con un avviso esplicito: è il comportamento voluto,
non un bug da "aggiustare" con un fallback finto.

Il webhook richiede il body **raw**: non applicare parser JSON globali che lo consumino.
Gli eventi sono resi idempotenti dalla tabella `webhook_events`.

## Stile

Testi dell'interfaccia e messaggi d'errore in italiano. Commenti in italiano e solo dove spiegano
un "perché" non ovvio dal codice. TypeScript strict, niente `any` non giustificato, niente
`@ts-ignore`.
