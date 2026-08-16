/** Helper condivisi dalle rotte `pages/api/*` per risposte JSON coerenti. */

export function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

export function errorResponse(status: number, code: string, message: string): Response {
  return jsonResponse({ error: { code, message } }, status)
}
