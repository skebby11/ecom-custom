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

**L'ordine pubblico e l'ordine admin sono due contratti distinti.** `orderSchema` alimenta anche
`GET /api/orders/:id?token=…`, che il cliente raggiunge con un token: lì non va nulla che non gli
serva. I riferimenti Stripe (`stripeSessionId`, `stripePaymentIntentId`) vivono in
`adminOrderSchema` e li serializza solo `serializeAdminOrder()`. Se un campo serve a una sola
delle due parti, la distinzione va nel contratto — non in un cast nel template: un cast non crea
dati, silenzia solo TypeScript mentre il campo resta `undefined`.

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

## Ambiente: quattro trappole già scattate

**Node 20, e la versione sta in `.nvmrc`.** `engines.node` resta un permissivo `">=20"`. La CI usa
`node-version-file: .nvmrc`: puntarla a `engines` la fa risolvere all'ultima major, dove il binding
nativo di `better-sqlite3` va in assert (SIGABRT, exit 134) durante il seed. Se `db:seed` muore
senza un errore leggibile, guarda `node -v` prima di ogni altra cosa.

**`PUBLIC_SITE_URL` è obbligatoria in produzione e non può puntare a localhost.** `astro build`
forza `NODE_ENV=production` e `astro.config.mjs` rifiuta un valore assente, non parsabile o locale,
perché quel valore finisce in `security.allowedDomains` e nel bundle. Conseguenza nota e accettata:
`docker compose build` senza `PUBLIC_SITE_URL` in `.env` fallisce sempre, dato che il fallback del
compose è `localhost:4321`.

**Dietro un tunnel serve `PUBLIC_SITE_URL`, altrimenti è 403 su tutto.** Il dev server di Vite
rifiuta le richieste il cui header `Host` non è in `server.allowedHosts` (difesa dal DNS
rebinding), e `astro.config.mjs` costruisce quella lista dall'host di `PUBLIC_SITE_URL`. Vale per
ngrok, Tailscale, qualunque reverse proxy. Il 403 arriva da Vite, non da Astro: il messaggio lo
dice, ma è facile scambiarlo per il controllo CSRF.

**Cambiare `ADMIN_PASSWORD` nel `.env` non cambia la password.** Il login verifica un hash scrypt
nella tabella `admin_users`, e quell'hash lo scrive solo il seed. Finché non rilanci `db:seed`
resta valida la password precedente — con l'admin esposto, è una falsa sensazione di sicurezza.
Attenzione però: il seed fa `delete` di prodotti e collezioni e li ricrea, quindi gli ordini
esistenti restano ma le loro righe puntano a varianti che non esistono più (sono snapshot, si
leggono lo stesso). Per la sola password conviene uno script mirato che aggiorni l'hash.

## CI

`.github/workflows/ci.yml` gira su ogni PR verso `main` con tre job: typecheck e build (più un
grep che verifica che `dist/client` non contenga `localhost`), migrate e seed, e un controllo delle
convenzioni di questo file (`scripts/ci/check-conventions.mjs`: niente float sul denaro, niente
contratti Zod duplicati fuori da `@ecom/shared`, `docs/API.md` aggiornata se il diff tocca
`apps/api/src/routes/`). Il seed è fail-closed: `NODE_ENV` assente vale `production` e blocca
l'esecuzione, servono `NODE_ENV=development` e `ADMIN_EMAIL`/`ADMIN_PASSWORD` validi.

## Stripe

Sandbox/test only in sviluppo. Senza chiavi in `.env` il sito funziona interamente e solo il
checkout risponde `503 STRIPE_NOT_CONFIGURED` con un avviso esplicito: è il comportamento voluto,
non un bug da "aggiustare" con un fallback finto.

Il webhook richiede il body **raw**: non applicare parser JSON globali che lo consumino.
Gli eventi sono resi idempotenti dalla tabella `webhook_events`.

`checkout.session.completed` porta l'ordine a `paid`, scala lo stock e svuota il carrello. Finché
quell'evento non arriva l'ordine resta `pending` e la pagina di conferma continua a fare polling:
un ordine "in elaborazione" all'infinito vuol dire quasi sempre che manca l'endpoint webhook, non
che il pagamento è fallito. Stripe non consegna gli eventi nati **prima** che l'endpoint esistesse,
quindi dopo averlo registrato serve un pagamento nuovo per vedere la catena funzionare.

In locale il forwarding si fa con `stripe listen --forward-to localhost:3001/api/webhooks/stripe`.
Se invece esponi il dev server con un tunnel, il path del webhook deve puntare all'**API** (`:3001`)
e non allo storefront (`:4321`), che quella rotta non ce l'ha e risponderebbe `404`. Il secret è
letto all'avvio: dopo averlo cambiato, riavvia l'API.

## Stile

Testi dell'interfaccia e messaggi d'errore in italiano. Commenti in italiano e solo dove spiegano
un "perché" non ovvio dal codice. TypeScript strict, niente `any` non giustificato, niente
`@ts-ignore`.
