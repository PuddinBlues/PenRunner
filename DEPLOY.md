# PenRunner — Deploy staging sui domini reali

Obiettivo: la piattaforma provabile **da telefono e tablet, senza ambiente di sviluppo**. Cinque fronti su `penrunner.com` (Cloudflare DNS), con **NOINDEX ovunque finché non si dichiara il lancio**.

## Architettura

| Fronte | Dominio | Dove gira |
|---|---|---|
| API (Fastify + tRPC + SSE + PDF) | `api.penrunner.com` | **Railway** (Dockerfile: `apps/api/Dockerfile`, build context = root del repo) |
| Portale pubblico (Next SSR) | `penrunner.com` (+ `www`) | **Vercel** (root directory: `apps/web`) |
| App organizzatore | `organizer.penrunner.com` | **Cloudflare Workers** (static assets, `apps/organizer/wrangler.jsonc`) |
| App scribe/giudice | `scribe.penrunner.com` | **Cloudflare Workers** (static assets, `apps/scribe/wrangler.jsonc`) |
| App scuderia | `stable.penrunner.com` | **Cloudflare Workers** (static assets, `apps/stable/wrangler.jsonc`) |
| Database | — | **Neon** (Postgres gestito, backup inclusi) |
| Email | — | **Resend** via API HTTP (`ResendMailer`, `MAILER=resend` — Railway blocca l'egress SMTP) |

*(Nota: Cloudflare ha dismesso la creazione di nuovi progetti Pages — le SPA sono Worker con static assets: stesso risultato, config `wrangler.jsonc` per app con fallback `single-page-application` per il routing client-side.)*

Le migrazioni girano **al boot dell'API** (CMD del Dockerfile): un deploy = schema allineato.

## Account da creare (titolare)

1. **Neon** — progetto Postgres; serve la *connection string* (`postgres://…`).
2. **Railway** — progetto collegato al repo GitHub (service dal Dockerfile `apps/api/Dockerfile`).
3. **Resend** — dominio `penrunner.com` verificato (Resend fornisce i record DNS da inserire su Cloudflare); serve una *API key*.
4. **Vercel** — progetto collegato al repo, root directory `apps/web`.
5. **Cloudflare** — esiste già: 3 progetti **Workers** ("Import from Git", form sotto) + i record DNS sotto.

**Consegna segreti:** preferenza — inseriti direttamente **nei pannelli di ciascun servizio** (Railway/Vercel/Pages hanno le loro sezioni "Variables"); a me serve solo conferma di quali sono impostati, mai i valori in chat. Se serve che li verifichi io: file `.env` condiviso una tantum per canale privato, mai committato.

## Variabili per servizio

**Railway (API):**
```
DATABASE_URL    = <Neon connection string>
CORS_ORIGINS    = https://penrunner.com,https://www.penrunner.com,https://organizer.penrunner.com,https://scribe.penrunner.com,https://stable.penrunner.com
MAILER          = resend
RESEND_API_KEY  = <Resend API key>
MAIL_FROM       = PenRunner <noreply@penrunner.com>
PORT            = 3001
ORGANIZER_URL   = https://organizer.penrunner.com
STABLE_URL      = https://stable.penrunner.com
SCRIBE_URL      = https://scribe.penrunner.com
LOGO_URL        = (opzionale: URL pubblico del logo per le email; assente = wordmark testuale)
```
*(ORGANIZER_URL/STABLE_URL/SCRIBE_URL: base dei link nelle email — verifica `?verify=`, reset `?reset=`, invito giudice `?token=`. Il client manda solo un enum `organizer|stable`: l'URL lo decide il server da queste env, niente open redirect. Senza di esse i link puntano a localhost.)*
*(MAILER=resend usa l'API HTTP di Resend su porta 443 — reperto del collaudo staging: Railway blocca l'egress SMTP e l'invio si appendeva. Il modo `smtp` resta disponibile e provider-neutro per host che consentono l'egress: `SMTP_HOST/PORT/USER/PASS` + `MAIL_FROM`, ora con timeout 10 s ed errore parlante.)*

**Vercel (portale):**
```
API_URL             = https://api.penrunner.com   (fetch server-side, SSR)
NEXT_PUBLIC_API_URL = https://api.penrunner.com   (SSE/polling dal browser)
PUBLIC_INDEXING     = false      ← al LANCIO: true (via il noindex, SEO pulita)
```

**Cloudflare Workers Builds (3 progetti "Import from Git" — valori da incollare nei form):**

| Campo | organizer | scribe | stable |
|---|---|---|---|
| Root directory | `apps/organizer` | `apps/scribe` | `apps/stable` |
| Build command | `pnpm --filter @penrunner/organizer build` | `pnpm --filter @penrunner/scribe build` | `pnpm --filter @penrunner/stable build` |
| Deploy command | `npx wrangler deploy` | `npx wrangler deploy` | `npx wrangler deploy` |

Il `wrangler.jsonc` di ciascuna app viene trovato da solo grazie alla root directory (niente `--config`); `wrangler@^4` è devDependency di root del repo, quindi `npx` usa la versione lockata. L'install lo rileva Workers Builds dal lockfile pnpm; se il form espone "Install command": `pnpm install --frozen-lockfile`.

*(BR-83: lo stamp di versione nelle SPA usa `WORKERS_CI_COMMIT_SHA`, fornita da Workers Builds da sola — niente da configurare. In assenza, fallback a `git rev-parse` o "dev".)*

**Build variables** (per progetto — sono BUILD-time di Vite, mai nel wrangler config):
```
organizer:  VITE_API_URL=https://api.penrunner.com  VITE_SCRIBE_URL=https://scribe.penrunner.com
scribe:     VITE_API_URL=https://api.penrunner.com
stable:     VITE_API_URL=https://api.penrunner.com  VITE_PORTAL_URL=https://penrunner.com
```
Le SPA sono **sempre noindex** (meta + robots.txt): sono strumenti di lavoro, non contenuto — resta così anche dopo il lancio (e copre anche gli URL `*.workers.dev` di anteprima).

## Record DNS su Cloudflare

| Tipo | Nome | Valore | Note |
|---|---|---|---|
| CNAME | `api` | `<service>.up.railway.app` | dal pannello Railway → Custom Domain |
| CNAME | `@` e `www` | `cname.vercel-dns.com` | dal pannello Vercel → Domains |
| — | `organizer` / `scribe` / `stable` | *(automatici)* | per i Worker NON si creano a mano: Worker → **Settings → Domains & Routes → Custom domain** — il record DNS lo crea Cloudflare |
| TXT/CNAME | *(da Resend)* | record SPF + DKIM che Resend mostra alla verifica del dominio | senza, le email non partono |

## Sequenza di collaudo staging

1. **Seed**: da locale, `DATABASE_URL=<neon> pnpm db:seed` (catalogo 2026). *(Le migrazioni le fa il boot dell'API.)*
2. **Pilota sui domini veri**: `API_URL=https://api.penrunner.com pnpm --filter @penrunner/api pilot:e2e` — ciclo completo, MA il passo verifica-email ora passa da caselle vere: si usa un'email reale o il pannello Resend (in staging il log Railway non contiene più i token: `MAILER=resend`).
3. **Playwright sui domini reali** (organizer + stable, preflight CORS di produzione).
4. **Giro umano dal telefono**: la ricetta end-to-end su URL reali — registrazione con email vera, evento, iscrizioni, scribe dal tablet, risultati live.
5. **Collaudi da sempre rimandati**: two-device scribe (conflitto), eviction iOS/PWA — lo staging è il posto giusto.

## Lavoro noto dichiarato

- **RESET a database pulito prima del primo evento vero**: il seed/collaudo staging va azzerato (truncate dei dati di prova, il catalogo resta) — da fare, tracciato qui.
- Il **Dockerfile non è build-verificato in sandbox** (il proxy di sviluppo blocca i registry): la prima build su Railway è la verifica; gli script invocati sono controllati.
- Multi-istanza API (liveBus SSE e rate-limit sono in-process): l'assunzione MVP è UNA istanza Railway — dichiarata dallo step 6.
- Al **lancio**: `PUBLIC_INDEXING=true` sul portale (Vercel) e rideploy — l'unico flag da girare.
