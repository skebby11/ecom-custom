import node from '@astrojs/node'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig } from 'astro/config'

const FALLBACK_SITE_URL = 'http://localhost:4321'

/**
 * Valida `PUBLIC_SITE_URL` una sola volta: se non è impostato o non è un URL
 * valido, sia `site` che `allowedDomains` devono ricadere sullo stesso fallback,
 * altrimenti Astro costruirebbe `Astro.site` da un valore che il controllo CSRF
 * (vedi sotto) considera già invalido.
 */
function parseSiteUrl(value) {
  try {
    return new URL(value)
  } catch {
    console.warn(`[astro.config] PUBLIC_SITE_URL non è un URL valido, uso il fallback: ${value}`)
    return new URL(FALLBACK_SITE_URL)
  }
}

const parsedSiteUrl = parseSiteUrl(process.env.PUBLIC_SITE_URL ?? FALLBACK_SITE_URL)
const siteUrl = parsedSiteUrl.href

/**
 * Astro non si fida dell'header `Host` finché il dominio non è dichiarato qui.
 * Senza questa lista `Astro.url.origin` degrada a `http://localhost`, non coincide
 * più con l'header `Origin` inviato dal browser e il controllo CSRF integrato
 * rifiuta con 403 ogni POST di form: login admin, cambio stato ordine, collezioni.
 * Il valore segue `PUBLIC_SITE_URL` (già validato sopra), quindi in produzione
 * basta impostare quello.
 */
function allowedDomainsFrom({ hostname, protocol, port }) {
  return [
    // sempre presenti: sviluppo locale su qualunque porta
    { hostname: 'localhost', protocol: 'http' },
    { hostname: '127.0.0.1', protocol: 'http' },
    {
      hostname,
      protocol: protocol.replace(':', ''),
      ...(port ? { port } : {}),
    },
  ]
}

export default defineConfig({
  output: 'server',
  adapter: node({ mode: 'standalone' }),
  site: siteUrl,
  server: { port: Number(process.env.PORT ?? 4321), host: true },
  security: {
    allowedDomains: allowedDomainsFrom(parsedSiteUrl),
  },
  vite: {
    plugins: [tailwindcss()],
  },
  devToolbar: { enabled: false },
})
