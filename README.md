# Ecom Custom

[![CI](https://github.com/skebby11/ecom-custom/actions/workflows/ci.yml/badge.svg)](https://github.com/skebby11/ecom-custom/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Node](https://img.shields.io/badge/Node-20-green.svg)](.nvmrc)

A self-hosted ecommerce stack for small catalogs: product variants, server-side cart,
Stripe Checkout and an admin panel — in an npm workspaces monorepo you are meant to fork
and rebrand.

It is a deliberate alternative to Shopify and WooCommerce for projects where a hosted
platform is overkill and WordPress is too much machinery: no monthly fee, no plugin
sprawl, no database of a hundred tables. Two Node processes and one SQLite file.

> **Heads up:** all user-facing copy — page text, error messages, admin labels — is in
> **Italian**, because the stack was built for Italian SMEs. The code, comments in this
> README and the API contract are in English. See [Translating the UI](#translating-the-ui)
> if you need another language.

## Why this exists

- **Zero JavaScript by default.** No UI framework. Filtering, sorting and pagination on
  the product list are plain `<form method="get">` submissions. The only client-side
  scripts are the variant picker, the cart actions, the order-status poller and the admin
  product editor.
- **The cart lives on the server.** The browser only keeps a `cart_id` cookie. Cart
  mutations go through an Astro proxy route, so the client never handles cart creation
  or CORS.
- **Money is never a float.** Every amount is an integer number of cents, end to end.
  Euro-to-cents conversion happens on the string, never as `Math.round(x * 100)` on an
  already-degraded float.
- **Order lines are immutable snapshots.** Title, SKU, price and image are copied at
  checkout time, so editing a product can never rewrite a past order.
- **One source of truth for contracts.** API and storefront import the same Zod schemas
  and the same types from `@ecom/shared`. A payload shape cannot drift between the two.

## Stack

| Layer | Technology | Why |
| --- | --- | --- |
| Storefront | Astro 5 (SSR, `node` adapter) | Server-rendered HTML, SEO out of the box, minimal JS shipped to the browser |
| API | Fastify 5 (TypeScript, run with `tsx`) | Small, fast HTTP server with no build step in development |
| Database | SQLite + Drizzle ORM | No infrastructure to get started; typed schema with a clear path to Postgres |
| Payments | Stripe Checkout | No card data ever touches this codebase; PCI compliance stays with Stripe |
| Styling | Tailwind CSS v4 | Theme tokens in one `@theme` block — the single place to rebrand |
| Monorepo | npm workspaces | Shared code (`@ecom/shared`, `@ecom/db`) without duplication |

## Quick start

Requires **Node 20** (see [`.nvmrc`](.nvmrc) — newer majors are not supported yet, see
[Requirements](#requirements)).

```bash
git clone https://github.com/skebby11/ecom-custom.git && cd ecom-custom
cp .env.example .env
# set ADMIN_PASSWORD in .env — it ships empty on purpose
npm install
npm run db:migrate && npm run db:seed
npm run dev
```

| What | Where |
| --- | --- |
| Storefront | http://localhost:4321 |
| Admin panel | http://localhost:4321/admin |
| API | http://localhost:3001 |

Admin credentials are the `ADMIN_EMAIL` / `ADMIN_PASSWORD` values from your `.env`, as
written into the database by the seed.

### Requirements

Node **20**, pinned in `.nvmrc`. The version lives there and not in `engines.node`
(which stays a permissive `">=20"`) because CI resolves `node-version-file: .nvmrc`:
pointing it at `engines` resolves to the newest Node, where the `better-sqlite3` native
binding aborts during the seed. If `npm run db:seed` dies with `SIGABRT` / exit 134,
check your Node version first.

## Configuration

Copy `.env.example` to `.env` and fill it in. The file is gitignored.

| Variable | Purpose |
| --- | --- |
| `NODE_ENV` | `development` enables the destructive `db:reset` / `db:seed` scripts. Absent counts as `production` — the fail-closed default |
| `DATABASE_URL` | SQLite file path, relative to the monorepo root |
| `API_PORT` / `API_HOST` | Where the Fastify server listens |
| `PUBLIC_SITE_URL` | Public origin of the site. Drives CORS, Stripe redirect URLs, canonical tags and the dev-server host allowlist |
| `API_URL` | API origin as seen by the Astro server (SSR, internal network) |
| `PUBLIC_API_URL` | API origin as seen by the browser |
| `PUBLIC_SITE_NAME` | Shop name shown in the UI |
| `ADMIN_EMAIL` / `ADMIN_PASSWORD` | Bootstrap admin, created by `npm run db:seed`. Ships empty: pick your own, minimum 8 characters |
| `STRIPE_SECRET_KEY` / `STRIPE_PUBLISHABLE_KEY` | Stripe test keys |
| `STRIPE_WEBHOOK_SECRET` | Signing secret of your webhook endpoint |

Two things worth knowing before they bite:

- **`PUBLIC_SITE_URL` is mandatory in production and cannot point at localhost.**
  `astro build` forces `NODE_ENV=production` and `astro.config.mjs` rejects a missing,
  unparseable or local value, so that a development origin can never be baked into a
  production image. A consequence: `docker compose build` fails unless `PUBLIC_SITE_URL`
  is set in `.env`, because the compose fallback is `localhost:4321`.
- **Changing `ADMIN_PASSWORD` in `.env` does not change the password.** The login checks
  a scrypt hash stored in the `admin_users` table, and only the seed writes it. Re-run
  `npm run db:seed` to apply a new password — note that the seed also deletes and
  recreates products and collections.

## Stripe

Test mode only in development. **Without Stripe keys the whole site works normally** and
only the checkout returns `503 STRIPE_NOT_CONFIGURED` with an explicit message. That is
intended behaviour, not a bug to paper over with a fake fallback.

1. Grab your test keys from https://dashboard.stripe.com/test/apikeys and put them in
   `STRIPE_SECRET_KEY` and `STRIPE_PUBLISHABLE_KEY`.
2. Install the [Stripe CLI](https://docs.stripe.com/stripe-cli) and log in
   (`stripe login`).
3. Forward webhooks to your local API:
   ```bash
   stripe listen --forward-to localhost:3001/api/webhooks/stripe
   ```
4. The CLI prints a `whsec_…` value: put it in `STRIPE_WEBHOOK_SECRET` and restart the
   API — the secret is read at startup.
5. Pay with test card **4242 4242 4242 4242**, any future expiry, any 3-digit CVC.

The webhook needs the **raw** request body to verify the signature, so never register a
global JSON parser that would consume it. Events are made idempotent through the
`webhook_events` table, so a redelivery cannot decrement stock twice.

`checkout.session.completed` moves the order to `paid`, decrements stock and empties the
cart. Until that event arrives the order stays `pending` and the confirmation page keeps
polling — which is exactly what you will see if you pay without a webhook endpoint
configured.

### Exposing a local server through a tunnel

To receive real webhooks (or to test on a phone) you can put the dev server behind
ngrok, Tailscale Funnel or a reverse proxy. Set `PUBLIC_SITE_URL` to the public URL
before starting: the Vite dev server rejects any request whose `Host` header is not
allowlisted (a DNS-rebinding defence), and `astro.config.mjs` derives that allowlist from
`PUBLIC_SITE_URL`. Without it every request through the tunnel returns `403`.

The webhook path must reach the **API** (`:3001`), not the storefront (`:4321`) — the
storefront has no `/api/webhooks/stripe` route and would answer `404`.

## Project structure

```
apps/
  api/            Fastify — public routes, cart, checkout, admin
  storefront/     Astro SSR — public pages and the /admin panel
packages/
  db/             Drizzle schema, migrations, seed script
  shared/         Zod contracts and types shared by API and storefront
docker/           Dockerfiles for api and storefront
docs/             API.md (route contract), DEPLOY.md (deployment guide)
data/             Local SQLite file (created on first run, gitignored)
```

[`docs/API.md`](docs/API.md) is the route specification: every endpoint, every payload,
every error code. It is kept in sync with the code in the same commit that changes an
endpoint.

## Data model

The catalog follows **product → options → values → variants**. A product defines axes of
variation ("Size", "Color"), each axis has values (S/M/L/XL, Red/Blue…), and every
purchasable combination is a **variant** with its own SKU, price and stock.

Price and stock never live on the product. A product with no options still has a single
`Default` variant; the product list exposes the **lowest** price across variants.

An **order** holds `order_items` that are an immutable snapshot of the product at
purchase time. If the product is later renamed, discounted or deleted, past orders stay
correct and consistent with what the customer actually paid.

## Scripts

| Command | What it does |
| --- | --- |
| `npm run dev` | Runs API and storefront in parallel with reload |
| `npm run build` | Production build of API and storefront |
| `npm run start` | Runs both in production mode (requires a build) |
| `npm run db:generate` | Generates a Drizzle migration from the schema |
| `npm run db:migrate` | Applies pending migrations |
| `npm run db:seed` | Populates demo data and the admin user (destructive: recreates catalog) |
| `npm run db:reset` | Deletes the local SQLite file — then re-run migrate and seed |
| `npm run typecheck` | Type-checks the whole monorepo |
| `npm run setup` | `install` + `migrate` + `seed` in one go |

After editing `packages/db/src/schema.ts`, run `npm run db:generate` then
`npm run db:migrate`. Never hand-edit the generated SQL in `packages/db/drizzle/`.

## Customizing

- **Colors and theme tokens**: the `@theme` block in
  `apps/storefront/src/styles/global.css`. Tailwind v4 keeps design tokens in CSS rather
  than a config file, so this is the single place to rebrand for a new client.
- **Shipping rules**: `calcShippingCents`, `FREE_SHIPPING_THRESHOLD_CENTS` and
  `FLAT_SHIPPING_CENTS` in `packages/shared/src/format.ts`. That file holds pure helpers
  with no Zod, so browser-side scripts can import it too.
- **Business rules shared by both sides** belong in `@ecom/shared`, never duplicated.

### Translating the UI

UI copy is inline in the Astro components and in the API error messages, with no i18n
layer — a deliberate omission for a single-market starter. To translate, grep the Astro
templates under `apps/storefront/src` and the message strings in `apps/api/src/errors.ts`
and the route handlers. Adding a real i18n layer is a reasonable fork.

## Deployment

See [`docs/DEPLOY.md`](docs/DEPLOY.md) for a full VPS walkthrough: build, production
environment variables, systemd units, a Caddy reverse proxy with TLS, Stripe webhooks in
production, database backups and a pre-launch checklist.

Docker images for both apps live in `docker/`, with a `docker-compose.yml` at the root.
Remember that the storefront build needs `PUBLIC_SITE_URL` as a build arg.

## Moving from SQLite to Postgres

When the project outgrows what SQLite handles comfortably:

1. Replace `better-sqlite3` + `drizzle-orm/better-sqlite3` with `pg` (or `postgres`) +
   `drizzle-orm/node-postgres` in `packages/db`.
2. Change `dialect: 'sqlite'` to `dialect: 'postgresql'` in
   `packages/db/drizzle.config.ts` and point `dbCredentials` at a connection string.
3. Regenerate migrations from scratch with `npm run db:generate` — SQL syntax differs
   between the dialects, this is not a straight port.
4. Review SQLite-specific column types in the schema (for example
   `text(..., { mode: 'json' })` maps to a native `jsonb`) and adjust
   `packages/db/src/index.ts`: no more pragmas or on-disk file, just a connection pool.

## What this does not include

To stay a readable, extensible starter, this project deliberately leaves out:
multi-language and multi-currency, returns and RMA, advanced inventory (multi-warehouse,
stock reservations), transactional email (order confirmation, shipping), product reviews,
and discounts or coupons. All of them are reasonable additions on top of the existing
schema, when you actually need them.

## Contributing

Issues and pull requests are welcome. Before opening a PR:

- run `npm run typecheck` — CI runs it, plus a production build, a migrate-and-seed job
  and a project-conventions check;
- keep payload contracts in `packages/shared/src/index.ts` and update **both** sides;
- update `docs/API.md` in the same commit whenever you add or change an endpoint;
- keep amounts as integer cents, and format them only with `formatPrice()`;
- keep UI copy and error messages in Italian, to stay consistent with the rest of the
  interface.

The conventions the CI enforces are documented in [`CLAUDE.md`](CLAUDE.md), which is also
the file to read if you drive this repo with an AI coding agent.

## License

[MIT](LICENSE) © Q4 Studio
