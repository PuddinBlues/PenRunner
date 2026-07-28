// Censimento Fase 0 — percorre i funnel su build di produzione locali,
// screenshot a ogni passo + scanner automatico di reperti nel testo pagina.
import { chromium } from "playwright-core";
import { readFileSync, writeFileSync } from "node:fs";
import { execSync } from "node:child_process";

const SHOTS = new URL("./shots/", import.meta.url).pathname;
const API_LOG = new URL("./api.log", import.meta.url).pathname;
const STABLE = "http://localhost:4173";
const ORGANIZER = "http://localhost:4174";
const SCRIBE = "http://localhost:4175";
const PORTAL = "http://localhost:3000";

const findings = [];
let shotIndex = 0;
let organizerTaps = 0;
let countTaps = false;

function codeFor(email) {
  const log = readFileSync(API_LOG, "utf8");
  const blocks = log.split("[mail] a ").filter((b) => b.startsWith(email));
  const m = blocks.at(-1)?.match(/Codice: (\d{6})/);
  if (!m) throw new Error(`nessun codice per ${email}`);
  return m[1];
}

async function shot(page, name, note = "") {
  shotIndex += 1;
  const file = `${String(shotIndex).padStart(2, "0")}-${name}.png`;
  await page.screenshot({ path: SHOTS + file, fullPage: true });
  const text = await page.evaluate(() => document.body?.innerText ?? "");
  const hits = [];
  for (const [label, re] of [
    ["codice BR a video", /BR-\d+/g],
    ["codice tRPC/HTTP grezzo", /\b(UNAUTHORIZED|FORBIDDEN|BAD_REQUEST|NOT_FOUND|INTERNAL_SERVER_ERROR|TOO_MANY_REQUESTS)\b/g],
    ["JSON grezzo", /\{"[a-zA-Z]+":/g],
    ["enum di stato grezzo", /\b(in_verifica|iscrizioni_aperte|iscrizioni_chiuse|in_attesa_firma|in_inserimento|manual_backfill)\b/g],
  ]) {
    const m = [...new Set((text.match(re) ?? []))];
    if (m.length) hits.push(`${label}: ${m.join(", ")}`);
  }
  if (hits.length) findings.push({ file, hits, note });
  console.log(`shot ${file}${hits.length ? "  ⚠ " + hits.join(" | ") : ""}${note ? `  [${note}]` : ""}`);
  return file;
}

async function click(page, selector, opts) {
  if (countTaps) organizerTaps += 1;
  await page.locator(selector, opts).first().click();
  await page.waitForTimeout(350);
}
async function clickText(page, text) {
  if (countTaps) organizerTaps += 1;
  const btn = page.getByRole("button", { name: text, exact: false });
  if (await btn.count()) await btn.first().click();
  else await page.getByText(text, { exact: false }).first().click();
  await page.waitForTimeout(350);
}
async function fill(page, nth, value, type = "text") {
  const sel = type === "email" ? "input[type=email]" : type === "password" ? "input[type=password]" : "input:not([type=email]):not([type=password]):not([type=date])";
  await page.locator(sel).nth(nth).fill(value);
}

async function registerVerifyLogin(page, base, email, password, name) {
  await page.goto(base);
  await page.waitForTimeout(600);
  await shot(page, `${name}-login`);
  await clickText(page, "Non ho un account");
  await fill(page, 0, email, "email");
  await page.locator("input[type=password]").nth(0).fill(password);
  await shot(page, `${name}-register-hint`, "hint password visibile?");
  await page.locator("input[type=password]").nth(1).fill(password);
  await clickText(page, "Registrati");
  await page.waitForTimeout(900);
  await shot(page, `${name}-verify-screen`);
  const code = codeFor(email);
  await page.locator("input").last().fill(code);
  await clickText(page, "Verifica");
  await page.waitForTimeout(700);
  await shot(page, `${name}-verified`);
  await fill(page, 0, email, "email");
  await page.locator("input[type=password]").first().fill(password);
  await clickText(page, "Entra");
  await page.waitForTimeout(900);
}

const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });

// =====================================================================
// 1) ORGANIZZATORE (desktop 1440) — con conteggio tocchi dal wizard
// =====================================================================
const orgCtx = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: "it-IT" });
const org = await orgCtx.newPage();
const SFX = process.env.SFX ?? "";
const ORG_EMAIL = `census-org${SFX}@example.com`;
const PW = "password-censimento";

await registerVerifyLogin(org, ORGANIZER, ORG_EMAIL, PW, "org");
await shot(org, "org-onboarding");
countTaps = true; // da qui si conta il percorso operativo
await fill(org, 0, "Censo");
await fill(org, 1, "Titolare");
await fill(org, 2, "Club Censimento");
await clickText(org, "Richiedi l'accesso organizzatore");
await org.waitForTimeout(700);
await shot(org, "org-vetting-pending", "banner in verifica");
// Approvazione fuori-app (gesto Console, riportato nel report)
execSync(`psql "postgres://penrunner:penrunner@localhost:5432/penrunner_census" -c "update organizations set vetting_status='verificata', verified_at=now() where name='Club Censimento'"`);
await org.reload();
await org.waitForTimeout(800);
await shot(org, "org-events-empty");
await clickText(org, "Nuovo evento");
await shot(org, "org-wizard-step1");
await fill(org, 0, `Censimento Show ${SFX}`);
await fill(org, 1, "Arena Censimento");
await org.locator("input[type=date]").nth(0).fill("2026-09-05");
await org.locator("input[type=date]").nth(1).fill("2026-09-06");
await clickText(org, "Continua");
await org.waitForTimeout(500);
await shot(org, "org-wizard-step2-classi");
// aggiungi una classe: selects categoria+pattern hanno default
await clickText(org, "Aggiungi classe");
await org.waitForTimeout(500);
await shot(org, "org-wizard-classe-aggiunta");
await clickText(org, "Continua");
await org.waitForTimeout(400);
await shot(org, "org-wizard-step3");
await clickText(org, "Fine: vai all'evento");
await org.waitForTimeout(700);
await shot(org, "org-event-detail-bozza");
await clickText(org, "Passa a: Annunciato");
await org.waitForTimeout(300);
await shot(org, "org-confirm-annunciato");
await clickText(org, "Conferma");
await org.waitForTimeout(500);
await clickText(org, "Passa a: Iscrizioni aperte");
await org.waitForTimeout(300);
await clickText(org, "Conferma");
await org.waitForTimeout(500);
await shot(org, "org-iscrizioni-aperte");
countTaps = false;
console.log(`TAPS organizer (onboarding→iscrizioni aperte): ${organizerTaps}`);

// =====================================================================
// 2) SCUDERIA (mobile 390×844) — funnel completo
// =====================================================================
const stCtx = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: "it-IT" });
const st = await stCtx.newPage();
const ST_EMAIL = `census-stable${SFX}@example.com`;
await registerVerifyLogin(st, STABLE, ST_EMAIL, PW, "stable");
await shot(st, "stable-onboarding");
await fill(st, 0, "Paola");
await fill(st, 1, "Referente");
await fill(st, 2, "Scuderia Censimento");
await clickText(st, "Crea la scuderia");
await st.waitForTimeout(800);
await shot(st, "stable-home-post-onboarding");
// roster
await clickText(st, "Roster");
await st.waitForTimeout(500);
await shot(st, "stable-roster-empty");
await fill(st, 0, "Giulia");
await fill(st, 1, "De Marchi");
await st.locator("input[type=email]").first().fill("giulia@example.com");
await clickText(st, "Aggiungi cavaliere");
await st.waitForTimeout(600);
await shot(st, "stable-roster-rider");
await fill(st, 2, "Smart Dunit");
await fill(st, 3, "380271999000001");
await clickText(st, "Aggiungi cavallo");
await st.waitForTimeout(600);
await shot(st, "stable-roster-completo");
// iscrizione
await clickText(st, "Iscrivi");
await st.waitForTimeout(600);
await shot(st, "stable-enroll-eventi");
await clickText(st, `Censimento Show ${SFX}`);
await st.waitForTimeout(700);
await shot(st, "stable-enroll-griglia");
await st.locator(".chip").first().click();
await st.waitForTimeout(400);
await shot(st, "stable-enroll-chip-on");
await clickText(st, "Continua");
await st.waitForTimeout(500);
await shot(st, "stable-enroll-riepilogo");
await clickText(st, "Conferma iscrizione");
await st.waitForTimeout(1200);
await shot(st, "stable-enroll-done");
await clickText(st, "Iscrizioni");
await st.waitForTimeout(700);
await shot(st, "stable-mie-iscrizioni", "chips avvisi: codici BR?");
// PR-0 live: torna in griglia, la chip deve dire "già iscritto"
await clickText(st, "Iscrivi");
await st.waitForTimeout(500);
await clickText(st, `Censimento Show ${SFX}`);
await st.waitForTimeout(600);
await shot(st, "stable-enroll-chip-gia-iscritto", "PR-0: chip disabilitata?");

// error probe: login con password sbagliata (nuovo context)
const probeCtx = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: "it-IT" });
const probe = await probeCtx.newPage();
await probe.goto(STABLE);
await probe.waitForTimeout(500);
await probe.locator("input[type=email]").fill(ST_EMAIL);
await probe.locator("input[type=password]").first().fill("password-sbagliata");
await probe.getByText("Entra", { exact: true }).last().click();
await probe.waitForTimeout(700);
await shot(probe, "stable-login-password-errata", "messaggio umano?");
await probeCtx.close();

// =====================================================================
// 3) SCUDERIA in DESKTOP (1440) — rotture responsive
// =====================================================================
const stdCtx = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: "it-IT" });
const std = await stdCtx.newPage();
await std.goto(STABLE);
await std.waitForTimeout(500);
await std.locator("input[type=email]").fill(ST_EMAIL);
await std.locator("input[type=password]").first().fill(PW);
await std.getByText("Entra", { exact: true }).last().click();
await std.waitForTimeout(900);
await shot(std, "stable-DESKTOP-iscrizioni", "layout desktop: card impilate?");
await std.getByText("Roster").first().click();
await std.waitForTimeout(500);
await shot(std, "stable-DESKTOP-roster");
await std.getByText("Iscrivi").first().click();
await std.waitForTimeout(500);
await std.getByText(`Censimento Show ${SFX}`).first().click();
await std.waitForTimeout(600);
await shot(std, "stable-DESKTOP-griglia");

// =====================================================================
// 4) ORGANIZZATORE: check-in, draw, documenti, invito
// =====================================================================
countTaps = true;
await org.reload();
await org.waitForTimeout(700);
await clickText(org, `Censimento Show ${SFX}`);
await org.waitForTimeout(600);
await clickText(org, "Classi");
await org.waitForTimeout(400);
await shot(org, "org-classi");
await clickText(org, "Gestisci");
await org.waitForTimeout(700);
await shot(org, "org-classe-checkin", "avvisi eleggibilità: come appaiono?");
// draw (tab)
await clickText(org, "Draw");
await org.waitForTimeout(400);
await shot(org, "org-draw-tab-vuota");
await clickText(org, "Genera il draw");
await org.waitForTimeout(700);
await shot(org, "org-draw-generato");
await clickText(org, "Pubblica il draw");
await org.waitForTimeout(300);
await clickText(org, "Conferma");
await org.waitForTimeout(700);
await shot(org, "org-draw-pubblicato");
console.log(`TAPS organizer (evento→draw pubblicato): ${organizerTaps}`);
countTaps = false;
// documenti: link + header check
await clickText(org, "Documenti PDF");
await org.waitForTimeout(400);
await shot(org, "org-documenti");
const pdfHref = await org.locator("a[href*='start-list.pdf']").first().getAttribute("href").catch(() => null);
if (pdfHref) {
  const res = await org.request.get(pdfHref);
  console.log(`PDF start-list headers: ${res.headers()["content-disposition"]}`);
}
// invito giudice (tab a livello EVENTO: prima si torna indietro)
await clickText(org, "\u2190 Censimento");
await org.waitForTimeout(500);
await clickText(org, "Giudici e scribe");
await org.waitForTimeout(500);
await shot(org, "org-inviti");

// =====================================================================
// 5) SCRIBE (tablet 820×1180) — evento del PILOTA (con score veri usare l'invite là è complicato; qui l'ingresso)
// =====================================================================
// crea invito per l'evento censimento dalla UI
await org.locator("select").first().selectOption("giudice");
const inputs = org.locator("input:not([type=email])");
await inputs.nth(0).fill("Giudice");
await inputs.nth(1).fill("Censimento");
await org.locator("input[type=email]").last().fill("giudice-censo@example.com");
await clickText(org, "Crea invito");
await org.waitForTimeout(800);
await shot(org, "org-invito-creato");
const linkText = await org.evaluate(() => document.body.innerText.match(/\?token=(\S+)/)?.[1] ?? null);
if (linkText) {
  const scCtx = await browser.newContext({ viewport: { width: 820, height: 1180 }, locale: "it-IT" });
  const sc = await scCtx.newPage();
  await sc.goto(`${SCRIBE}/?token=${linkText}`);
  await sc.waitForTimeout(1200);
  await shot(sc, "scribe-enter");
  // prova a entrare (bottone principale)
  const btn = sc.locator("button.primary, button").first();
  await btn.click().catch(() => {});
  await sc.waitForTimeout(1200);
  await shot(sc, "scribe-post-enter");
  await scCtx.close();
}

// =====================================================================
// 6) PORTALE pubblico (desktop + mobile) — evento pilota con score
// =====================================================================
const webCtx = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: "it-IT" });
const web = await webCtx.newPage();
await web.goto(`${PORTAL}/it`);
await web.waitForTimeout(1000);
await shot(web, "portal-home");
const evLink = web.locator("a[href*='/eventi/'], a[href*='/event']").first();
if (await evLink.count()) {
  await evLink.click();
  await web.waitForTimeout(1200);
  await shot(web, "portal-evento", "live results con score pilota");
}
const webM = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: "it-IT" });
const wm = await webM.newPage();
await wm.goto(`${PORTAL}/it`);
await wm.waitForTimeout(900);
await shot(wm, "portal-home-MOBILE");

writeFileSync(new URL("./findings.json", import.meta.url).pathname, JSON.stringify({ findings, organizerTaps }, null, 2));
console.log("\nCENSIMENTO COMPLETO — reperti scanner:", findings.length);
await browser.close();
