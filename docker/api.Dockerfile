# syntax=docker/dockerfile:1
#
# Immagine per @ecom/api (Fastify).
# L'API gira con `tsx` direttamente sui sorgenti TypeScript: non c'è build.
# Per questo l'immagine finale include anche le devDependencies (tsx, drizzle-kit)
# e l'intero monorepo sorgente, non solo un output compilato.
#
# better-sqlite3 è un modulo nativo: la fase di install richiede una toolchain
# di compilazione (python3, make, g++), presente solo nello stage `deps`.

# ---------------------------------------------------------------- deps -----
FROM node:22-alpine AS deps
RUN apk add --no-cache python3 make g++
WORKDIR /app

# Copia prima solo i manifest dei workspace: finché non cambiano le dipendenze,
# Docker riusa questo layer anche se cambia il codice applicativo.
COPY package.json package-lock.json ./
COPY packages/shared/package.json packages/shared/package.json
COPY packages/db/package.json packages/db/package.json
COPY apps/api/package.json apps/api/package.json
COPY apps/storefront/package.json apps/storefront/package.json

RUN npm ci

# ------------------------------------------------------------- runtime -----
FROM node:22-alpine AS runtime
# sqlite (CLI sqlite3) serve per il backup atomico `.backup` documentato in
# docs/DEPLOY.md — non è una dipendenza di better-sqlite3, va installata a parte.
RUN apk add --no-cache sqlite && addgroup -S app && adduser -S app -G app
WORKDIR /app
ENV NODE_ENV=production

COPY --from=deps /app/node_modules ./node_modules
COPY package.json package-lock.json ./
COPY packages ./packages
COPY apps/api ./apps/api

RUN mkdir -p data && chown -R app:app /app
USER app

EXPOSE 3001

# Le migrazioni vengono applicate dal `command` in docker-compose.yml prima
# di questo entrypoint. Per un avvio manuale (senza compose):
#   docker run ... api sh -c "npm run migrate -w @ecom/db && npm run start -w @ecom/api"
CMD ["npm", "run", "start", "-w", "@ecom/api"]
