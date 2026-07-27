# PenRunner — Deploy staging sui domini reali

Obiettivo: la piattaforma provabile **da telefono e tablet, senza ambiente di sviluppo**. Cinque fronti su `penrunner.com` (Cloudflare DNS), con **NOINDEX ovunque finché non si dichiara il lancio**.

## Architettura

| Fronte | Dominio | Dove gira |
|---|---|---|
| API (Fastify + tRPC + SSE + PDF) | `api.penrunner.com` | **Railway** (Dockerfile: `apps/api/Dockerfile`, build context = root del repo) |
| Portale pubblico (Next SSR) | `penrunner.com` (+ `www`) | **Vercel** (root directory: `apps/web`) |
| App organizzatore | `organizer.penrunner.com` | **Cloudflare Pages** |
| App scribe/giudice | `scribe.penrunner.com` | **Cloudflare Pages** |
| App scuderia | `stable.penrunner.com` | **Cloudflare Pages** |
| Database | — | **Neon** (Postgres gestito, backup inclusi) |
| Email | — | **Resend** via SMTP (`SmtpMailer`, `MAILER=smtp`) |

Le migrazioni girano **al boot dell'API** (CMD del Dockerfile): un deploy = schema allineato.

## Account da creare (titolare)

1. **Neon** — progetto Postgres; serve la *connection string* (`postgres://…`).
2. **Railway** — progetto collegato al repo GitHub (service dal Dockerfile `apps/api/Dockerfile`).
3. **Resend** — dominio `penrunner.com` verificato (Resend fornisce i record DNS da inserire su Cloudflare); serve una *API key*.
4. **Vercel** — progetto collegato al repo, root directory `apps/web`.
5. **Cloudflare** — esiste già: Pages (3 progetti) + i record DNS sotto.

**Consegna segreti:** preferenza — inseriti direttamente **nei pannelli di ciascun servizio** (Railway/Vercel/Pages hanno le loro sezioni "Variables"); a me serve solo conferma di quali sono impostati, mai i valori in chat. Se serve che li verifichi io: file `.env` condiviso una tantum per canale privato, mai committato.

## Variabili per servizio

**Railway (API):**
```
DATABASE_URL   = <Neon connection string>
CORS_ORIGINS   = https://penrunner.com,https://www.penrunner.com,https://organizer.penrunner.com,https://scribe.penrunner.com,https://stable.penrunner.com
MAILER         = smtp
SMTP_HOST      = smtp.resend.com
SMTP_PORT      = 465
SMTP_USER      = resend
SMTP_PASS      = <Resend API key>
MAIL_FROM      = PenRunner <noreply@penrunner.com>
PORT           = 3001
```

**Vercel (portale):**
```
API_URL             = https://api.penrunner.com   (fetch server-side, SSR)
NEXT_PUBLIC_API_URL = https://api.penrunner.com   (SSE/polling dal browser)
PUBLIC_INDEXING     = false      ← al LANCIO: true (via il noindex, SEO pulita)
```

**Cloudflare Pages (3 progetti, build: `pnpm --filter @penrunner/<app> build`, output `apps/<app>/dist`):**
```
organizer:  VITE_API_URL=https://api.penrunner.com  VITE_SCRIBE_URL=https://scribe.penrunner.com
scribe:     VITE_API_URL=https://api.penrunner.com
stable:     VITE_API_URL=https://api.penrunner.com  VITE_PORTAL_URL=https://penrunner.com
```
Le SPA sono **sempre noindex** (meta + robots.txt): sono strumenti di lavoro, non contenuto — resta così anche dopo il lancio.

## Record DNS su Cloudflare

| Tipo | Nome | Valore | Note |
|---|---|---|---|
| CNAME | `api` | `<service>.up.railway.app` | dal pannello Railway → Custom Domain |
| CNAME | `@` e `www` | `cname.vercel-dns.com` | dal pannello Vercel → Domains |
| CNAME | `organizer` | `<progetto>.pages.dev` | Pages → Custom Domain |
| CNAME | `scribe` | `<progetto>.pages.dev` | idem |
| CNAME | `stable` | `<progetto>.pages.dev` | idem |
| TXT/CNAME | *(da Resend)* | record SPF + DKIM che Resend mostra alla verifica del dominio | senza, le email non partono |

## Sequenza di collaudo staging

1. **Seed**: da locale, `DATABASE_URL=<neon> pnpm db:seed` (catalogo 2026). *(Le migrazioni le fa il boot dell'API.)*
2. **Pilota sui domini veri**: `API_URL=https://api.penrunner.com pnpm --filter @penrunner/api pilot:e2e` — ciclo completo, MA il passo verifica-email ora passa da caselle vere: si usa un'email reale o il pannello Resend (in staging il log Railway non contiene più i token: `MAILER=smtp`).
3. **Playwright sui domini reali** (organizer + stable, preflight CORS di produzione).
4. **Giro umano dal telefono**: la ricetta end-to-end su URL reali — registrazione con email vera, evento, iscrizioni, scribe dal tablet, risultati live.
5. **Collaudi da sempre rimandati**: two-device scribe (conflitto), eviction iOS/PWA — lo staging è il posto giusto.

## Lavoro noto dichiarato

- **RESET a database pulito prima del primo evento vero**: il seed/collaudo staging va azzerato (truncate dei dati di prova, il catalogo resta) — da fare, tracciato qui.
- Il **Dockerfile non è build-verificato in sandbox** (il proxy di sviluppo blocca i registry): la prima build su Railway è la verifica; gli script invocati sono controllati.
- Multi-istanza API (liveBus SSE e rate-limit sono in-process): l'assunzione MVP è UNA istanza Railway — dichiarata dallo step 6.
- Al **lancio**: `PUBLIC_INDEXING=true` sul portale (Vercel) e rideploy — l'unico flag da girare.
