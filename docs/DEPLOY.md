# Deploy su VPS

Guida sintetica per portare in produzione API + storefront su un singolo VPS con Docker.

## Requisiti

- VPS Linux con Docker Engine e plugin Docker Compose (v2) installati.
- Dominio puntato all'IP del VPS (record A), per storefront e per l'endpoint webhook Stripe.
- Almeno 1 vCPU / 1 GB RAM: lo stack è leggero (SQLite, nessun database esterno).
- `git` sul VPS per clonare il repository (o un pacchetto già buildato).

## Build

```bash
git clone <repo-url> /opt/ecom-custom
cd /opt/ecom-custom
cp .env.example .env
# compila .env con i valori di produzione (vedi sotto)
docker compose build
```

## Variabili d'ambiente di produzione

Oltre a quelle già in `.env.example`, in produzione imposta:

```bash
NODE_ENV=production
PUBLIC_SITE_URL=https://tuodominio.it
PUBLIC_API_URL=https://tuodominio.it/api
SESSION_SECRET=$(node -e "console.log(require('crypto').randomBytes(32).toString('hex'))")
```

- `PUBLIC_SITE_URL` deve essere l'URL pubblico reale: Stripe lo usa per `success_url` /
  `cancel_url` dopo il checkout. È **obbligatoria** in produzione: `astro.config.mjs`
  interrompe il build dell'immagine storefront se manca o non è un URL valido.
  Come `PUBLIC_API_URL` (vedi sotto), `docker compose build` la inietta come build arg
  (vedi `docker-compose.yml`): se la cambi dopo un primo deploy, `docker compose up -d`
  da solo non basta, serve un rebuild
  (`docker compose build storefront && docker compose up -d storefront`).
- `PUBLIC_API_URL` è una variabile Astro/Vite: `docker compose build` la inietta come
  build arg nell'immagine storefront (vedi `docker-compose.yml`) perché il bundle
  browser la inglobba in fase di build, non a runtime. Se la cambi dopo un primo
  deploy, `docker compose up -d` da solo non basta: serve un rebuild
  (`docker compose build storefront && docker compose up -d storefront`).
- `SESSION_SECRET` va generato una volta e mai più rigenerato (rigenerarlo invalida tutte
  le sessioni admin attive) — il comando sopra ne stampa uno a 64 caratteri esadecimali.
- Le chiavi Stripe (`STRIPE_SECRET_KEY`, `STRIPE_PUBLISHABLE_KEY`, `STRIPE_WEBHOOK_SECRET`)
  vanno sostituite con quelle **live**, non le `sk_test_...` / `pk_test_...` di sviluppo.

## Avvio

```bash
docker compose up -d
```

Il servizio `api` applica le migrazioni (`npm run db:migrate`) ad ogni avvio prima di
partire — vedi il `command` in `docker-compose.yml` — quindi non serve un passo manuale
separato. Il file SQLite vive nel volume nominato `db-data`, che sopravvive a
`docker compose down` / rebuild delle immagini (non a `docker compose down -v`).

## Reverse proxy con TLS (Caddy)

Caddy è la scelta più semplice: ottiene e rinnova i certificati Let's Encrypt da solo.

```
# /etc/caddy/Caddyfile
tuodominio.it {
    reverse_proxy /api/* localhost:3001
    reverse_proxy localhost:4321
}
```

Alternativa Nginx (con certificati già emessi via certbot):

```nginx
server {
    listen 443 ssl http2;
    server_name tuodominio.it;

    ssl_certificate     /etc/letsencrypt/live/tuodominio.it/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/tuodominio.it/privkey.pem;

    location /api/ {
        proxy_pass http://127.0.0.1:3001;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    location / {
        proxy_pass http://127.0.0.1:4321;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}

server {
    listen 80;
    server_name tuodominio.it;
    return 301 https://$host$request_uri;
}
```

## Webhook Stripe in produzione

Nel [dashboard Stripe](https://dashboard.stripe.com/webhooks) (modalità **Live**), aggiungi
un endpoint:

- URL: `https://tuodominio.it/api/webhooks/stripe`
- Evento minimo necessario: `checkout.session.completed`

Copia il `whsec_...` generato per quell'endpoint in `STRIPE_WEBHOOK_SECRET` sul VPS e
riavvia il servizio `api` (`docker compose up -d api`).

## Backup del database

SQLite vive in un unico file: backuparlo è semplice, ma va fatto in modo consistente
(non copiare il file `.db` a caldo senza precauzioni, per via del WAL).

**Opzione A — `sqlite3 .backup` (consigliata, atomica)**

L'immagine `api` include la CLI `sqlite3` (pacchetto Alpine `sqlite`) proprio per
questo comando.

```bash
docker compose exec api sh -c \
  "sqlite3 /app/data/ecom.db \".backup /app/data/backup-$(date +%F).db\""
docker cp $(docker compose ps -q api):/app/data/backup-$(date +%F).db ./backup-$(date +%F).db
```

**Opzione B — copia del volume** (con servizio fermo, per evitare scritture concorrenti)

```bash
docker compose stop api
docker run --rm -v ecom-custom_db-data:/data -v "$PWD":/backup alpine \
  tar czf /backup/db-backup-$(date +%F).tar.gz -C /data .
docker compose start api
```

Programma l'opzione A in un cron giornaliero e conserva le copie fuori dal VPS
(storage esterno o object storage).

## Checklist pre-lancio

- [ ] `.env` di produzione compilato (nessun valore di esempio rimasto, es. `sk_test_xxx`)
- [ ] `SESSION_SECRET` generato ex novo, non quello di `.env.example`
- [ ] Chiavi Stripe **live** configurate e webhook live collegato e testato con un ordine reale
- [ ] `ADMIN_PASSWORD` cambiata rispetto al default `changeme123`
- [ ] `npm run db:seed` **non** eseguito in produzione con i dati demo (o eseguito una sola
      volta consapevolmente, sapendo che sovrascrive il catalogo)
- [ ] TLS attivo e redirect HTTP → HTTPS funzionante
- [ ] `PUBLIC_SITE_URL` e `PUBLIC_API_URL` puntano al dominio reale, non a `localhost`
- [ ] Backup del volume `db-data` programmato e verificato almeno una volta (restore test)
- [ ] Healthcheck dell'API verde (`docker compose ps` → `api` in stato `healthy`)
- [ ] Un ordine di prova end-to-end completato (checkout → webhook → stato `paid` in admin)
