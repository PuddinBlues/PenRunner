import React, { useState, useEffect } from "react";

// PenRunner — Prototipo "Regia evento" v4 (organizer)
// v4: draw multi-giornata (fino a 10 giorni) e multi-classe (fino a 10 per
// giorno): chips giornate con stato, indice classi, editor di una classe alla
// volta; bozze sempre lavorabili su ogni giornata, pubblicazione per giornata
// mai bloccata (sera prima = rito, non lucchetto); "Inserisci a distanza" per
// le iscrizioni arrivate dopo la preparazione della bozza.
// Regole incarnate: 15a (draw per giornata, sera prima, pubblicazione unica),
// BR-19 (distanza stesso cavaliere: target 10, minimo 8, degradazione a scala
// dichiarata, mai fallimento), BR-43 (trattore a posizioni fisse ogni 5,
// draw pubblicato immutabile: late entry in coda, chirurgia solo admin).
// Regola del contesto: ogni stadio mostra SOLO i dati orientati all'azione
// di quello stadio. Il futuro non esiste ancora a video, il passato si
// comprime in riepilogo. Token da design/design-tokens.md.

const C = {
  accent: "#15803D", accent500: "#16A34A", accent50: "#DCFCE7",
  ink: "#0F172A", ink900: "#0B1120",
  slate700: "#334155", slate500: "#64748B", slate400: "#94A3B8",
  slate300: "#CBD5E1", slate100: "#F1F5F9", slate50: "#F8FAFC", white: "#FFFFFF",
  warning: "#B45309", danger: "#B91C1C", info: "#1D4ED8", live: "#DC2626",
};
const num = { fontVariantNumeric: "tabular-nums" };

const STAGES = [
  { id: "bozza", label: "Bozza" },
  { id: "annunciato", label: "Annunciato" },
  { id: "iscrizioni", label: "Iscrizioni" },
  { id: "draw", label: "Draw" },
  { id: "corsa", label: "In corsa" },
  { id: "chiusura", label: "Chiusura" },
];

const NEXT = {
  bozza: { title: "Completa la bozza e annuncia l'evento", detail: "Mancano le date di apertura iscrizioni. Quando annunci, l'evento appare sul calendario pubblico.", action: "Annuncia l'evento", secondary: "Rivedi le classi" },
  annunciato: { title: "Apri le iscrizioni", detail: "L'evento è sul calendario pubblico. Le scuderie potranno iscrivere i binomi da subito.", action: "Apri le iscrizioni", secondary: "Modifica le date" },
  iscrizioni: { title: "34 binomi iscritti · chiusura tra 6 giorni", detail: "3 iscrizioni hanno requisiti da verificare al check-in. Puoi chiudere in anticipo se le classi sono piene.", action: "Vedi le iscrizioni", secondary: "Chiudi in anticipo" },
  draw: { title: "Genera e pubblica il draw", detail: "Iscrizioni chiuse: 34 binomi in 4 classi. Il draw si genera per tutte le classi insieme e si pubblica con un'azione sola.", action: "Genera il draw", secondary: "Riapri le iscrizioni" },
  corsa: { title: "Rookie Level 1 in corsa · binomio 7 di 12", detail: "Lo scribe sta inviando gli score. La classifica pubblica si aggiorna in diretta.", action: "Segui la diretta", secondary: "Apri lo scoring" },
  chiusura: { title: "Chiudi l'evento e genera i documenti ufficiali", detail: "Tutte le classi sono complete. Report montepremi, classifiche e start list si generano in un pacchetto unico.", action: "Genera i documenti", secondary: "Rivedi gli score" },
};

/* ————— componenti di base ————— */
const Card = ({ title, badge, children, flex }) => (
  <section style={{ background: C.white, border: `1px solid ${C.slate300}`, borderRadius: 12, padding: 18, flex }}>
    <h2 style={{ fontSize: 13, margin: "0 0 12px", color: C.slate500, textTransform: "uppercase", letterSpacing: 0.8 }}>
      {title} {badge}
    </h2>
    {children}
  </section>
);

const Row = ({ children, top = C.slate100 }) => (
  <div style={{ display: "flex", alignItems: "center", padding: "9px 0", borderTop: `1px solid ${top}`, gap: 10 }}>{children}</div>
);

const Th = ({ children, right }) => (
  <th style={{ paddingBottom: 8, fontWeight: 500, textAlign: right ? "right" : "left", color: C.slate500 }}>{children}</th>
);
const Td = ({ children, right, bold, muted, style }) => (
  <td style={{ padding: "9px 0", textAlign: right ? "right" : "left", fontWeight: bold ? 600 : 400, color: muted ? C.slate500 : C.ink, ...num, ...style }}>{children}</td>
);

const GhostBtn = ({ children }) => (
  <button style={{ background: C.white, border: `1px solid ${C.slate300}`, borderRadius: 6, padding: "6px 12px", fontSize: 12.5, cursor: "pointer", color: C.slate700 }}>{children}</button>
);
const LinkBtn = ({ children, onClick }) => (
  <button onClick={onClick} style={{ background: "none", border: "none", padding: 0, color: C.accent, fontSize: 12.5, fontWeight: 600, cursor: "pointer" }}>{children}</button>
);

const Check = ({ ok, children }) => (
  <Row>
    <span style={{ color: ok ? C.accent : C.slate400, width: 16 }}>{ok ? "✓" : "○"}</span>
    <span style={{ fontSize: 13.5, color: ok ? C.slate500 : C.ink, fontWeight: ok ? 400 : 600 }}>{children}</span>
    {!ok && <span style={{ marginLeft: "auto" }}><LinkBtn>Completa →</LinkBtn></span>}
  </Row>
);

/* ————— pannelli per stadio ————— */

function PanelBozza() {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "1.2fr 1fr", gap: 16 }}>
      <Card title="Checklist di pubblicazione">
        <Check ok>Anagrafica evento — Cremona Reining Classic, 12–14 set 2026</Check>
        <Check ok>Sede — Cremona Horse Center, campo coperto 40×80</Check>
        <Check ok>Sanzionamento — IRHA/FISE, richiesta n. 2026-0812</Check>
        <Check ok>Classi — 4 configurate</Check>
        <Check>Date iscrizioni — apertura e chiusura da definire</Check>
        <Check>Contatto segreteria — email pubblica mancante</Check>
      </Card>
      <Card title="Classi in costruzione">
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13.5 }}>
          <thead><tr><Th>Classe</Th><Th right>Fee</Th><Th right>Added money</Th></tr></thead>
          <tbody>
            <tr style={{ borderTop: `1px solid ${C.slate100}` }}><Td bold>Rookie Level 1</Td><Td right>40 €</Td><Td right muted>—</Td></tr>
            <tr style={{ borderTop: `1px solid ${C.slate100}` }}><Td bold>Open L4</Td><Td right>80 €</Td><Td right>1.500 €</Td></tr>
            <tr style={{ borderTop: `1px solid ${C.slate100}` }}><Td bold>Non Pro L3</Td><Td right>60 €</Td><Td right>800 €</Td></tr>
            <tr style={{ borderTop: `1px solid ${C.slate100}` }}><Td bold>Youth 14-18</Td><Td right>30 €</Td><Td right muted>—</Td></tr>
          </tbody>
        </table>
        <div style={{ marginTop: 10 }}><LinkBtn>+ Aggiungi una classe</LinkBtn></div>
      </Card>
    </div>
  );
}

function PanelAnnunciato() {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "1.2fr 1fr", gap: 16 }}>
      <Card title="Come appare sul calendario pubblico">
        <div style={{ background: C.ink900, color: C.white, borderRadius: 10, padding: 16 }}>
          <div style={{ fontSize: 11, color: C.slate400, textTransform: "uppercase", letterSpacing: 1 }}>12–14 settembre · Cremona</div>
          <div style={{ fontSize: 18, fontWeight: 700, margin: "4px 0 2px" }}>Cremona Reining Classic</div>
          <div style={{ fontSize: 13, color: C.slate300 }}>IRHA/FISE · 4 classi · added money 2.300 €</div>
          <div style={{ marginTop: 10, display: "inline-block", background: C.accent, borderRadius: 6, padding: "6px 12px", fontSize: 12.5, fontWeight: 600 }}>Iscrizioni dal 1 agosto</div>
        </div>
        <p style={{ fontSize: 12.5, color: C.slate500, marginBottom: 0 }}>Anteprima reale della card evento. Le modifiche all'anagrafica si riflettono qui.</p>
      </Card>
      <Card title="Verso l'apertura">
        <Row><span style={{ fontSize: 13.5 }}>Apertura iscrizioni</span><strong style={{ marginLeft: "auto", ...num }}>1 agosto</strong></Row>
        <Row><span style={{ fontSize: 13.5 }}>Chiusura iscrizioni</span><strong style={{ marginLeft: "auto", ...num }}>5 settembre</strong></Row>
        <Row><span style={{ fontSize: 13.5 }}>Visualizzazioni della pagina evento</span><strong style={{ marginLeft: "auto", ...num }}>128</strong></Row>
        <Row><span style={{ fontSize: 13.5 }}>Link pubblico</span><span style={{ marginLeft: "auto" }}><GhostBtn>Copia link</GhostBtn></span></Row>
      </Card>
    </div>
  );
}

function PanelIscrizioni() {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "1.4fr 1fr 1fr", gap: 16 }}>
      <Card title="Iscrizioni per classe">
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13.5 }}>
          <thead><tr><Th>Classe</Th><Th right>Binomi</Th><Th right>Ultima</Th></tr></thead>
          <tbody>
            <tr style={{ borderTop: `1px solid ${C.slate100}` }}><Td bold>Rookie Level 1</Td><Td right>12</Td><Td right muted>2 h fa</Td></tr>
            <tr style={{ borderTop: `1px solid ${C.slate100}` }}><Td bold>Open L4</Td><Td right>9</Td><Td right muted>ieri</Td></tr>
            <tr style={{ borderTop: `1px solid ${C.slate100}` }}><Td bold>Non Pro L3</Td><Td right>8</Td><Td right muted>ieri</Td></tr>
            <tr style={{ borderTop: `1px solid ${C.slate100}` }}><Td bold>Youth 14-18</Td><Td right>5</Td><Td right muted>3 gg fa</Td></tr>
            <tr style={{ borderTop: `1px solid ${C.slate300}` }}><Td bold>Totale</Td><Td right bold>34</Td><Td right/></tr>
          </tbody>
        </table>
      </Card>
      <Card title="Incassi previsti">
        <div style={{ fontSize: 30, fontWeight: 800, letterSpacing: -0.5, ...num }}>1.870 €</div>
        <div style={{ fontSize: 12.5, color: C.slate500, marginTop: 2 }}>fee iscrizione confermate</div>
        <Row top={C.slate100}><span style={{ fontSize: 13 }}>Scuderie iscritte</span><strong style={{ marginLeft: "auto", ...num }}>11</strong></Row>
        <Row><span style={{ fontSize: 13 }}>Media binomi/scuderia</span><strong style={{ marginLeft: "auto", ...num }}>3,1</strong></Row>
      </Card>
      <Card title="Da verificare al check-in" badge={<span style={{ color: C.warning, ...num }}>· 3</span>}>
        {[
          { chi: "Scuderia 23QH", cosa: "Tessera IRHA di Sofia Ferrari" },
          { chi: "Az. Agr. Le Selle", cosa: "Patente FISE di Marco De Rossi" },
          { chi: "Scuderia 23QH", cosa: "Earnings di Gunners Dream" },
        ].map((a, i) => (
          <div key={i} style={{ padding: "9px 0", borderTop: `1px solid ${C.slate100}` }}>
            <div style={{ fontSize: 12, color: C.slate500 }}>{a.chi}</div>
            <div style={{ fontSize: 13.5, fontWeight: 600, margin: "2px 0" }}>{a.cosa}</div>
            <LinkBtn>Segna per il check-in →</LinkBtn>
          </div>
        ))}
      </Card>
    </div>
  );
}

const MIN_GAP = 8, TARGET_GAP = 10, DRAG_EVERY = 5;

/* ————— dati demo: 5ª tappa, 25–30 agosto (il pattern regge 10 giornate) ————— */

const HP = ["Smart Lil Dream","Gunners Chic","Whizkey Time","Spooks Golden Gun","Tinsel Step","Ruf Lil Diamond","Cromed Out Whiz","Miss Peppy Lena","Shine On Badger","Dun It For Chex","Wimpys Little Rey","Starlight Jac","Hollywood Vintage","Electric Snow","Lena Gotta Gun","Chics Magnetic","Topsails Rem","Gun It Whiz","Chex My Dream","Peppy San Lena","Wind Her Up","Roosters Wimp","Magnum Ice","Docs Starlight","Sail On Juice","Custom Whiz","Lil Ruf Gun","Spark Of Chex","Steady Tradition","Xtra Voodoo","Shiners Nickel","Mega Watt Whiz","Ruf N Tuf Dunit","Ms Dreamy Gun","Inferno Sixtysix","Pale Face Whiz","Tinseltown Gun","Juice N Shine","Cee Heavenly","Big Chex To Cash"];
const RP = ["Giulia Ferrari","Marco Bianchi","Sofia Colombo","Luca Moretti","Elena Sala","Andrea Fontana","Paolo Rizzi","Chiara Galli","Federico Riva","Martina Villa","Davide Conti","Alessia Marino","Stefano Piras","Marta Sala","Franco Neri","Ilaria Bosco","Carlo Danti","Anna Greco","Piero Longhi","Silvia Testa","Enzo Ferri","Laura Vitali","Bruno Riva","Nadia Comi","Sofia Marchetti","Giorgio Leoni","Paola Serra","Matteo Grassi","Lucia Ferro","Omar Sanna","Teresa Vigo","Aldo Ricci","Erika Monti","Dario Poli","Rita Gatti","Ivan Rosso","Nora Bellini","Fabio Corti","Vera Lanza","Elio Marra","Sara Neri","Tino Vela","Ada Fiori","Gino Pardo","Mia Costa","Leo Bruni","Eva Riva","Ugo Silva"];
const SP = ["Scuderia Le Robinie","Bianchi Quarter Horses","Ranch Il Salice","Moretti Performance","Fontana Ranch","Galli Horses","Villa Reining","Cascina Del Ponte"];

const mk = (prefix, n, seed) => Array.from({ length: n }, (_, i) => ({
  id: `${prefix}-${i + 1}`,
  horse: HP[(seed + i * 7) % HP.length],
  rider: RP[(seed + i) % RP.length],
  stable: SP[(seed + i * 3) % SP.length],
}));
const put = (arr, i, rider, stable, horse) => { arr[i] = { ...arr[i], rider, stable, ...(horse ? { horse } : {}) }; };

// Sabato 29 — la giornata piena: 8 classi, ~90 binomi
const SAT_RK = mk("rk", 16, 0);
put(SAT_RK, 1, "Marco Bianchi", "Bianchi Quarter Horses", "Gunners Chic");
put(SAT_RK, 4, "Marco Bianchi", "Bianchi Quarter Horses", "Tinsel Step");
put(SAT_RK, 10, "Marco Bianchi", "Bianchi Quarter Horses", "Wimpys Little Rey");
put(SAT_RK, 0, "Giulia Ferrari", "Scuderia Le Robinie", "Smart Lil Dream");
put(SAT_RK, 7, "Giulia Ferrari", "Scuderia Le Robinie", "Miss Peppy Lena");
const SAT_OP = mk("op", 14, 20);
put(SAT_OP, 3, "Chiara Galli", "Galli Horses");
put(SAT_OP, 7, "Chiara Galli", "Galli Horses");
const SAT_NP = mk("np", 12, 8);
put(SAT_NP, 0, "Marta Sala", "Ranch Il Salice");
put(SAT_NP, 11, "Marta Sala", "Ranch Il Salice");
put(SAT_NP, 1, "Franco Neri", "Fontana Ranch");

const DAYS = [
  { key: "d25", chip: "Mar 25", full: "martedì 25 agosto", regClosed: true, initialSub: "pub",
    classes: [{ key: "ft4o", name: "Futurity 4YO Open", entries: mk("a", 10, 3) }, { key: "ft4np", name: "Futurity 4YO Non Pro", entries: mk("b", 8, 14) }] },
  { key: "d26", chip: "Mer 26", full: "mercoledì 26 agosto", regClosed: true, initialSub: "pub",
    classes: [{ key: "snb", name: "Snaffle Bit 5YO", entries: mk("c", 9, 22) }, { key: "nvo", name: "Novice Horse Open", entries: mk("d", 10, 31) }] },
  { key: "d27", chip: "Gio 27", full: "giovedì 27 agosto", regClosed: true, initialSub: "pub",
    classes: [{ key: "rkp", name: "Rookie Professional", entries: mk("e", 8, 5) }, { key: "nvn", name: "Novice Horse Non Pro", entries: mk("f", 9, 17) }, { key: "y10", name: "Youth 10–13", entries: mk("g", 7, 26) }] },
  { key: "d28", chip: "Ven 28", full: "venerdì 28 agosto", regClosed: true, initialSub: "pub",
    classes: [{ key: "lnp", name: "Limited Non Pro", entries: mk("h", 9, 11) }, { key: "prt", name: "Prime Time", entries: mk("i", 8, 29) }] },
  { key: "d29", chip: "Sab 29", full: "sabato 29 agosto", regClosed: true, initialSub: "bozza",
    classes: [
      { key: "rk", name: "Rookie · L1–L2", entries: SAT_RK },
      { key: "op", name: "Open · L4", entries: SAT_OP },
      { key: "np", name: "Non Pro · L1–L4", entries: SAT_NP,
        pending: [
          { id: "np-p1", horse: "Steady Tradition", rider: "Franco Neri", stable: "Fontana Ranch" },
          { id: "np-p2", horse: "Mega Watt Whiz", rider: "Erika Monti", stable: "Cascina Del Ponte" },
        ] },
      { key: "yt", name: "Youth 14–18", entries: mk("yt", 9, 33) },
      { key: "gr", name: "Green · L1", entries: mk("gr", 11, 2) },
      { key: "io", name: "Intermediate Open · L2–L3", entries: mk("io", 10, 19) },
      { key: "lo", name: "Limited Open · L1", entries: mk("lo", 8, 27) },
      { key: "pr", name: "Para Reining", entries: mk("pr", 6, 37) },
    ] },
  { key: "d30", chip: "Dom 30", full: "domenica 30 agosto", regClosed: false, initialSub: "pre",
    classes: [{ key: "opf", name: "Open · L1–L4", entries: mk("l", 14, 6) }, { key: "npf", name: "Non Pro · L1–L4", entries: mk("m", 12, 24) }, { key: "fs", name: "Freestyle", entries: mk("n", 6, 35) }] },
];
const dayOf = (k) => DAYS.find((d) => d.key === k);
const classOf = (d, ck) => dayOf(d).classes.find((c) => c.key === ck);
const bestGap = (N, k) => Math.floor((N - k) / (k - 1));

/* ————— logica distanze ————— */

function analyzeClass(entries, order) {
  const rows = order.map((id) => entries.find((e) => e.id === id));
  const count = {};
  rows.forEach((e) => { count[e.rider] = (count[e.rider] || 0) + 1; });
  const info = rows.map(() => null);
  for (let i = 0; i < rows.length; i++) {
    for (let j = i + 1; j < rows.length; j++) {
      if (rows[j].rider === rows[i].rider) {
        const gap = j - i - 1;
        const best = bestGap(rows.length, count[rows[i].rider]);
        let level = gap >= TARGET_GAP ? "ok" : gap >= MIN_GAP ? "warn" : "danger";
        if (level !== "ok" && best < TARGET_GAP && gap >= best) level = "limit";
        info[i] = { gap, level, best, sib: j };
        break;
      }
    }
  }
  const riders = { danger: new Set(), warn: new Set(), limit: new Set() };
  let dRows = 0, wRows = 0;
  info.forEach((x, i) => {
    if (!x || x.level === "ok") return;
    riders[x.level] && riders[x.level].add(rows[i].rider);
    if (x.level === "danger") dRows++; if (x.level === "warn") wRows++;
  });
  return { rows, info, danger: riders.danger.size, warn: riders.warn.size, limit: riders.limit.size, dRows, wRows };
}

function suggestOrder(entries) {
  const N = entries.length, byRider = {};
  entries.forEach((e) => { (byRider[e.rider] = byRider[e.rider] || []).push(e); });
  const multi = Object.values(byRider).filter((g) => g.length > 1).sort((a, b) => b.length - a.length);
  const slots = Array(N).fill(null);
  multi.forEach((g) => g.forEach((e, i) => {
    let pos = Math.round((i * (N - 1)) / (g.length - 1)), d = 0;
    while (slots[(pos + d) % N] !== null && slots[(pos - d + N) % N] !== null) d++;
    pos = slots[(pos + d) % N] === null ? (pos + d) % N : (pos - d + N) % N;
    slots[pos] = e.id;
  }));
  const rest = entries.filter((e) => !slots.includes(e.id));
  let r = 0;
  for (let i = 0; i < N; i++) if (slots[i] === null) slots[i] = rest[r++].id;
  return slots;
}

// Nuova iscrizione su bozza già lavorata: la posizione che rispetta le distanze
// con le minime conseguenze (preferendo la coda a parità).
function insertAtDistance(entries, order, entry) {
  const all = [...entries, entry];
  let best = { pos: order.length, bad: Infinity, own: -1 };
  for (let p = 0; p <= order.length; p++) {
    const trial = [...order.slice(0, p), entry.id, ...order.slice(p)];
    const a = analyzeClass(all, trial);
    const bad = a.dRows * 10 + a.wRows;
    let own = Infinity;
    a.info.forEach((x, i) => { if (x && a.rows[i].rider === entry.rider) own = Math.min(own, x.gap); });
    if (own === Infinity) own = order.length;
    if (bad < best.bad || (bad === best.bad && own > best.own) || (bad === best.bad && own === best.own && p >= best.pos)) best = { pos: p, bad, own };
  }
  return best.pos;
}

/* ————— editor di classe ————— */

const GAP_BADGE = {
  ok:     { color: C.slate500,  bg: C.slate100 },
  warn:   { color: C.warning,   bg: "#FEF3C7" },
  danger: { color: C.danger,    bg: "#FEE2E2" },
  limit:  { color: C.info,      bg: "#DBEAFE" },
};
const gapCopy = (e, inf) =>
  inf.level === "ok" ? `prossimo suo cavallo tra ${inf.gap}` :
  inf.level === "limit" ? `${e.rider.split(" ").pop()} tra ${inf.gap} — massimo possibile` :
  `tra ${inf.gap} c'è di nuovo ${e.rider.split(" ").pop()}`;

function ClassEditor({ dayKey, cls, order, setOrder, frozen, query, highlightIds, focusId, onFix, onInsert, pendingCount, onClose }) {
  const [dragIdx, setDragIdx] = useState(null);
  const [hover, setHover] = useState(null);
  const [flashId, setFlashId] = useState(null);
  const { rows, info, danger, warn, limit } = analyzeClass(cls.entries.concat(cls.pending || []), order);
  useEffect(() => {
    if (!focusId) return;
    const el = document.getElementById(`dr-${dayKey}-${cls.key}-${focusId}`);
    if (el) el.scrollIntoView({ behavior: "smooth", block: "center" });
    setFlashId(focusId);
    const t = setTimeout(() => setFlashId(null), 1400);
    return () => clearTimeout(t);
  }, [focusId, dayKey, cls.key]);
  const move = (from, to) => {
    if (frozen || to < 0 || to >= order.length) return;
    const next = [...order]; const [x] = next.splice(from, 1); next.splice(to, 0, x);
    setOrder(next);
  };
  const q = query.trim().toLowerCase();
  const matches = (e) => !q || e.horse.toLowerCase().includes(q) || e.rider.toLowerCase().includes(q) || e.stable.toLowerCase().includes(q);
  const goToSibling = (i, inf) => {
    const sib = rows[inf.sib];
    const el = document.getElementById(`dr-${dayKey}-${cls.key}-${sib.id}`);
    if (el) el.scrollIntoView({ behavior: "smooth", block: "center" });
    setFlashId(sib.id);
    setTimeout(() => setFlashId(null), 1400);
  };
  const status = danger > 0
    ? <span style={{ color: C.danger, ...num }}>· {danger} da sistemare</span>
    : warn > 0 ? <span style={{ color: C.warning, ...num }}>· {warn} sotto l'obiettivo</span>
    : limit > 0 ? <span style={{ color: C.info }}>· al massimo possibile</span>
    : <span style={{ color: C.accent }}>✓ a distanza</span>;
  return (
    <Card title={`${cls.name} · ${rows.length} binomi`} badge={status}>
      <div style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: 6, flexWrap: "wrap" }}>
        {pendingCount > 0 && !frozen && (
          <button onClick={onInsert} style={{ background: "#DBEAFE", color: C.info, border: "none", borderRadius: 999, padding: "4px 12px", fontSize: 12, fontWeight: 600, cursor: "pointer", ...num }}>
            +{pendingCount} nuove — Inserisci a distanza
          </button>
        )}
        {(danger > 0 || warn > 0) && !frozen && <GhostBtn onClick={onFix}>Sistema questa classe</GhostBtn>}
        <span style={{ marginLeft: "auto" }}><LinkBtn onClick={onClose}>Chiudi ✕</LinkBtn></span>
      </div>
      <div style={{ margin: "-2px 0 2px" }}>
        {rows.map((e, i) => {
          const inf = info[i];
          const sister = hover && hover.rider === e.rider && hover.idx !== i;
          const active = hover && hover.idx === i;
          const showBadge = inf && (inf.level !== "ok" || sister || active);
          const lit = flashId === e.id || (highlightIds && highlightIds.has(e.id));
          const bar = inf && inf.level !== "ok" ? GAP_BADGE[inf.level].color : sister ? C.slate400 : "transparent";
          return (
            <React.Fragment key={e.id}>
              <div
                id={`dr-${dayKey}-${cls.key}-${e.id}`}
                draggable={!frozen}
                onDragStart={() => setDragIdx(i)}
                onDragOver={(ev) => { ev.preventDefault(); if (dragIdx !== null && dragIdx !== i) { move(dragIdx, i); setDragIdx(i); } }}
                onDragEnd={() => setDragIdx(null)}
                onMouseEnter={() => setHover({ idx: i, rider: e.rider })}
                onMouseLeave={() => setHover(null)}
                style={{
                  display: "flex", alignItems: "center", gap: 8, padding: "8px 6px 8px 4px",
                  borderTop: i === 0 ? "none" : `1px solid ${C.slate100}`,
                  borderLeft: `3px solid ${bar}`,
                  background: dragIdx === i ? C.slate100 : lit ? C.accent50 : sister || active ? C.slate50 : C.white,
                  opacity: matches(e) ? 1 : 0.3,
                  cursor: frozen ? "default" : "grab",
                  transition: "background 400ms, border-color 120ms",
                }}>
                <span style={{ width: 24, textAlign: "right", fontSize: 13, fontWeight: 700, color: C.slate400, ...num }}>{i + 1}</span>
                <span style={{ width: 14, color: C.slate300, fontSize: 13, userSelect: "none", visibility: !frozen && (active || dragIdx === i) ? "visible" : "hidden" }} title="Trascina per spostare">⠿</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13.5, fontWeight: 600 }}>{e.horse}</div>
                  <div style={{ fontSize: 12, color: C.slate500 }}>{e.rider} · {e.stable}</div>
                </div>
                {showBadge && (
                  <button
                    onClick={() => goToSibling(i, inf)}
                    title="Vai all'altro cavallo di questo cavaliere"
                    style={{ border: "none", cursor: "pointer", fontSize: 11.5, fontWeight: 600, ...num, borderRadius: 999, padding: "3px 9px", color: GAP_BADGE[inf.level].color, background: GAP_BADGE[inf.level].bg }}>
                    {gapCopy(e, inf)} ↓
                  </button>
                )}
                {!frozen && active && (
                  <span style={{ display: "flex", gap: 2 }}>
                    <button onClick={() => move(i, i - 1)} title="Sposta su"  style={{ border: `1px solid ${C.slate300}`, background: C.white, borderRadius: 6, width: 24, height: 24, cursor: "pointer", color: C.slate500, fontSize: 11, lineHeight: 1 }}>↑</button>
                    <button onClick={() => move(i, i + 1)} title="Sposta giù" style={{ border: `1px solid ${C.slate300}`, background: C.white, borderRadius: 6, width: 24, height: 24, cursor: "pointer", color: C.slate500, fontSize: 11, lineHeight: 1 }}>↓</button>
                  </span>
                )}
              </div>
              {(i + 1) % DRAG_EVERY === 0 && i < rows.length - 1 && (
                <div style={{ borderTop: `2px dashed ${C.slate300}`, position: "relative", height: 10 }}>
                  <span style={{ position: "absolute", right: 0, top: -1, fontSize: 9.5, color: C.slate400, letterSpacing: 0.6, textTransform: "uppercase", background: C.white, paddingLeft: 6 }}>Drag — posizione fissa</span>
                </div>
              )}
            </React.Fragment>
          );
        })}
      </div>
    </Card>
  );
}

/* ————— pannello draw: giornate → indice classi → editor ————— */

function PanelDraw({ day, sub, orders, pending, setOrders, frozen, openClass, setOpenClass, query, setQuery, highlightIds, focus, onFixClass, onInsertClass }) {
  const perClass = day.classes.map((c) => {
    const o = orders[c.key];
    const a = o ? analyzeClass(c.entries.concat(c.pending || []), o) : null;
    return { c, a, pend: (pending[c.key] || []).length };
  });
  if (sub === "pre") {
    return (
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(340px, 1fr))", gap: 16 }}>
        <Card title={`${day.full} — totali`}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13.5 }}>
            <thead><tr><Th>Classe</Th><Th right>Binomi</Th><Th right>Draw</Th></tr></thead>
            <tbody>
              {day.classes.map((c) => (
                <tr key={c.key} style={{ borderTop: `1px solid ${C.slate100}` }}>
                  <Td bold>{c.name}</Td><Td right>{c.entries.length + (c.pending || []).length}</Td>
                  <Td right style={{ color: C.slate400 }}>da generare</Td>
                </tr>
              ))}
            </tbody>
          </table>
          <p style={{ fontSize: 12.5, color: C.slate500, marginBottom: 0 }}>Il sorteggio distanzia i cavalli dello stesso cavaliere (obiettivo {TARGET_GAP}+, minimo {MIN_GAP}) e separa i binomi della stessa scuderia quando possibile. Puoi preparare questa giornata da subito.</p>
        </Card>
        {!day.regClosed && (
          <Card title="Iscrizioni ancora aperte">
            <p style={{ fontSize: 13.5, margin: 0, color: C.slate700 }}>Per {day.full} le iscrizioni non sono ancora chiuse: la bozza resta aggiornabile, e le nuove iscrizioni ti verranno segnalate classe per classe per inserirle a distanza.</p>
          </Card>
        )}
      </div>
    );
  }
  const open = openClass ? perClass.find((x) => x.c.key === openClass) : null;
  return (
    <div>
      <div style={{ display: "grid", gridTemplateColumns: open ? "minmax(280px, 340px) 1fr" : "1fr", gap: 16, alignItems: "start" }}>
        <Card title={`${day.full} — le classi`}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13.5 }}>
            <thead><tr><Th>Classe</Th><Th right>Binomi</Th><Th right>Distanze</Th></tr></thead>
            <tbody>
              {perClass.map(({ c, a, pend }) => {
                const sel = openClass === c.key;
                const st = !a ? "—"
                  : a.danger > 0 ? <span style={{ color: C.danger, fontWeight: 600, ...num }}>{a.danger} da sistemare</span>
                  : a.warn > 0 ? <span style={{ color: C.warning, fontWeight: 600, ...num }}>{a.warn} sotto obiettivo</span>
                  : a.limit > 0 ? <span style={{ color: C.info, fontWeight: 600 }}>max possibile</span>
                  : <span style={{ color: C.accent, fontWeight: 600 }}>✓</span>;
                return (
                  <tr key={c.key} onClick={() => setOpenClass(sel ? null : c.key)}
                    style={{ borderTop: `1px solid ${C.slate100}`, cursor: "pointer", background: sel ? C.accent50 : "transparent" }}>
                    <Td bold style={{ paddingLeft: 8, borderLeft: sel ? `3px solid ${C.accent}` : "3px solid transparent" }}>{c.name}</Td>
                    <Td right>
                      {c.entries.length + (c.pending || []).length - pend}
                      {pend > 0 && <span style={{ marginLeft: 6, background: "#DBEAFE", color: C.info, borderRadius: 999, padding: "1px 7px", fontSize: 11, fontWeight: 700 }}>+{pend}</span>}
                    </Td>
                    <Td right>{st}</Td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <p style={{ fontSize: 12, color: C.slate500, marginBottom: 0, marginTop: 8 }}>Apri una classe per lavorarla. {frozen ? "" : "Le classi con ✓ non verranno toccate da \"Sistema la giornata\"."}</p>
        </Card>
        {open && (
          <ClassEditor
            dayKey={day.key} cls={open.c} order={orders[open.c.key]} frozen={frozen} query={query}
            highlightIds={highlightIds} focusId={focus && focus.cls === open.c.key ? focus.id : null}
            pendingCount={open.pend}
            setOrder={(next) => setOrders({ ...orders, [open.c.key]: next })}
            onFix={() => onFixClass(open.c.key)}
            onInsert={() => onInsertClass(open.c.key)}
            onClose={() => setOpenClass(null)}
          />
        )}
      </div>
      {frozen && (
        <p style={{ marginTop: 14, fontSize: 12.5, color: C.slate500 }}>
          Draw pubblicato: l'ordine è congelato. Le iscrizioni tardive vanno in coda alla classe; le modifiche al draw pubblicato sono disattivate per questo evento.
        </p>
      )}
    </div>
  );
}

function PanelCorsa() {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "1.4fr 1fr", gap: 16 }}>
      <Card title="In campo ora" badge={<span style={{ color: C.live, fontSize: 12 }}>● Rookie Level 1</span>}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 12 }}>
          <div>
            <div style={{ fontSize: 19, fontWeight: 800 }}>Smart Dunit</div>
            <div style={{ fontSize: 13.5, color: C.slate500 }}>De Marchi Giulia · Scuderia 23QH · n. 7 di 12</div>
          </div>
          <div style={{ marginLeft: "auto", textAlign: "right" }}>
            <div style={{ fontSize: 11, color: C.slate500, textTransform: "uppercase", letterSpacing: 1 }}>Pattern</div>
            <div style={{ fontSize: 19, fontWeight: 800, ...num }}>9</div>
          </div>
        </div>
        <div style={{ marginTop: 12, borderTop: `1px solid ${C.slate100}` }}>
          {[["6", "Gun Smoke Whiz", "Rossi Martina", "70,0"], ["5", "Spook Chic Dream", "Bianchi Luca", "69,5"], ["4", "Shiny Little Step", "Rossi Martina", "71,0"]].map(([n, c, r, sc]) => (
            <Row key={n}>
              <span style={{ color: C.slate400, width: 20, ...num }}>{n}</span>
              <span style={{ fontSize: 13.5, fontWeight: 600 }}>{c}</span>
              <span style={{ fontSize: 12.5, color: C.slate500 }}>{r}</span>
              <strong style={{ marginLeft: "auto", ...num, color: parseFloat(sc.replace(",", ".")) < 70 ? C.warning : C.ink }}>{sc}</strong>
            </Row>
          ))}
        </div>
      </Card>
      <Card title="Prossimi in ordine di entrata">
        {[["8", "Chics Magic Whiz", "Ferrari Sofia"], ["9", "Dun It Again", "Colombo Andrea"], ["10", "Lil Ruf Peppy", "Moretti Elena"]].map(([n, c, r]) => (
          <Row key={n}>
            <span style={{ color: C.slate400, width: 20, ...num }}>{n}</span>
            <div><div style={{ fontSize: 13.5, fontWeight: 600 }}>{c}</div><div style={{ fontSize: 12, color: C.slate500 }}>{r}</div></div>
          </Row>
        ))}
        <div style={{ marginTop: 10 }}><LinkBtn>Apri la diretta pubblica →</LinkBtn></div>
      </Card>
    </div>
  );
}

function PanelChiusura() {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "1.2fr 1fr", gap: 16 }}>
      <Card title="Risultati finali">
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13.5 }}>
          <thead><tr><Th>Classe</Th><Th>Campione</Th><Th right>Score</Th></tr></thead>
          <tbody>
            {[["Rookie Level 1", "Shiny Little Step · Rossi M.", "71,0"], ["Open L4", "Gunners Dream · Ferrari S.", "221,5"], ["Non Pro L3", "Chocowhiz · De Rossi M.", "218,0"], ["Youth 14-18", "Lil Ruf Peppy · Moretti E.", "69,5"]].map(([cl, ch, sc]) => (
              <tr key={cl} style={{ borderTop: `1px solid ${C.slate100}` }}>
                <Td bold>{cl}</Td><Td>{ch}</Td>
                <Td right style={{ color: parseFloat(sc.replace(",", ".")) < 70 ? C.warning : C.ink, fontWeight: 600 }}>{sc}</Td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
      <Card title="Documenti ufficiali">
        {[
          { doc: "Classifiche finali", nota: "4 classi · IT/EN" },
          { doc: "Report montepremi", nota: "Art. 15 · payback per classe" },
          { doc: "Start list definitive", nota: "archivio evento" },
          { doc: "Riepilogo incassi", nota: "fee + added money" },
        ].map((d) => (
          <Row key={d.doc}>
            <div><div style={{ fontSize: 13.5, fontWeight: 600 }}>{d.doc}</div><div style={{ fontSize: 12, color: C.slate500 }}>{d.nota}</div></div>
            <span style={{ marginLeft: "auto" }}><GhostBtn>PDF</GhostBtn></span>
          </Row>
        ))}
      </Card>
    </div>
  );
}

const PANELS = { bozza: PanelBozza, annunciato: PanelAnnunciato, iscrizioni: PanelIscrizioni, draw: PanelDraw, corsa: PanelCorsa, chiusura: PanelChiusura };

/* ————— pagina ————— */
export default function OrganizerRegia() {
  const [stage, setStage] = useState("bozza");
  const idx = STAGES.findIndex((s) => s.id === stage);

  // — stato del draw, per giornata —
  const [dayKey, setDayKey] = useState("d29");
  const [dayState, setDayState] = useState(() => {
    const st = {};
    DAYS.forEach((d) => {
      const orders = {};
      d.classes.forEach((c) => {
        if (d.initialSub !== "pre") orders[c.key] = d.initialSub === "pub" ? suggestOrder(c.entries) : c.entries.map((e) => e.id);
      });
      const pending = {};
      d.classes.forEach((c) => { if (c.pending) pending[c.key] = [...c.pending]; });
      st[d.key] = { sub: d.initialSub, orders, pending };
    });
    return st;
  });
  const [openClass, setOpenClass] = useState("rk");
  const [query, setQuery] = useState("");
  const [prev, setPrev] = useState(null);
  const [prevLabel, setPrevLabel] = useState("");
  const [highlightIds, setHighlightIds] = useState(null);
  const [focus, setFocus] = useState(null); // { cls, id } — dalla ricerca
  const [confirmMode, setConfirmMode] = useState(null); // conflicts | pending | regsOpen

  const day = dayOf(dayKey);
  const ds = dayState[dayKey];
  const patchDay = (patch) => setDayState({ ...dayState, [dayKey]: { ...ds, ...patch } });
  const setOrders = (orders, label = "Annulla l'ultima mossa") => {
    setPrev({ dayKey, orders: ds.orders, pending: ds.pending }); setPrevLabel(label);
    patchDay({ orders });
  };
  const undo = () => {
    if (!prev || prev.dayKey !== dayKey) return;
    patchDay({ orders: prev.orders, pending: prev.pending });
    setPrev(null); setHighlightIds(null);
  };
  const switchDay = (k) => {
    setDayKey(k); setOpenClass(null); setQuery(""); setPrev(null); setHighlightIds(null); setFocus(null); setConfirmMode(null);
  };

  const dayHealth = (d) => {
    const st = dayState[d.key];
    if (st.sub === "pre") return { kind: "pre" };
    let danger = 0, warn = 0, limit = 0, pend = 0;
    d.classes.forEach((c) => {
      const o = st.orders[c.key]; if (!o) return;
      const a = analyzeClass(c.entries.concat(c.pending || []), o);
      danger += a.danger; warn += a.warn; limit += a.limit;
      pend += (st.pending[c.key] || []).length;
    });
    return { kind: st.sub, danger, warn, limit, pend };
  };
  const health = dayHealth(day);

  const flash = (ids) => { setHighlightIds(new Set(ids)); setTimeout(() => setHighlightIds(null), 1600); };

  const fixClass = (ck) => {
    const c = classOf(dayKey, ck);
    const all = c.entries.concat(c.pending || []).filter((e) => ds.orders[ck].includes(e.id));
    const next = suggestOrder(all);
    const moved = next.filter((id, i) => ds.orders[ck][i] !== id);
    setOrders({ ...ds.orders, [ck]: next }, "Annulla la sistemazione");
    flash(moved);
  };
  const fixDay = () => {
    const orders = { ...ds.orders }; const moved = [];
    day.classes.forEach((c) => {
      const o = orders[c.key]; if (!o) return;
      const all = c.entries.concat(c.pending || []).filter((e) => o.includes(e.id));
      const a = analyzeClass(all, o);
      if (a.danger > 0 || a.warn > 0) {
        const next = suggestOrder(all);
        next.forEach((id, i) => { if (o[i] !== id) moved.push(id); });
        orders[c.key] = next;
      }
    });
    setOrders(orders, "Annulla la sistemazione");
    flash(moved);
  };
  const insertClass = (ck) => {
    const c = classOf(dayKey, ck);
    const pend = ds.pending[ck] || []; if (!pend.length) return;
    let order = [...ds.orders[ck]];
    let placedInto = c.entries.filter((e) => order.includes(e.id));
    const placedIds = [];
    pend.forEach((e) => {
      const pos = insertAtDistance(placedInto, order, e);
      order = [...order.slice(0, pos), e.id, ...order.slice(pos)];
      placedInto = [...placedInto, e];
      placedIds.push(e.id);
    });
    setPrev({ dayKey, orders: ds.orders, pending: ds.pending }); setPrevLabel("Annulla l'inserimento");
    patchDay({ orders: { ...ds.orders, [ck]: order }, pending: { ...ds.pending, [ck]: [] } });
    flash(placedIds);
  };

  // ricerca: apre la classe giusta e raggiunge la riga
  useEffect(() => {
    const q = query.trim().toLowerCase();
    if (ds.sub === "pre" || q.length < 2) { setFocus(null); return; }
    for (const c of day.classes) {
      const o = ds.orders[c.key]; if (!o) continue;
      const all = c.entries.concat(c.pending || []);
      const hit = o.map((id) => all.find((e) => e.id === id))
        .find((e) => e.horse.toLowerCase().includes(q) || e.rider.toLowerCase().includes(q) || e.stable.toLowerCase().includes(q));
      if (hit) {
        if (openClass !== c.key) setOpenClass(c.key);
        setFocus({ cls: c.key, id: hit.id });
        return;
      }
    }
    setFocus(null);
  }, [query]); // eslint-disable-line

  // Prossimo passo dello stadio draw: sempre UNA azione primaria
  const drawNext = () => {
    if (ds.sub === "pre") return {
      title: `Genera il draw di ${day.full}`,
      detail: day.regClosed
        ? "Il draw si genera per tutta la giornata e si pubblica con un'azione sola."
        : "Le iscrizioni per questa giornata sono ancora aperte: puoi preparare la bozza da subito, le nuove iscrizioni ti verranno segnalate per inserirle a distanza.",
      action: "Genera il draw",
      onAction: () => {
        const orders = {};
        day.classes.forEach((c) => { orders[c.key] = suggestOrder(c.entries); });
        patchDay({ sub: "bozza", orders });
        setOpenClass(day.classes[0].key);
      },
      secondary: "Riapri le iscrizioni",
    };
    if (ds.sub === "pub") return {
      title: `Draw di ${day.full} pubblicato`,
      detail: "Visibile sulla pagina evento e in Le mie iscrizioni; la start list PDF è scaricabile.",
      action: "Vedi la pagina evento", onAction: () => {},
      secondary: "Riapri la bozza", onSecondary: () => patchDay({ sub: "bozza" }),
    };
    if (health.danger + health.warn > 0) {
      const parts = [];
      if (health.danger) parts.push(`${health.danger} ${health.danger === 1 ? "cavaliere sotto la distanza minima" : "cavalieri sotto la distanza minima"}`);
      if (health.warn) parts.push(`${health.warn} sotto l'obiettivo`);
      return {
        title: parts.join(" · "),
        detail: `Apri le classi segnate nell'indice, trascina le righe, o lascia fare al sistema: le classi già a posto non vengono toccate. Obiettivo ${TARGET_GAP}+, minimo ${MIN_GAP}.`,
        action: "Sistema la giornata", onAction: fixDay,
        secondary: "Pubblica comunque", onSecondary: () => setConfirmMode("conflicts"),
      };
    }
    if (health.pend > 0) {
      const where = day.classes.filter((c) => (ds.pending[c.key] || []).length > 0).map((c) => c.name).join(", ");
      return {
        title: `${health.pend} nuove iscrizioni da inserire — ${where}`,
        detail: "Arrivate dopo la preparazione della bozza. \"Inserisci a distanza\" le colloca rispettando i gap, senza toccare l'ordine che hai già lavorato.",
        action: "Inserisci a distanza",
        onAction: () => day.classes.forEach((c) => (ds.pending[c.key] || []).length && insertClass(c.key)),
        secondary: `Pubblica il draw di ${day.chip.toLowerCase()}`, onSecondary: () => setConfirmMode("pending"),
      };
    }
    return {
      title: health.limit > 0 ? "Ordine pronto — alcuni cavalieri restano al massimo possibile" : "Ordine pronto — tutti i cavalieri a distanza",
      detail: health.limit > 0
        ? "Con più cavalli dello stesso cavaliere su pochi partenti, la distanza obiettivo non è raggiungibile: quest'ordine è il migliore possibile (badge blu)."
        : "Pubblicando, l'ordine si congela: le iscrizioni tardive andranno in coda alla classe.",
      action: `Pubblica il draw di ${day.chip.toLowerCase()}`,
      onAction: () => (day.regClosed ? patchDay({ sub: "pub" }) : setConfirmMode("regsOpen")),
      secondary: prev && prev.dayKey === dayKey ? prevLabel : "Rigenera",
      onSecondary: prev && prev.dayKey === dayKey ? undo : () => {
        const orders = {}; day.classes.forEach((c) => { if (ds.orders[c.key]) orders[c.key] = suggestOrder(c.entries.concat(c.pending || []).filter((e) => ds.orders[c.key].includes(e.id))); });
        setOrders(orders, "Annulla la rigenerazione");
      },
    };
  };

  const CONFIRM = {
    conflicts: { text: () => `${health.danger > 0 ? `${health.danger} ${health.danger === 1 ? "cavaliere resta" : "cavalieri restano"} sotto la distanza minima.` : "Alcuni cavalieri restano sotto l'obiettivo."} Pubblichi lo stesso?`, btn: "Pubblica comunque", color: C.danger },
    pending: { text: () => `${health.pend} iscrizioni non ancora inserite andranno in coda alla classe. Pubblichi lo stesso?`, btn: "Pubblica comunque", color: C.warning },
    regsOpen: { text: () => "Le iscrizioni per questa giornata sono ancora aperte: le prossime andranno in coda alla classe. Pubblichi adesso?", btn: "Pubblica adesso", color: C.accent },
  };

  const next = stage === "draw" ? drawNext() : NEXT[stage];
  const Panel = PANELS[stage];

  return (
    <div style={{ minHeight: "100vh", background: C.slate50, color: C.ink, fontFamily: "-apple-system, 'Segoe UI', Roboto, sans-serif" }}>
      <div style={{ background: C.ink, color: C.white, padding: "14px 28px", display: "flex", alignItems: "center", gap: 16 }}>
        <strong style={{ fontSize: 16, letterSpacing: 0.2 }}>PenRunner — Organizzazione</strong>
        <span style={{ color: C.slate400, fontSize: 13 }}>Cremona Reining Club ASD</span>
        <span style={{ marginLeft: "auto", fontSize: 13, color: C.slate300 }}>marco@tonettimedia.com</span>
      </div>

      <div style={{ maxWidth: 1120, margin: "0 auto", padding: "28px 24px 64px" }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 14, flexWrap: "wrap" }}>
          <h1 style={{ fontSize: 26, margin: 0, letterSpacing: -0.3 }}>5ª tappa Lombardia Reining</h1>
          <span style={{ color: C.slate500, fontSize: 14 }}>25–30 agosto 2026 · Cremona Fiere · IRHA/FISE</span>
          {stage === "corsa" && (
            <span style={{ display: "inline-flex", alignItems: "center", gap: 6, color: C.live, fontSize: 13, fontWeight: 600 }}>
              <span style={{ width: 8, height: 8, borderRadius: 99, background: C.live }} /> IN DIRETTA
            </span>
          )}
        </div>

        {/* Spina dorsale */}
        <div style={{ marginTop: 26, background: C.white, border: `1px solid ${C.slate300}`, borderRadius: 12, overflow: "hidden" }}>
          <div style={{ display: "flex" }}>
            {STAGES.map((s, i) => {
              const done = i < idx, current = i === idx;
              return (
                <button key={s.id} onClick={() => setStage(s.id)}
                  style={{
                    flex: 1, padding: "14px 8px 12px", border: "none", cursor: "pointer",
                    background: current ? C.accent50 : C.white,
                    borderBottom: current ? `3px solid ${C.accent}` : "3px solid transparent",
                    borderRight: i < STAGES.length - 1 ? `1px solid ${C.slate100}` : "none",
                    color: done ? C.accent : current ? C.ink : C.slate400,
                    fontWeight: current ? 700 : 500, fontSize: 13,
                  }}>
                  <span style={{ display: "block", fontSize: 11, marginBottom: 2 }}>{done ? "✓" : current ? "●" : "○"}</span>
                  {s.label}
                </button>
              );
            })}
          </div>
          <div style={{ padding: "20px 24px", borderTop: `1px solid ${C.slate100}`, display: "flex", gap: 20, alignItems: "center", flexWrap: "wrap" }}>
            <div style={{ flex: "1 1 380px" }}>
              <div style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: 1, color: C.slate500, marginBottom: 4 }}>Prossimo passo</div>
              <div style={{ fontSize: 17, fontWeight: 700 }}>{next.title}</div>
              <div style={{ fontSize: 13.5, color: C.slate700, marginTop: 4, maxWidth: 560 }}>{next.detail}</div>
            </div>
            {stage === "draw" && confirmMode ? (
              <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                <span style={{ fontSize: 13, fontWeight: 600, color: CONFIRM[confirmMode].color }}>{CONFIRM[confirmMode].text()}</span>
                <button onClick={() => { patchDay({ sub: "pub" }); setConfirmMode(null); }}
                  style={{ background: CONFIRM[confirmMode].color, color: C.white, border: "none", borderRadius: 8, padding: "11px 18px", fontSize: 14, fontWeight: 600, cursor: "pointer" }}>{CONFIRM[confirmMode].btn}</button>
                <button onClick={() => setConfirmMode(null)}
                  style={{ background: C.white, color: C.slate700, border: `1px solid ${C.slate300}`, borderRadius: 8, padding: "11px 18px", fontSize: 14, cursor: "pointer" }}>Torna all'ordine</button>
              </div>
            ) : (
              <div style={{ display: "flex", gap: 10 }}>
                <button onClick={next.onAction}
                  style={{ background: C.accent, color: C.white, border: "none", borderRadius: 8, padding: "11px 18px", fontSize: 14, fontWeight: 600, cursor: "pointer" }}>{next.action}</button>
                <button onClick={next.onSecondary}
                  style={{ background: C.white, color: C.slate700, border: `1px solid ${C.slate300}`, borderRadius: 8, padding: "11px 18px", fontSize: 14, cursor: "pointer" }}>{next.secondary}</button>
              </div>
            )}
          </div>
        </div>

        {/* Stadio Draw: barra giornate sticky + pannello */}
        {stage === "draw" && (
          <div style={{ position: "sticky", top: 0, zIndex: 5, background: C.slate50, padding: "14px 0 10px", display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
            <div style={{ display: "flex", gap: 6, overflowX: "auto", paddingBottom: 2, maxWidth: "100%" }}>
              {DAYS.map((d) => {
                const h = dayHealth(d);
                const sel = d.key === dayKey;
                const dot = h.kind === "pre" ? C.slate300 : h.kind === "pub" ? C.accent
                  : h.danger > 0 ? C.danger : h.warn > 0 ? C.warning : h.pend > 0 ? C.info : C.accent;
                return (
                  <button key={d.key} onClick={() => switchDay(d.key)}
                    style={{
                      display: "inline-flex", alignItems: "center", gap: 7, whiteSpace: "nowrap", cursor: "pointer",
                      fontSize: 12.5, fontWeight: sel ? 700 : 500, color: sel ? C.ink : C.slate500,
                      background: C.white, border: `1px solid ${sel ? C.slate300 : C.slate100}`,
                      borderBottom: sel ? `3px solid ${C.accent}` : `3px solid transparent`,
                      borderRadius: 8, padding: "6px 12px",
                    }}>
                    {h.kind === "pub" ? <span style={{ color: C.accent, fontSize: 11 }}>✓</span> : <span style={{ width: 8, height: 8, borderRadius: 99, background: dot }} />}
                    {d.chip}
                  </button>
                );
              })}
            </div>
            {ds.sub === "bozza" && prev && prev.dayKey === dayKey && <LinkBtn onClick={undo}>↩ {prevLabel}</LinkBtn>}
            {ds.sub !== "pre" && (
              <span style={{ marginLeft: "auto", position: "relative", flex: "0 1 280px" }}>
                <input
                  value={query} onChange={(e) => setQuery(e.target.value)}
                  placeholder="Trova un binomio nella giornata"
                  style={{ width: "100%", boxSizing: "border-box", border: `1px solid ${C.slate300}`, borderRadius: 8, padding: "8px 30px 8px 12px", fontSize: 13, color: C.ink, background: C.white }}
                />
                {query && (
                  <button onClick={() => setQuery("")} title="Pulisci la ricerca"
                    style={{ position: "absolute", right: 6, top: "50%", transform: "translateY(-50%)", border: "none", background: "none", color: C.slate400, fontSize: 14, cursor: "pointer" }}>✕</button>
                )}
              </span>
            )}
          </div>
        )}

        {/* Pannelli contestuali dello stadio */}
        <div style={{ marginTop: stage === "draw" ? 4 : 20 }}>
          {stage === "draw"
            ? <PanelDraw
                day={day} sub={ds.sub} orders={ds.orders} pending={ds.pending}
                setOrders={setOrders} frozen={ds.sub === "pub"}
                openClass={openClass} setOpenClass={(k) => { setOpenClass(k); setFocus(null); }}
                query={query} setQuery={setQuery}
                highlightIds={highlightIds} focus={focus}
                onFixClass={fixClass} onInsertClass={insertClass}
              />
            : <Panel />}
        </div>

        <p style={{ marginTop: 22, fontSize: 12, color: C.slate400 }}>
          Prototipo di design — stadio Draw: cambia giornata dai chips (i giorni passati sono pubblicati, domenica è ancora da generare), apri le classi dall'indice, trascina, prova "Sistema la giornata", "Inserisci a distanza" sul Non Pro e la pubblicazione.
        </p>
      </div>
    </div>
  );
}
