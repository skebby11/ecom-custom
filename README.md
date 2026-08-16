# Ecom Custom

Ecommerce headless: catalogo con varianti, carrello, checkout Stripe e pannello admin,
in un monorepo npm workspaces pronto per essere personalizzato.

## Stack

| Livello | Tecnologia | Perché |
| --- | --- | --- |
| Storefront | Astro 5 (SSR, adapter `node`) | HTML renderizzato lato server, SEO nativo, JS minimo spedito al browser |
| API | Fastify (TypeScript, eseguito con `tsx`) | Server HTTP leggero e veloce, zero step di build in sviluppo |
| Database | SQLite + Drizzle ORM | Zero infrastruttura per partire; schema tipizzato con migrazione a Postgres semplice quando serve |
| Pagamenti | Stripe Checkout | Nessun dato carta gestito direttamente: PCI compliance delegata a Stripe |
| Monorepo | npm workspaces | Codice condiviso (`@ecom/shared`, `@ecom/db`) senza duplicazioni tra API e storefront |

## Quick start

```bash
git clone <repo-url> && cd ecom-custom
cp .env.example .env
npm install
npm run db:migrate && npm run db:seed
npm run dev
```

- Storefront: http://localhost:4321
- Admin: http://localhost:4321/admin (credenziali da `ADMIN_EMAIL` / `ADMIN_PASSWORD` in `.env`)
- API: http://localhost:3001

## Stripe in sandbox

1. Crea un account Stripe (o usane uno esistente) e prendi le chiavi **test** da
   https://dashboard.stripe.com/test/apikeys — copiale in `STRIPE_SECRET_KEY` e
   `STRIPE_PUBLISHABLE_KEY` nel tuo `.env`.
2. Installa la [Stripe CLI](https://docs.stripe.com/stripe-cli) (`brew install stripe/stripe-cli/stripe`
   oppure il pacchetto per la tua distro).
3. Fai login (`stripe login`) e avvia il forwarding webhook in locale:
   ```bash
   stripe listen --forward-to localhost:3001/api/webhooks/stripe
   ```
4. La CLI stampa un valore `whsec_...`: incollalo in `STRIPE_WEBHOOK_SECRET` nel `.env`
   e riavvia l'API.
5. In checkout usa la carta di test **4242 4242 4242 4242**, qualsiasi data futura come
   scadenza e qualsiasi CVC a 3 cifre.

Senza chiavi Stripe configurate il resto del sito funziona normalmente: solo il checkout
risponde con `503 STRIPE_NOT_CONFIGURED` e un messaggio esplicito, invece di rompersi.

## Struttura del progetto

```
apps/
  api/            Fastify — rotte pubbliche, carrello, checkout, admin
  storefront/      Astro SSR — pagine pubbliche + pannello /admin
packages/
  db/             Schema Drizzle, migrazioni, script di seed
  shared/         Tipi/Zod condivisi tra API e storefront (fonte di verità dei contratti)
docker/           Dockerfile per api e storefront
docs/             API.md (contratto rotte), DEPLOY.md (guida deploy)
data/             File SQLite locale (creato al primo avvio, ignorato da git)
```

## Modello dati

Il catalogo segue la gerarchia **prodotto → opzioni → valori → varianti**: un prodotto
definisce assi di variazione (es. "Taglia", "Colore"), ogni asse ha dei valori (S/M/L/XL,
Rosso/Blu...), e ogni combinazione acquistabile è una **variante** — con il proprio SKU,
prezzo e stock. Prezzo e stock non stanno mai sul prodotto: un prodotto senza varianti non
è vendibile, e prodotti "senza opzioni" hanno comunque una variante singola (`Default`).

Un **ordine** contiene righe (`order_items`) che sono uno **snapshot immutabile** del
prodotto al momento dell'acquisto (titolo, SKU, prezzo, immagine): se in seguito il
prodotto viene rinominato, scontato o eliminato, gli ordini passati restano corretti e
coerenti con quello che il cliente ha effettivamente pagato.

## Script disponibili

| Comando | Cosa fa |
| --- | --- |
| `npm run dev` | Avvia API e storefront in parallelo, con reload |
| `npm run build` | Build di produzione di API e storefront |
| `npm run start` | Avvia API e storefront in modalità produzione (richiede build) |
| `npm run db:generate` | Genera una nuova migrazione Drizzle dallo schema |
| `npm run db:migrate` | Applica le migrazioni al database configurato |
| `npm run db:seed` | Popola/aggiorna i dati demo (idempotente) |
| `npm run db:reset` | Cancella il file SQLite locale (poi rilanciare migrate + seed) |
| `npm run typecheck` | Type-check dell'intero monorepo |
| `npm run setup` | `install` + `migrate` + `seed` in un unico comando |

## Personalizzazione

- **Colori e tema**: `apps/storefront/src/styles/global.css`, blocco `@theme` (Tailwind v4:
  design token, non un file di config separato).
- **Regole di spedizione**: `packages/shared/src/format.ts`, funzione `calcShippingCents`
  e costanti `FREE_SHIPPING_THRESHOLD_CENTS` / `FLAT_SHIPPING_CENTS`. Il file contiene solo
  helper puri, senza zod: è quello che importano anche gli script che girano nel browser.

## Da SQLite a Postgres

Quando il progetto cresce oltre ciò che SQLite gestisce comodamente:

1. Sostituisci `better-sqlite3` + `drizzle-orm/better-sqlite3` con `pg` (o `postgres`) +
   `drizzle-orm/node-postgres` in `packages/db`.
2. Cambia `dialect: 'sqlite'` in `dialect: 'postgresql'` in `packages/db/drizzle.config.ts`
   e aggiorna `dbCredentials` con una connection string.
3. Rigenera le migrazioni da zero con `npm run db:generate` (la sintassi SQL cambia tra
   i due dialetti, non è un semplice porting).
4. Rivedi i tipi colonna specifici SQLite nello schema (es. `text(..., { mode: 'json' })`
   ha un equivalente `jsonb` nativo in Postgres) e adegua `packages/db/src/index.ts`
   (niente più `pragma`/file su disco, solo una connection pool).

## Cosa NON include

Per restare uno starter leggibile e facile da estendere, questo progetto **non**
implementa: multi-lingua/multi-valuta, resi e RMA, gestione magazzino avanzata
(multi-warehouse, prenotazioni stock), email transazionali (conferma ordine, spedizione),
recensioni prodotto, sconti/coupon. Sono tutte estensioni ragionevoli da aggiungere sopra
lo schema esistente quando servono davvero.
