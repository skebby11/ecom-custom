import node from '@astrojs/node'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig } from 'astro/config'

const FALLBACK_SITE_URL = 'http://localhost:4321'

const isProd = process.env.NODE_ENV === 'production'

/**
 * Valida `PUBLIC_SITE_URL` una sola volta. In produzione è obbligatorio: un
 * fallback silenzioso a `localhost` significherebbe far dipendere `allowedDomains`
 * (vedi sotto) da un valore non di produzione, riaprendo la porta all'host header
 * injection che quella lista dovrebbe impedire. In sviluppo un valore mancante o
 * non valido ricade sul fallback locale con un avviso.
 */
function parseSiteUrl(value) {
  if (!value) {
    if (isProd) {
      throw new Error('[astro.config] PUBLIC_SITE_URL è obbligatorio in produzione')
    }
    return new URL(FALLBACK_SITE_URL)
  }
  let parsed
  try {
    parsed = new URL(value)
  } catch {
    if (isProd) {
      throw new Error(`[astro.config] PUBLIC_SITE_URL non è un URL valido: ${value}`)
    }
    console.warn(`[astro.config] PUBLIC_SITE_URL non è un URL valido, uso il fallback: ${value}`)
    return new URL(FALLBACK_SITE_URL)
  }
  // Il fallback di sviluppo (docker-compose.yml, un .env dimenticato) è
  // sintatticamente un URL valido: senza questo controllo il build di
  // produzione non si accorgerebbe di star per incorporare un'origine
  // locale nell'immagine storefront.
  if (isProd && (parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1')) {
    throw new Error(`[astro.config] PUBLIC_SITE_URL non può puntare a localhost in produzione: ${value}`)
  }
  return parsed
}

const parsedSiteUrl = parseSiteUrl(process.env.PUBLIC_SITE_URL)
const siteUrl = parsedSiteUrl.href

/**
 * Astro non si fida dell'header `Host` finché il dominio non è dichiarato qui.
 * Senza questa lista `Astro.url.origin` degrada a `http://localhost`, non coincide
 * più con l'header `Origin` inviato dal browser e il controllo CSRF integrato
 * rifiuta con 403 ogni POST di form: login admin, cambio stato ordine, collezioni.
 * Il valore segue `PUBLIC_SITE_URL` (già validato sopra), quindi in produzione
 * basta impostare quello.
 *
 * I pattern `localhost`/`127.0.0.1` sono ammessi solo in sviluppo: se restassero
 * validi anche in produzione, un proxy che inoltra `X-Forwarded-Host` così come
 * arriva dal client permetterebbe di forzare `Astro.url` su `localhost`,
 * aprendo la porta a cache poisoning sugli URL assoluti generati dal server.
 */
function allowedDomainsFrom({ hostname, protocol, port }) {
  return [
    ...(isProd
      ? []
      : [
          { hostname: 'localhost', protocol: 'http' },
          { hostname: '127.0.0.1', protocol: 'http' },
        ]),
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
