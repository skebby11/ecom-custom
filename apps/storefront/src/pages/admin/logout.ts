import type { APIContext } from 'astro'
import { adminLogout } from '~/lib/admin-api'

/** Logout via POST (form nella sidebar): chiama l'API, propaga il Set-Cookie e reindirizza al login. */
async function handleLogout({ request }: APIContext): Promise<Response> {
  const setCookies = await adminLogout(request)
  const headers = new Headers({ location: '/admin/login' })
  for (const cookie of setCookies) headers.append('set-cookie', cookie)
  return new Response(null, { status: 302, headers })
}

export const POST = handleLogout
export const GET = handleLogout
