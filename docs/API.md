# Contratto API — `@ecom/api`

Base URL: `http://localhost:3001`, tutte le rotte sotto il prefisso `/api`.
Tutti i payload sono JSON. Tutti gli importi sono **interi in centesimi**.
I tipi TypeScript e gli schemi Zod di ogni payload vivono in `packages/shared/src/index.ts`
e sono la fonte di verità: server e storefront importano gli stessi.

## Forma degli errori

Ogni errore risponde con questo corpo (`apiErrorSchema`):

```json
{ "error": { "code": "NOT_FOUND", "message": "Prodotto non trovato", "details": null } }
```

Codici usati: `VALIDATION_ERROR` (400), `UNAUTHORIZED` (401), `NOT_FOUND` (404),
`OUT_OF_STOCK` (409), `CART_EMPTY` (409), `INTERNAL_ERROR` (500).

---

## Pubbliche — catalogo

| Metodo | Path | Query / Body | Risposta |
| --- | --- | --- | --- |
| GET | `/api/products` | `productQuerySchema` (`q`, `collection`, `sort`, `page`, `limit`, `minPrice`, `maxPrice`, `inStock`) | `Paginated<ProductListItem>` |
| GET | `/api/products/:slug` | — | `ProductDetail` |
| GET | `/api/collections` | — | `Collection[]` (con `productCount`) |
| GET | `/api/collections/:slug` | — | `Collection` |
| GET | `/api/health` | — | `{ ok: true, db: true }` |

Solo i prodotti con `status = 'active'` sono visibili dalle rotte pubbliche.
`priceCents` di un `ProductListItem` è il **minimo** tra le varianti; `inStock` è vero
se almeno una variante ha `stock > 0`.

## Pubbliche — carrello

| Metodo | Path | Body | Risposta |
| --- | --- | --- | --- |
| POST | `/api/cart` | — | `Cart` (nuovo carrello vuoto, id uuid) |
| GET | `/api/cart/:id` | — | `Cart` |
| POST | `/api/cart/:id/items` | `addToCartSchema` `{ variantId, qty }` | `Cart` |
| PATCH | `/api/cart/:id/items/:itemId` | `updateCartItemSchema` `{ qty }` (`qty: 0` rimuove) | `Cart` |
| DELETE | `/api/cart/:id/items/:itemId` | — | `Cart` |

Aggiungere una variante già presente **somma** le quantità. La quantità è limitata
allo stock disponibile: se eccede, l'API risponde `409 OUT_OF_STOCK`.
`shippingCents` è calcolato da `calcShippingCents()` in `@ecom/shared`.

## Pubbliche — checkout e ordini

| Metodo | Path | Body | Risposta |
| --- | --- | --- | --- |
| POST | `/api/checkout/session` | `checkoutSessionSchema` `{ cartId, email, shippingAddress? }` | `{ url, orderId, token }` |
| POST | `/api/webhooks/stripe` | raw body Stripe | `{ received: true }` |
| GET | `/api/orders/:id?token=…` | — | `Order` |

`POST /api/checkout/session` crea un ordine `pending` con snapshot delle righe, poi apre
una Stripe Checkout Session (mode `payment`) con `success_url` = `${PUBLIC_SITE_URL}/ordine/{orderId}?token={token}`
e `cancel_url` = `${PUBLIC_SITE_URL}/carrello`.
Il webhook `checkout.session.completed` porta l'ordine a `paid`, scala lo stock e svuota il carrello.
Gli eventi sono resi idempotenti tramite la tabella `webhook_events`.
Se `STRIPE_SECRET_KEY` non è configurata l'API risponde `503 STRIPE_NOT_CONFIGURED`
con un messaggio esplicito: tutto il resto del sito continua a funzionare.

## Admin

Autenticazione a cookie di sessione `admin_session`: `HttpOnly`, `SameSite=Lax`, `Path=/`,
scadenza 7 giorni e `Secure` attivo quando `NODE_ENV=production`. Fuori da localhost il cookie
va servito solo su HTTPS: senza `Secure` una sessione amministrativa viaggia anche in chiaro.
Tutte le rotte `/api/admin/*` tranne `login` richiedono la sessione, altrimenti `401`.

| Metodo | Path | Body | Risposta |
| --- | --- | --- | --- |
| POST | `/api/admin/login` | `loginSchema` | `{ user }` + Set-Cookie |
| POST | `/api/admin/logout` | — | `{ ok: true }` |
| GET | `/api/admin/me` | — | `{ user }` |
| GET | `/api/admin/stats` | — | `{ products, orders, revenueCents, pendingOrders, lowStock[] }` |
| GET | `/api/admin/products` | `?q&page&limit&status` | `Paginated<AdminProductRow>` |
| GET | `/api/admin/products/:id` | — | `ProductDetail` (include bozze) |
| POST | `/api/admin/products` | `adminProductInputSchema` | `ProductDetail` |
| PUT | `/api/admin/products/:id` | `adminProductInputSchema` | `ProductDetail` |
| DELETE | `/api/admin/products/:id` | — | `{ ok: true }` |
| GET | `/api/admin/collections` | — | `Collection[]` |
| POST | `/api/admin/collections` | `{ slug, title, description?, imageUrl? }` | `Collection` |
| PUT | `/api/admin/collections/:id` | idem | `Collection` |
| DELETE | `/api/admin/collections/:id` | — | `{ ok: true }` |
| GET | `/api/admin/orders` | `?status&page&limit` | `Paginated<Order>` |
| GET | `/api/admin/orders/:id` | — | `Order` |
| PATCH | `/api/admin/orders/:id` | `adminOrderUpdateSchema` | `Order` |

`PUT /api/admin/products/:id` fa un replace completo di opzioni e varianti in una
transazione: le varianti con `id` esistente vengono aggiornate, quelle senza `id`
create, quelle assenti dal payload eliminate.
