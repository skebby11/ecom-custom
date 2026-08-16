import node from '@astrojs/node'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig } from 'astro/config'

const siteUrl = process.env.PUBLIC_SITE_URL ?? 'http://localhost:4321'

/**
 * Astro non si fida dell'header `Host` finché il dominio non è dichiarato qui.
 * Senza questa lista `Astro.url.origin` degrada a `http://localhost`, non coincide
 * più con l'header `Origin` inviato dal browser e il controllo CSRF integrato
 * rifiuta con 403 ogni POST di form: login admin, cambio stato ordine, collezioni.
 * Il valore segue `PUBLIC_SITE_URL`, quindi in produzione basta impostare quello.
 */
function allowedDomainsFrom(url) {
  const patterns = [
    // sempre presenti: sviluppo locale su qualunque porta
    { hostname: 'localhost', protocol: 'http' },
    { hostname: '127.0.0.1', protocol: 'http' },
  ]

  try {
    const { hostname, protocol, port } = new URL(url)
    patterns.push({
      hostname,
      protocol: protocol.replace(':', ''),
      ...(port ? { port } : {}),
    })
  } catch {
    console.warn(`[astro.config] PUBLIC_SITE_URL non è un URL valido: ${url}`)
  }

  return patterns
}

export default defineConfig({
  output: 'server',
  adapter: node({ mode: 'standalone' }),
  site: siteUrl,
  server: { port: Number(process.env.PORT ?? 4321), host: true },
  security: {
    allowedDomains: allowedDomainsFrom(siteUrl),
  },
  vite: {
    plugins: [tailwindcss()],
  },
  devToolbar: { enabled: false },
})
