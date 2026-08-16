import type { FastifyReply, FastifyRequest } from 'fastify'
import { ZodError } from 'zod'

/** Errore applicativo con codice e status HTTP espliciti, nel formato `apiErrorSchema`. */
export class AppError extends Error {
  constructor(
    readonly statusCode: number,
    readonly code: string,
    message: string,
    readonly details?: unknown
  ) {
    super(message)
    this.name = 'AppError'
  }
}

export function notFound(message = 'Risorsa non trovata'): AppError {
  return new AppError(404, 'NOT_FOUND', message)
}

export function unauthorized(message = 'Autenticazione richiesta'): AppError {
  return new AppError(401, 'UNAUTHORIZED', message)
}

export function outOfStock(message: string): AppError {
  return new AppError(409, 'OUT_OF_STOCK', message)
}

export function cartEmpty(message = 'Il carrello è vuoto'): AppError {
  return new AppError(409, 'CART_EMPTY', message)
}

/** Converte un parametro id da route in intero, o 404 se non valido (niente 500 per input assurdi). */
export function parseIntParam(value: string, message = 'Parametro non valido'): number {
  const id = Number(value)
  if (!Number.isInteger(id) || id <= 0) throw notFound(message)
  return id
}

export function errorHandler(error: Error, request: FastifyRequest, reply: FastifyReply): void {
  if (error instanceof AppError) {
    reply.status(error.statusCode).send({
      error: { code: error.code, message: error.message, details: error.details ?? null },
    })
    return
  }

  if (error instanceof ZodError) {
    reply.status(400).send({
      error: { code: 'VALIDATION_ERROR', message: 'Dati non validi', details: error.flatten() },
    })
    return
  }

  // Errori generati da Fastify prima di arrivare all'handler (JSON malformato, body
  // troppo grande, content-type non supportato): portano già uno statusCode 4xx
  // corretto, che altrimenti verrebbe appiattito a 500.
  const fastifyError = error as Error & { statusCode?: number; code?: string }
  if (
    typeof fastifyError.statusCode === 'number' &&
    fastifyError.statusCode >= 400 &&
    fastifyError.statusCode < 500
  ) {
    reply.status(fastifyError.statusCode).send({
      error: {
        code: fastifyError.code ?? 'VALIDATION_ERROR',
        message: fastifyError.message,
        details: null,
      },
    })
    return
  }

  // errore imprevisto: log completo lato server, messaggio generico al client
  request.log.error(error)
  reply.status(500).send({
    error: { code: 'INTERNAL_ERROR', message: 'Errore interno del server', details: null },
  })
}
