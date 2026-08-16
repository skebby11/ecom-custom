import type { APIContext } from 'astro'
import { adminLogout, expiredSessionCookie } from '~/lib/admin-api'

/**
 * Logout via POST (form nella sidebar): chiama l'API, propaga il Set-Cookie e
 * reindirizza al login. Se l'API non risponde, il cookie locale viene comunque
 * invalidato: altrimenti l'admin resterebbe con una sessione "attiva" lato
 * browser anche a chiamata di logout fallita.
 *
 * Solo POST: un endpoint di logout raggiungibile in GET viene innescato da
 * qualunque caricamento di risorsa cross-site (es. `<img src=".../logout">`)
 * o da prefetcher/scanner di link, e `security.checkOrigin` di Astro protegge
 * solo il percorso POST.
 */
async function handleLogout({ request }: APIContext): Promise<Response> {
  let setCookies: string[]
  try {
    setCookies = await adminLogout(request)
  } catch {
    setCookies = [expiredSessionCookie()]
  }

  const headers = new Headers({ location: '/admin/login' })
  for (const cookie of setCookies) headers.append('set-cookie', cookie)
  return new Response(null, { status: 302, headers })
}

export const POST = handleLogout
