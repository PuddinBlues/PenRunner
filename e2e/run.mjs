// ---------------------------------------------------------------------------
// FASE 2 — E2E dei funnel principali su build di produzione, 2 viewport per
// funnel. Round A: organizer desktop 1440 + scuderia mobile 390. Round B:
// organizer tablet 820 + scuderia desktop 1440 (la griglia della fase c).
// Ogni round percorre il ciclo intero: evento → iscrizione → draw pubblicato,
// con ASSERZIONI (non screenshot da guardare: qui si rompe la CI).
// Orchestrazione self-contained: migra+seed il DB, avvia API (mailer dev,
// codici letti dallo stdout) e le preview Vite, poi guida Chromium.
//   env: E2E_DATABASE_URL, PW_BROWSER (default /opt/pw-browsers/chromium)
// ---------------------------------------------------------------------------
import { spawn, execSync } from "node:child_process";
import { mkdirSync } from "node:fs";
import { chromium } from "playwright-core";

const ROOT = new URL("../", import.meta.url).pathname;
const DB =
  process.env.E2E_DATABASE_URL ??
  "postgres://penrunner:penrunner@localhost:5432/penrunner_e2e";
const BROWSER = process.env.PW_BROWSER ?? "/opt/pw-browsers/chromium";
const API = "http://localhost:3001";
const STABLE = "http://localhost:4273";
const ORGANIZER = "http://localhost:4274";
const FAIL_DIR = `${ROOT}e2e/failures/`;
const PW = "password-e2e-penrunner";

// ---- infrastruttura -------------------------------------------------------

const children = [];
let apiLog = "";

// spawn DIRETTO dei binari (pnpm run non inoltra lo stdout del figlio al
// pipe: i codici del mailer dev non arriverebbero mai al collettore);
// detached → si può uccidere l'intero process group, niente orfani sulle porte
function start(name, cmd, args, cwd, env = {}) {
  const child = spawn(cmd, args, {
    cwd,
    detached: true,
    env: { ...process.env, ...env },
    stdio: ["ignore", "pipe", "pipe"],
  });
  child.stdout.on("data", (d) => {
    if (name === "api") apiLog += d.toString();
  });
  child.stderr.on("data", (d) => {
    if (name === "api") apiLog += d.toString();
  });
  child.on("exit", (code) => {
    if (code && !shuttingDown) {
      console.error(`[e2e] processo ${name} morto (exit ${code})`);
    }
  });
  children.push(child);
  return child;
}

let shuttingDown = false;
function shutdown() {
  shuttingDown = true;
  for (const c of children) {
    try {
      process.kill(-c.pid, "SIGTERM");
    } catch {
      c.kill("SIGTERM");
    }
  }
}

/** Le porte devono essere LIBERE: un server orfano risponderebbe al posto
 *  del nostro e i codici mailer non arriverebbero mai al collettore. */
async function assertPortFree(url, label) {
  const busy = await fetch(url, { signal: AbortSignal.timeout(1500) }).then(
    () => true,
    () => false,
  );
  if (busy) {
    throw new Error(
      `porta occupata: ${url} risponde già (${label}) — chiudi il processo e rilancia`,
    );
  }
}

async function waitHttp(url, label, tries = 120) {
  for (let i = 0; i < tries; i++) {
    try {
      await fetch(url);
      return;
    } catch {
      await new Promise((r) => setTimeout(r, 1000));
    }
  }
  throw new Error(`${label} non risponde su ${url}`);
}

function psql(sqlText) {
  return execSync(`psql "${DB}" -t -A -c "${sqlText.replaceAll('"', '\\"')}"`, {
    encoding: "utf8",
  }).trim();
}

function codeFor(rawEmail) {
  const email = rawEmail.toLowerCase(); // l'API normalizza gli indirizzi
  const blocks = apiLog.split("[mail] a ").filter((b) => b.startsWith(email));
  const m = blocks.at(-1)?.match(/Codice: (\d{6})/);
  if (!m) {
    console.error(`[e2e][debug] apiLog: ${apiLog.length} chars, coda:\n${apiLog.slice(-1200)}`);
    throw new Error(`nessun codice di verifica per ${email} nello stdout API`);
  }
  return m[1];
}

// ---- helper di interazione (robusti a topnav+bottomnav duplicate) ---------

async function tap(page, label) {
  const byRole = page.getByRole("button", { name: label, exact: false });
  const n = await byRole.count();
  for (let i = 0; i < n; i++) {
    if (await byRole.nth(i).isVisible()) {
      await byRole.nth(i).click();
      await page.waitForTimeout(350);
      return;
    }
  }
  await page.getByText(label, { exact: false }).first().click();
  await page.waitForTimeout(350);
}

async function fillNth(page, nth, value, type = "text") {
  const sel =
    type === "email"
      ? "input[type=email]"
      : type === "password"
        ? "input[type=password]"
        : "input:not([type=email]):not([type=password]):not([type=date])";
  await page.locator(sel).nth(nth).fill(value);
}

async function expectText(page, text, label) {
  await page
    .getByText(text, { exact: false })
    .first()
    .waitFor({ timeout: 10_000 })
    .catch(() => {
      throw new Error(`atteso "${text}" (${label}) — non trovato in pagina`);
    });
}

async function registerVerifyLogin(page, base, email) {
  await page.goto(base);
  await page.waitForTimeout(600);
  await tap(page, "Non ho un account");
  await fillNth(page, 0, email, "email");
  await page.locator("input[type=password]").nth(0).fill(PW);
  await page.locator("input[type=password]").nth(1).fill(PW);
  await tap(page, "Registrati");
  await page.waitForTimeout(1000);
  const code = codeFor(email);
  await page.locator("input").last().fill(code);
  await tap(page, "Verifica");
  await page.waitForTimeout(800);
  await fillNth(page, 0, email, "email");
  await page.locator("input[type=password]").first().fill(PW);
  await tap(page, "Entra");
  await page.waitForTimeout(1000);
}

// ---- i funnel -------------------------------------------------------------

async function organizerCreateEvent(org, sfx) {
  const email = `e2e-org-${sfx}@example.com`;
  await registerVerifyLogin(org, ORGANIZER, email);
  await fillNth(org, 0, "Orga");
  await fillNth(org, 1, `Nizzatore ${sfx}`);
  await fillNth(org, 2, `Club E2E ${sfx}`);
  await tap(org, "Richiedi l'accesso organizzatore");
  await org.waitForTimeout(700);
  // vetting: gesto da Console (fuori funnel, come nel censimento)
  psql(
    `update organizations set vetting_status='verificata', verified_at=now() where name='Club E2E ${sfx}'`,
  );
  await org.reload();
  await org.waitForTimeout(800);
  await tap(org, "Nuovo evento");
  await fillNth(org, 0, `E2E Show ${sfx}`);
  await fillNth(org, 1, "Arena E2E");
  // date SEMPRE nel futuro: con date fisse il cut-off BR-90 renderebbe
  // rossa la CI a orologeria
  await org.locator("input[type=date]").nth(0).fill(futureDate(45));
  await org.locator("input[type=date]").nth(1).fill(futureDate(46));
  await tap(org, "Continua");
  await tap(org, "Aggiungi classe");
  await tap(org, "Continua");
  // passo Ufficiali di gara (B1/A4): nel funnel base si salta con Continua
  await tap(org, "Continua");
  await tap(org, "Fine: vai all'evento");
  await org.waitForTimeout(700);
  await tap(org, "Passa a: Annunciato");
  await tap(org, "Conferma");
  await tap(org, "Passa a: Iscrizioni aperte");
  await tap(org, "Conferma");
  await expectText(org, "scrizioni aperte", "evento a iscrizioni aperte");
}

async function stableEnroll(st, sfx, desktop) {
  const email = `e2e-stable-${sfx}@example.com`;
  await registerVerifyLogin(st, STABLE, email);
  await fillNth(st, 0, "Paola");
  await fillNth(st, 1, `Referente ${sfx}`);
  await fillNth(st, 2, `Scuderia E2E ${sfx}`);
  await tap(st, "Crea la scuderia");
  await st.waitForTimeout(800);
  // roster: un cavaliere e un cavallo
  await tap(st, "Roster");
  await st.waitForTimeout(500);
  await fillNth(st, 0, "Giulia");
  await fillNth(st, 1, "De Marchi");
  await st.locator("input[type=email]").first().fill(`giulia-${sfx}@example.com`);
  await tap(st, "Aggiungi cavaliere");
  await st.waitForTimeout(600);
  await fillNth(st, 2, `Smart Dunit ${sfx}`);
  await fillNth(st, 3, `38027199900${String(Math.abs(hash(sfx)) % 10000).padStart(4, "0")}`);
  await tap(st, "Aggiungi cavallo");
  await st.waitForTimeout(600);
  // secondo cavallo: serve al riordino del draw (round desktop)
  await fillNth(st, 2, `Gun Smart ${sfx}`);
  await fillNth(st, 3, `38027199901${String(Math.abs(hash(sfx)) % 10000).padStart(4, "0")}`);
  await tap(st, "Aggiungi cavallo");
  await st.waitForTimeout(600);
  // iscrizione
  await tap(st, "Iscrivi");
  await st.waitForTimeout(600);
  await tap(st, `E2E Show ${sfx}`);
  await st.waitForTimeout(800);
  if (desktop) {
    // griglia fase (c): riga → "+ classe" → voce di menu → conferma dal riepilogo
    if ((await st.locator(".egrid-row").count()) === 0) {
      await tap(st, "Aggiungi binomio");
    }
    await st.locator(".class-add").first().click();
    await st.waitForTimeout(300);
    await st.locator(".class-menu button:not([disabled])").first().click();
    await st.waitForTimeout(400);
    // secondo binomio (per il riordino del draw): riga nuova, secondo cavallo
    await tap(st, "Aggiungi binomio");
    const row2 = st.locator(".egrid-row").nth(1);
    await row2.locator("select").first().selectOption({ label: `Gun Smart ${sfx}` });
    await st.waitForTimeout(200);
    await row2.locator(".class-add").click();
    await st.waitForTimeout(300);
    await st.locator(".class-menu button:not([disabled])").first().click();
    await st.waitForTimeout(400);
    await tap(st, "Conferma");
  } else {
    // mobile: chip di classe → continua → conferma
    await st.locator(".chip").first().click();
    await st.waitForTimeout(400);
    await tap(st, "Continua");
    await st.waitForTimeout(400);
    await tap(st, "Conferma iscrizione");
  }
  await st.waitForTimeout(1500);
  // le mie iscrizioni: il binomio confermato è visibile
  await tap(st, "Iscrizioni");
  await st.waitForTimeout(800);
  await expectText(st, `Smart Dunit ${sfx}`, "binomio nelle mie iscrizioni");
}

async function organizerDraw(org, sfx, withReorder) {
  await org.reload();
  await org.waitForTimeout(800);
  await tap(org, `E2E Show ${sfx}`);
  await org.waitForTimeout(600);
  // B3: la cavaliera è senza tesseramenti → binomio flaggato in "Controlli";
  // un tocco avvisa la scuderia via email (verificata nello stdout API)
  await tap(org, "Controlli");
  await org.waitForTimeout(700);
  await expectText(org, `Smart Dunit ${sfx}`, "binomio flaggato nei controlli");
  await tap(org, "Avvisa la scuderia");
  await org.waitForTimeout(900);
  if (!apiLog.includes(`Controlli sull'iscrizione · Smart Dunit ${sfx}`)) {
    throw new Error("email 'avvisa la scuderia' non trovata nello stdout API");
  }
  await tap(org, "Classi");
  await tap(org, "Gestisci");
  await org.waitForTimeout(700);
  await tap(org, "Draw");
  await tap(org, "Genera il draw");
  await org.waitForTimeout(700);
  await tap(org, "Pubblica il draw");
  await tap(org, "Conferma");
  await org.waitForTimeout(800);
  // asserzione sul DERIVATO, non sul copy: draw numerato e run creata
  const drawn = psql(
    `select count(*) from entries e join classes c on c.id=e.class_id join events ev on ev.id=c.event_id where ev.name='E2E Show ${sfx}' and e.draw_number is not null`,
  );
  if (Number(drawn) < 1) throw new Error(`draw non pubblicato per E2E Show ${sfx}`);
  const runs = psql(
    `select count(*) from runs r join entries e on e.id=r.entry_id join classes c on c.id=e.class_id join events ev on ev.id=c.event_id where ev.name='E2E Show ${sfx}'`,
  );
  if (Number(runs) < 1) throw new Error(`nessuna run creata per E2E Show ${sfx}`);

  if (withReorder) {
    // Editor BR-91: sposta la prima riga in giù, applica → ri-pubblicazione
    // (BR-43 via di mezzo) con stamp draw_republished_at.
    await org.waitForTimeout(600);
    await org.locator("button.down").first().click();
    await org.waitForTimeout(300);
    await tap(org, "Applica ordine");
    await org.waitForTimeout(900);
    const stamped = psql(
      `select count(*) from classes c join events ev on ev.id=c.event_id where ev.name='E2E Show ${sfx}' and c.draw_republished_at is not null`,
    );
    if (Number(stamped) < 1) {
      throw new Error(`riordino senza stamp di ri-pubblicazione per E2E Show ${sfx}`);
    }
  }
}

function hash(s) {
  let h = 0;
  for (const ch of s) h = (h * 31 + ch.codePointAt(0)) | 0;
  return h;
}

function futureDate(daysFromNow) {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + daysFromNow);
  return d.toISOString().slice(0, 10);
}

async function round(browser, name, orgViewport, stableViewport, desktopGrid) {
  const sfx = `${name}${Date.now() % 100000}`;
  console.log(`\n[e2e] ROUND ${name} — organizer ${orgViewport.width}px, scuderia ${stableViewport.width}px (sfx ${sfx})`);
  const orgCtx = await browser.newContext({ viewport: orgViewport, locale: "it-IT" });
  const stCtx = await browser.newContext({ viewport: stableViewport, locale: "it-IT" });
  const org = await orgCtx.newPage();
  const st = await stCtx.newPage();
  try {
    await organizerCreateEvent(org, sfx);
    console.log(`[e2e]   organizer: evento aperto ✓`);
    await stableEnroll(st, sfx, desktopGrid);
    console.log(`[e2e]   scuderia: binomio confermato ✓`);
    await organizerDraw(org, sfx, desktopGrid);
    console.log(
      `[e2e]   organizer: draw pubblicato + run create${desktopGrid ? " + riordino ri-pubblicato" : ""} ✓`,
    );
  } catch (err) {
    mkdirSync(FAIL_DIR, { recursive: true });
    await org.screenshot({ path: `${FAIL_DIR}${name}-organizer.png`, fullPage: true }).catch(() => {});
    await st.screenshot({ path: `${FAIL_DIR}${name}-stable.png`, fullPage: true }).catch(() => {});
    throw err;
  } finally {
    await orgCtx.close();
    await stCtx.close();
  }
}

// ---- main -----------------------------------------------------------------

try {
  // DB pulito (best-effort: in CI il database del service è già vergine)
  try {
    const admin = DB.replace(/\/[^/]+$/, "/postgres");
    const dbName = DB.split("/").pop();
    execSync(`psql "${admin}" -c "drop database if exists ${dbName}"`, { stdio: "ignore" });
    execSync(`psql "${admin}" -c "create database ${dbName}"`, { stdio: "ignore" });
  } catch {
    console.log("[e2e] reset DB saltato (ok su service CI vergine)");
  }
  console.log("[e2e] migrate + seed…");
  execSync(`pnpm --filter @penrunner/db migrate && pnpm --filter @penrunner/db seed`, {
    cwd: ROOT,
    env: { ...process.env, DATABASE_URL: DB },
    stdio: "inherit",
  });

  console.log("[e2e] avvio API e preview…");
  await assertPortFree(`${API}/health`, "API");
  await assertPortFree(STABLE, "preview stable");
  await assertPortFree(ORGANIZER, "preview organizer");
  start("api", `${ROOT}apps/api/node_modules/.bin/tsx`, ["src/server.ts"], `${ROOT}apps/api`, {
    DATABASE_URL: DB,
    MAILER: "dev",
    PORT: "3001",
    CORS_ORIGINS: `${STABLE},${ORGANIZER}`,
  });
  start("stable", `${ROOT}apps/stable/node_modules/.bin/vite`, ["preview", "--port", "4273", "--strictPort"], `${ROOT}apps/stable`);
  start("organizer", `${ROOT}apps/organizer/node_modules/.bin/vite`, ["preview", "--port", "4274", "--strictPort"], `${ROOT}apps/organizer`);
  await waitHttp(`${API}/health`, "API");
  await waitHttp(STABLE, "preview stable");
  await waitHttp(ORGANIZER, "preview organizer");

  const browser = await chromium.launch({ executablePath: BROWSER });
  // Round A: organizer desktop + scuderia mobile (chips).
  await round(browser, "A", { width: 1440, height: 900 }, { width: 390, height: 844 }, false);
  // Round B: organizer tablet + scuderia desktop (griglia fase c).
  await round(browser, "B", { width: 820, height: 1180 }, { width: 1440, height: 900 }, true);
  await browser.close();
  console.log("\n[e2e] TUTTI I FUNNEL VERDI (2 round × 2 attori × 2 viewport)");
  shutdown();
  process.exit(0);
} catch (err) {
  console.error(`\n[e2e] FALLITO: ${err?.message ?? err}`);
  console.error("[e2e] screenshot del fallimento in e2e/failures/ (artifact in CI)");
  shutdown();
  process.exit(1);
}
