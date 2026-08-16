# syntax=docker/dockerfile:1
#
# Immagine per @ecom/storefront (Astro 5 SSR, adapter node "standalone").
# Multi-stage: build con devDependencies, runtime solo con node_modules di
# produzione + output compilato (dist/server/entry.mjs).

# ---------------------------------------------------------------- deps -----
FROM node:22-alpine AS deps
WORKDIR /app

COPY package.json package-lock.json ./
COPY packages/shared/package.json packages/shared/package.json
COPY packages/db/package.json packages/db/package.json
COPY apps/api/package.json apps/api/package.json
COPY apps/storefront/package.json apps/storefront/package.json

RUN npm ci

# --------------------------------------------------------------- build -----
FROM deps AS build
WORKDIR /app
# PUBLIC_API_URL è una variabile Astro/Vite: viene inglobata nel bundle browser
# in fase di build, non letta a runtime. env_file da solo non basta (vedi
# docker-compose.yml e docs/DEPLOY.md): va passata come build arg.
ARG PUBLIC_API_URL
ENV PUBLIC_API_URL=$PUBLIC_API_URL
COPY . .
RUN npm run build -w @ecom/storefront

# ----------------------------------------------------------- prod-deps -----
FROM node:22-alpine AS prod-deps
WORKDIR /app

COPY package.json package-lock.json ./
COPY packages/shared/package.json packages/shared/package.json
COPY packages/db/package.json packages/db/package.json
COPY apps/api/package.json apps/api/package.json
COPY apps/storefront/package.json apps/storefront/package.json

RUN npm ci --omit=dev

# ------------------------------------------------------------- runtime -----
FROM node:22-alpine AS runtime
RUN addgroup -S app && adduser -S app -G app
WORKDIR /app
ENV NODE_ENV=production

COPY --from=prod-deps /app/node_modules ./node_modules
COPY --from=build /app/apps/storefront/dist ./apps/storefront/dist
COPY --from=build /app/apps/storefront/package.json ./apps/storefront/package.json
COPY --from=build /app/package.json ./package.json

RUN chown -R app:app /app
USER app

EXPOSE 4321
CMD ["node", "apps/storefront/dist/server/entry.mjs"]
