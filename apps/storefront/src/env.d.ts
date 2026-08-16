/// <reference path="../.astro/types.d.ts" />
/// <reference types="astro/client" />

declare namespace App {
  interface Locals {
    /** Id del carrello letto dal cookie `cart_id`, se presente. */
    cartId: string | undefined
    /** Carrello corrente già risolto dal middleware (null se assente o API irraggiungibile). */
    cart: import('@ecom/shared').Cart | null
  }
}

interface ImportMetaEnv {
  readonly API_URL?: string
  readonly PUBLIC_API_URL?: string
  readonly PUBLIC_SITE_NAME?: string
  readonly PUBLIC_SITE_URL?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
