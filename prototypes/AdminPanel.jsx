import React, { useState, useEffect, useMemo, useRef } from "react";

// PenRunner — Admin Panel v2 (prototipo vincolante · uso interno TonettiMedia)
// Stadio servito: esercizio della piattaforma. Azione primaria: risolvere la coda di oggi.
// Concetto v2 (ratificato): keyboard-first come gli strumenti interni moderni —
//   1) sidebar scura + barra comando globale ⌘K (cerca eventi/persone/run, lancia azioni rapide)
//   2) home "Oggi" = triage con anzianità, non dashboard
//   3) pattern ispettore: ogni riga apre un pannello laterale, il contesto non si perde mai
//   4) correzione score dentro l'ispettore della run
//   5) registro a timeline filtrabile
// Regole applicate: contesto, niente codici a video, azioni distruttive con conferma inline
// e MOTIVO obbligatorio (mai modal), anatomia unica dello score (colonne fisse, scarti barrati,
// totale a destra), liste = finestra + ricerca, tokens di casa. Solo desktop, per scelta.

const C = {
  accent: "#15803D", accent500: "#16A34A", accent50: "#DCFCE7",
  ink: "#0F172A", ink900: "#0B1120", panel: "#141C2E", sideActive: "#1B2438",
  s700: "#334155", s500: "#64748B", s400: "#94A3B8", s300: "#CBD5E1", s100: "#F1F5F9", s50: "#F8FAFC",
  white: "#FFFFFF", warn: "#B45309", warnBg: "#FFFBEB", danger: "#B91C1C", live: "#DC2626",
};
const num = { fontVariantNumeric: "tabular-nums" };
const shadow = "0 1px 2px rgba(15,23,42,.06)";
const shadowLg = "0 18px 50px rgba(15,23,42,.25)";

/* ————————— dati d'esempio ————————— */
const STATS = [
  { v: "1", l: "evento live", s: "Censimento Show 5 · Cremona" },
  { v: "26", l: "iscrizioni oggi", s: "+9 rispetto a ieri" },
  { v: "14", l: "documenti · 24h", s: "ultimo generato alle 11:12" },
  { v: "2", l: "errori · 24h", s: "1 ancora in coda qui sotto", tone: "danger" },
];

const CODA_INIT = [
  { id: 1, sev: "alta", eta: "da 45 min", titolo: "Start list di sabato non generata — Lombardia Reining · 3ª tappa",
    dettaglio: "La generazione si è fermata alle 08:45. La segreteria aspetta il PDF.",
    azione: "Rigenera documento" },
  { id: 2, sev: "alta", eta: "da 3 ore", titolo: "Giudice E. Righetti: link d'accesso segnalato come scaduto",
    dettaglio: "Il link risulta usato da un altro dispositivo. L'evento inizia domani.",
    azione: "Genera nuovo link" },
  { id: 3, sev: "media", eta: "da 2 giorni", titolo: "Scuderia Quarter Valley non riceve l'email di verifica",
    dettaglio: "3 invii, nessuna apertura. Dominio: quartervalley.it",
    azione: "Reinvia verifica", secondaria: "Sblocca senza email" },
];

const EVENTI = [
  { id: 1, nome: "Censimento Show 5", luogo: "Cremona", date: "oggi", stato: "live", org: "ASD Censimento", binomi: 34,
    docs: [{ n: "Start list · sabato", ok: true, ora: "07:30" }, { n: "Classifica Rookie L1", ok: true, ora: "11:12" }] },
  { id: 2, nome: "Lombardia Reining · 3ª tappa", luogo: "Cremona Fiera", date: "12–14 settembre 2026", stato: "Iscrizioni", org: "Lombardia Reining", binomi: 21,
    docs: [{ n: "Start list · sabato", ok: false, ora: "08:45" }] },
  { id: 3, nome: "Estate Reining Show", luogo: "Manerbio", date: "20–22 giugno 2026", stato: "Conclusa", org: "ASD Manerbio Horses", binomi: 41,
    docs: [{ n: "Classifiche finali", ok: true, ora: "22 giu" }, { n: "Risultati CSV", ok: true, ora: "22 giu" }] },
];

const PERSONE = [
  { id: 1, nome: "Quarter Valley", tipo: "Scuderia", email: "info@quartervalley.it", stato: "Email non verificata da 6 giorni", problema: true },
  { id: 2, nome: "Lombardia Reining", tipo: "Organizzatore", email: "segreteria@lombardiareining.it", stato: "Attivo · ultimo accesso oggi 08:02" },
  { id: 3, nome: "Ferrari Sofia", tipo: "Cavaliere", email: "sofia.ferrari@…", stato: "Profilo reclamato · attivo" },
  { id: 4, nome: "Righetti Enrico", tipo: "Giudice", email: "—", stato: "Accesso via link di giornata · profilo non reclamato", giudice: true },
];

const RUNS = [
  { id: 1, cavallo: "Gun Smoke Whiz", cavaliere: "Rossi Martina", evento: "Censimento Show 5",
    classe: "Rookie · L1 L2", pattern: "Pattern 9", chiusa: "oggi · 11:12", totale: "210,5",
    giudici: [
      { g: "G1", v: "70,0" }, { g: "G2", v: "70,5" }, { g: "G3", v: "69,5", out: true },
      { g: "G4", v: "70,0" }, { g: "G5", v: "71,0", out: true },
    ],
    nota: "cinque giudici: si scartano il più alto e il più basso, il totale somma i tre restanti" },
];

const REGISTRO = [
  { quando: "oggi · 11:12", chi: "sistema", cosa: "Classifica Rookie L1 pubblicata", tipo: "documento" },
  { quando: "oggi · 09:31", chi: "Marco (admin)", cosa: "Verifica email sbloccata per ASD Manerbio Horses",
    motivo: "email aziendale bloccava il mittente, identità confermata al telefono", tipo: "verifica" },
  { quando: "ieri · 18:05", chi: "Sara (segreteria)", cosa: "Draw di sabato ri-pubblicato — Censimento Show 5", tipo: "evento" },
  { quando: "ieri · 16:40", chi: "Marco (admin)", cosa: "Start list rigenerata — Estate Reining Show", motivo: "logo sponsor aggiornato", tipo: "documento" },
];

const AZIONI_RAPIDE = [
  { k: "rigenera", label: "Rigenera l'ultimo documento fallito", hint: "Lombardia Reining · start list", target: { type: "evento", id: 2 } },
  { k: "sblocca", label: "Sblocca una verifica email", hint: "1 in attesa · Quarter Valley", target: { type: "persona", id: 1 } },
  { k: "link", label: "Genera un nuovo link giudice", hint: "E. Righetti · evento di domani", target: { type: "persona", id: 4 } },
];

/* ————————— atomi ————————— */
const Kbd = ({ children }) => (
  <span style={{ border: `1px solid ${C.s300}`, borderBottomWidth: 2, borderRadius: 6, padding: "1px 6px",
    fontSize: 11, color: C.s500, background: C.white, fontFamily: "inherit" }}>{children}</span>
);

const Chip = ({ children, tone = "mute" }) => {
  const map = {
    live: { bg: "#FEE2E2", fg: C.live }, ok: { bg: C.accent50, fg: C.accent },
    warn: { bg: "#FEF3C7", fg: C.warn }, mute: { bg: C.s100, fg: C.s500 },
  };
  const t = map[tone];
  return <span style={{ background: t.bg, color: t.fg, fontSize: 11, fontWeight: 700, padding: "3px 8px", borderRadius: 999, whiteSpace: "nowrap" }}>{children}</span>;
};

const Btn = ({ children, kind = "ghost", small, disabled, onClick, style }) => {
  const kinds = {
    primary: { background: C.accent, color: C.white, border: "1px solid transparent" },
    ghost: { background: C.white, color: C.s700, border: `1px solid ${C.s300}` },
    danger: { background: C.danger, color: C.white, border: "1px solid transparent" },
    dangerGhost: { background: C.white, color: C.danger, border: "1px solid #FCA5A5" },
  };
  return (
    <button onClick={disabled ? undefined : onClick}
      style={{ ...kinds[kind], borderRadius: 9, cursor: disabled ? "default" : "pointer", fontWeight: 600,
        fontSize: small ? 12.5 : 13.5, padding: small ? "6px 11px" : "9px 14px", opacity: disabled ? 0.45 : 1,
        fontFamily: "inherit", ...style }}>{children}</button>
  );
};

const Avatar = ({ nome }) => {
  const init = nome.split(" ").map(w => w[0]).slice(0, 2).join("").toUpperCase();
  return <div style={{ width: 34, height: 34, borderRadius: 999, background: C.s100, color: C.s700,
    display: "grid", placeItems: "center", fontSize: 12.5, fontWeight: 700, flexShrink: 0 }}>{init}</div>;
};

const Micro = ({ children, style }) => (
  <div style={{ fontSize: 11.5, letterSpacing: ".12em", textTransform: "uppercase", color: C.s500, fontWeight: 700, ...style }}>{children}</div>
);

/* ————————— barra comando + palette ————————— */
function CommandBar({ onOpen }) {
  return (
    <button onClick={onOpen} style={{ display: "flex", alignItems: "center", gap: 10, width: 460, textAlign: "left",
      background: C.white, border: `1px solid ${C.s300}`, borderRadius: 10, padding: "9px 14px", cursor: "pointer",
      color: C.s400, fontSize: 13.5, fontFamily: "inherit", boxShadow: shadow }}>
      <span style={{ fontSize: 14 }}>⌕</span>
      <span style={{ flex: 1 }}>Cerca o digita un comando…</span>
      <Kbd>⌘K</Kbd>
    </button>
  );
}

function Palette({ open, onClose, onPick }) {
  const [q, setQ] = useState("");
  const ref = useRef(null);
  useEffect(() => { if (open) { setQ(""); setTimeout(() => ref.current && ref.current.focus(), 30); } }, [open]);
  const ql = q.toLowerCase();
  const az = AZIONI_RAPIDE.filter(a => a.label.toLowerCase().includes(ql));
  const ev = EVENTI.filter(e => e.nome.toLowerCase().includes(ql));
  const pe = PERSONE.filter(p => p.nome.toLowerCase().includes(ql));
  const ru = RUNS.filter(r => (r.cavallo + " " + r.cavaliere).toLowerCase().includes(ql));
  if (!open) return null;
  const Row = ({ children, onClick, hint }) => (
    <div onClick={onClick} style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 14px",
      borderRadius: 9, cursor: "pointer", fontSize: 13.5, color: C.ink }}
      onMouseEnter={e => e.currentTarget.style.background = C.s100}
      onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
      <span style={{ flex: 1 }}>{children}</span>
      {hint && <span style={{ color: C.s400, fontSize: 12 }}>{hint}</span>}
      <span style={{ color: C.s400 }}>↵</span>
    </div>
  );
  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(11,17,32,.45)", zIndex: 50, paddingTop: "11vh" }}>
      <div onClick={e => e.stopPropagation()} style={{ width: 620, margin: "0 auto", background: C.white, borderRadius: 14, boxShadow: shadowLg, overflow: "hidden" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "14px 16px", borderBottom: `1px solid ${C.s100}` }}>
          <span style={{ color: C.s400 }}>⌕</span>
          <input ref={ref} value={q} onChange={e => setQ(e.target.value)} placeholder="Cerca eventi, persone, run — o un'azione…"
            style={{ flex: 1, border: "none", outline: "none", fontSize: 15, fontFamily: "inherit", color: C.ink }} />
          <Kbd>esc</Kbd>
        </div>
        <div style={{ padding: 8, maxHeight: 380, overflowY: "auto" }}>
          {az.length > 0 && <>
            <Micro style={{ padding: "8px 14px 4px" }}>Azioni rapide</Micro>
            {az.map(a => <Row key={a.k} hint={a.hint} onClick={() => onPick(a.target)}>⚡ {a.label}</Row>)}
          </>}
          {ev.length > 0 && <>
            <Micro style={{ padding: "8px 14px 4px" }}>Eventi</Micro>
            {ev.map(e => <Row key={e.id} hint={e.date} onClick={() => onPick({ type: "evento", id: e.id })}>{e.nome}</Row>)}
          </>}
          {pe.length > 0 && <>
            <Micro style={{ padding: "8px 14px 4px" }}>Persone e account</Micro>
            {pe.map(p => <Row key={p.id} hint={p.tipo} onClick={() => onPick({ type: "persona", id: p.id })}>{p.nome}</Row>)}
          </>}
          {ru.length > 0 && <>
            <Micro style={{ padding: "8px 14px 4px" }}>Run</Micro>
            {ru.map(r => <Row key={r.id} hint={`${r.classe} · ${r.totale}`} onClick={() => onPick({ type: "run", id: r.id })}>{r.cavallo} · {r.cavaliere}</Row>)}
          </>}
          {az.length + ev.length + pe.length + ru.length === 0 &&
            <div style={{ padding: "22px 14px", color: C.s400, fontSize: 13.5 }}>Nessun risultato per «{q}». Prova col nome dell'evento, del cavallo o della scuderia.</div>}
        </div>
      </div>
    </div>
  );
}

/* ————————— ispettore ————————— */
function Inspector({ target, onClose }) {
  const [motivo, setMotivo] = useState("");
  const [step, setStep] = useState(null);        // 'sblocco' | 'correzione' | null
  const [fatto, setFatto] = useState(null);      // esito registrato
  const [nuovo, setNuovo] = useState("69,5");
  const [rigenerati, setRigenerati] = useState([]);
  useEffect(() => { setMotivo(""); setStep(null); setFatto(null); setRigenerati([]); }, [target]);
  if (!target) return null;

  const Shell = ({ titolo, chips, sub, children }) => (
    <div style={{ position: "fixed", top: 0, right: 0, bottom: 0, width: 400, background: C.white,
      borderLeft: `1px solid ${C.s300}`, boxShadow: "-16px 0 40px rgba(15,23,42,.10)", zIndex: 40,
      display: "flex", flexDirection: "column" }}>
      <div style={{ padding: "18px 20px 14px", borderBottom: `1px solid ${C.s100}` }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <b style={{ fontSize: 16, color: C.ink, flex: 1 }}>{titolo}</b>
          {chips}
          <button onClick={onClose} style={{ border: "none", background: "none", cursor: "pointer", color: C.s400, fontSize: 16 }}>✕</button>
        </div>
        {sub && <div style={{ color: C.s500, fontSize: 12.5, marginTop: 4 }}>{sub}</div>}
      </div>
      <div style={{ padding: "16px 20px", overflowY: "auto", flex: 1 }}>{children}</div>
    </div>
  );

  /* — evento — */
  if (target.type === "evento") {
    const e = EVENTI.find(x => x.id === target.id);
    return (
      <Shell titolo={e.nome} sub={`${e.date} · ${e.luogo} · organizza ${e.org}`}
        chips={e.stato === "live" ? <Chip tone="live">● LIVE</Chip> : <Chip tone={e.stato === "Conclusa" ? "mute" : "ok"}>{e.stato}</Chip>}>
        <div style={{ display: "flex", gap: 18, marginBottom: 18 }}>
          <div><Micro>Binomi</Micro><div style={{ fontSize: 20, fontWeight: 800, ...num }}>{e.binomi}</div></div>
          <div><Micro>Documenti</Micro><div style={{ fontSize: 20, fontWeight: 800, ...num }}>{e.docs.length}</div></div>
        </div>
        <Micro style={{ marginBottom: 8 }}>Documenti</Micro>
        {e.docs.map((d, i) => {
          const ok = d.ok || rigenerati.includes(i);
          return (
            <div key={i} style={{ display: "flex", alignItems: "center", justifyContent: "space-between",
              padding: "9px 0", borderBottom: `1px solid ${C.s100}` }}>
              <div style={{ fontSize: 13.5, color: C.ink }}>{d.n}
                <div style={{ color: ok ? C.s400 : C.warn, fontSize: 12, ...num }}>{ok ? `generato · ${d.ora}` : `fermo dalle ${d.ora}`}</div>
              </div>
              {ok ? <Chip tone="ok">pronto</Chip>
                  : <Btn small kind="primary" onClick={() => setRigenerati([...rigenerati, i])}>Rigenera</Btn>}
            </div>
          );
        })}
        <div style={{ marginTop: 18 }}><Btn>Apri come organizzatore →</Btn></div>
      </Shell>
    );
  }

  /* — persona / account — */
  if (target.type === "persona") {
    const p = PERSONE.find(x => x.id === target.id);
    return (
      <Shell titolo={p.nome} chips={<Chip>{p.tipo}</Chip>} sub={p.email}>
        <Micro style={{ marginBottom: 6 }}>Stato</Micro>
        <div style={{ fontSize: 13.5, color: fatto ? C.s500 : (p.problema ? C.warn : C.s700), marginBottom: 18 }}>
          {fatto || p.stato}
        </div>

        {p.problema && !fatto && (
          <>
            <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
              <Btn small onClick={() => setFatto("Email di verifica reinviata poco fa · in registro")}>Reinvia l'email</Btn>
              <Btn small kind="dangerGhost" onClick={() => setStep("sblocco")}>Sblocca senza email</Btn>
            </div>
            {step === "sblocco" && (
              <div style={{ background: C.warnBg, border: "1px solid #FDE68A", borderRadius: 12, padding: "12px 14px" }}>
                <div style={{ fontSize: 12.5, color: C.warn, fontWeight: 600, marginBottom: 8 }}>
                  Stai attivando l'account senza verifica dell'indirizzo. Serve un motivo: finisce nel registro con il tuo nome.
                </div>
                <input value={motivo} onChange={e => setMotivo(e.target.value)}
                  placeholder="Motivo — es. identità confermata al telefono con il titolare"
                  style={{ width: "100%", padding: "8px 12px", border: `1px solid ${C.s300}`, borderRadius: 8, fontSize: 13, fontFamily: "inherit", marginBottom: 8 }} />
                <div style={{ display: "flex", gap: 8 }}>
                  <Btn small kind="danger" disabled={motivo.trim().length < 8}
                    onClick={() => { setFatto("Verifica sbloccata poco fa · in registro con motivo"); setStep(null); }}>Sblocca e registra</Btn>
                  <Btn small onClick={() => setStep(null)}>Annulla</Btn>
                </div>
              </div>
            )}
          </>
        )}

        {p.giudice && !fatto && (
          <Btn small kind="primary" onClick={() => setFatto("Nuovo link generato e inviato all'organizzatore · il precedente non vale più")}>
            Genera nuovo link d'accesso
          </Btn>
        )}
      </Shell>
    );
  }

  /* — run — */
  const r = RUNS.find(x => x.id === target.id);
  return (
    <Shell titolo={`${r.cavallo}`} sub={`${r.cavaliere} · ${r.evento} · ${r.classe} · ${r.pattern} · chiusa ${r.chiusa}`}>
      <div style={{ display: "flex", flexWrap: "wrap", rowGap: 10, alignItems: "end", ...num }}>
        {r.giudici.map((j, i) => (
          <div key={i} style={{ width: 64, textAlign: "right" }}>
            <div style={{ fontSize: 11, color: C.s400 }}>{j.g}</div>
            <div style={{ fontSize: 16, color: j.out ? C.s400 : C.ink, fontWeight: j.out ? 400 : 600,
              textDecoration: j.out ? "line-through" : "none" }}>
              {step === null && fatto && j.g === "G3" ? fatto.split("→")[1].trim() : j.v}
            </div>
          </div>
        ))}
      </div>
      <div style={{ textAlign: "right", marginTop: 8, ...num }}>
        <span style={{ fontSize: 11, color: C.s400, marginRight: 10 }}>TOTALE</span>
        <span style={{ fontSize: 26, fontWeight: 800, color: C.ink }}>{r.totale}</span>
      </div>
      <div style={{ color: C.s400, fontSize: 11.5, marginTop: 6, marginBottom: 16 }}>{r.nota}</div>

      {!step && !fatto && <Btn small kind="dangerGhost" onClick={() => setStep("correzione")}>Correggi uno score</Btn>}

      {step === "correzione" && (
        <div style={{ borderTop: `1px solid ${C.s100}`, paddingTop: 14 }}>
          <div style={{ fontSize: 12.5, color: C.danger, fontWeight: 600, marginBottom: 10 }}>
            La correzione è pubblica: ricalcola classifica e montepremi, e resta nel registro con il tuo nome e il motivo.
          </div>
          <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 8 }}>
            <span style={{ fontSize: 13, color: C.s700 }}>Score di <b>G3</b>:</span>
            <input value={nuovo} onChange={e => setNuovo(e.target.value)}
              style={{ width: 64, padding: "7px 10px", border: `1px solid ${C.s300}`, borderRadius: 8, fontSize: 14, textAlign: "right", fontFamily: "inherit", ...num }} />
          </div>
          <input value={motivo} onChange={e => setMotivo(e.target.value)}
            placeholder="Motivo — es. errore di trascrizione confermato dal giudice"
            style={{ width: "100%", padding: "8px 12px", border: `1px solid ${C.s300}`, borderRadius: 8, fontSize: 13, fontFamily: "inherit", marginBottom: 8 }} />
          <div style={{ display: "flex", gap: 8 }}>
            <Btn small kind="danger" disabled={motivo.trim().length < 8}
              onClick={() => { setFatto(`G3: 69,5 → ${nuovo}`); setStep(null); }}>Applica e registra</Btn>
            <Btn small onClick={() => setStep(null)}>Annulla</Btn>
          </div>
        </div>
      )}

      {fatto && (
        <div style={{ borderLeft: `3px solid ${C.danger}`, padding: "4px 12px", marginTop: 14 }}>
          <div style={{ fontSize: 13.5, color: C.ink, ...num }}>{fatto}</div>
          <div style={{ fontSize: 12, color: C.s500 }}>adesso · Marco (admin) · «{motivo}»</div>
        </div>
      )}
    </Shell>
  );
}

/* ————————— sezioni ————————— */
function Oggi({ coda, risolvi, apri }) {
  return (
    <>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 14, marginBottom: 26 }}>
        {STATS.map((s, i) => (
          <div key={i} style={{ background: C.white, border: `1px solid ${C.s300}`, borderRadius: 14, padding: "14px 16px", boxShadow: shadow }}>
            <div style={{ fontSize: 26, fontWeight: 800, color: s.tone === "danger" ? C.danger : C.ink, ...num }}>{s.v}</div>
            <Micro style={{ marginTop: 2 }}>{s.l}</Micro>
            <div style={{ color: C.s400, fontSize: 12, marginTop: 4 }}>{s.s}</div>
          </div>
        ))}
      </div>

      <div style={{ display: "flex", alignItems: "baseline", gap: 10, marginBottom: 10 }}>
        <Micro>Da risolvere</Micro>
        <span style={{ color: C.s400, fontSize: 12 }}>in ordine di urgenza</span>
      </div>

      {coda.length === 0 && (
        <div style={{ background: C.accent50, color: C.accent, borderRadius: 14, padding: 20, fontWeight: 600, fontSize: 14 }}>
          ✓ Coda vuota — niente richiede il tuo intervento.
        </div>
      )}

      {coda.map(s => (
        <div key={s.id} style={{ background: C.white, border: `1px solid ${C.s300}`,
          borderLeft: `4px solid ${s.sev === "alta" ? C.live : C.warn}`, borderRadius: 14,
          padding: "14px 16px", marginBottom: 10, boxShadow: shadow }}>
          <div style={{ display: "flex", gap: 12 }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 700, color: C.ink, fontSize: 14.5 }}>{s.titolo}</div>
              <div style={{ color: C.s500, fontSize: 13, marginTop: 3 }}>{s.dettaglio}</div>
            </div>
            <Chip tone={s.sev === "alta" ? "live" : "warn"}>{s.eta}</Chip>
          </div>
          <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
            <Btn small kind="primary" onClick={() => risolvi(s.id)}>{s.azione}</Btn>
            {s.secondaria && <Btn small onClick={() => apri({ type: "persona", id: 1 })}>{s.secondaria}</Btn>}
          </div>
        </div>
      ))}
    </>
  );
}

function ListaEventi({ apri, sel }) {
  const [q, setQ] = useState("");
  const lista = EVENTI.filter(e => e.nome.toLowerCase().includes(q.toLowerCase()));
  return (
    <>
      <input value={q} onChange={e => setQ(e.target.value)} placeholder="Filtra gli eventi…"
        style={{ width: 320, padding: "9px 14px", border: `1px solid ${C.s300}`, borderRadius: 10, fontSize: 13.5, fontFamily: "inherit", marginBottom: 14, background: C.white }} />
      <div style={{ background: C.white, border: `1px solid ${C.s300}`, borderRadius: 14, boxShadow: shadow, overflow: "hidden" }}>
        {lista.map((e, i) => (
          <div key={e.id} onClick={() => apri({ type: "evento", id: e.id })}
            style={{ display: "flex", alignItems: "center", gap: 14, padding: "13px 18px", cursor: "pointer",
              borderTop: i ? `1px solid ${C.s100}` : "none",
              background: sel && sel.type === "evento" && sel.id === e.id ? C.s50 : C.white }}>
            <div style={{ flex: 1 }}>
              <b style={{ fontSize: 14, color: C.ink }}>{e.nome}</b>
              <div style={{ color: C.s500, fontSize: 12.5, marginTop: 2 }}>{e.date} · {e.luogo} · {e.org}</div>
            </div>
            <span style={{ color: C.s500, fontSize: 13, ...num }}>{e.binomi} binomi</span>
            {e.stato === "live" ? <Chip tone="live">● LIVE</Chip> : <Chip tone={e.stato === "Conclusa" ? "mute" : "ok"}>{e.stato}</Chip>}
            <span style={{ color: C.s300 }}>›</span>
          </div>
        ))}
      </div>
    </>
  );
}

function ListaPersone({ apri, sel }) {
  const [q, setQ] = useState("");
  const lista = PERSONE.filter(p => (p.nome + p.tipo).toLowerCase().includes(q.toLowerCase()));
  return (
    <>
      <input value={q} onChange={e => setQ(e.target.value)} placeholder="Filtra scuderie, organizzatori, cavalieri, giudici…"
        style={{ width: 380, padding: "9px 14px", border: `1px solid ${C.s300}`, borderRadius: 10, fontSize: 13.5, fontFamily: "inherit", marginBottom: 14, background: C.white }} />
      <div style={{ background: C.white, border: `1px solid ${C.s300}`, borderRadius: 14, boxShadow: shadow, overflow: "hidden" }}>
        {lista.map((p, i) => (
          <div key={p.id} onClick={() => apri({ type: "persona", id: p.id })}
            style={{ display: "flex", alignItems: "center", gap: 14, padding: "12px 18px", cursor: "pointer",
              borderTop: i ? `1px solid ${C.s100}` : "none",
              background: sel && sel.type === "persona" && sel.id === p.id ? C.s50 : C.white }}>
            <Avatar nome={p.nome} />
            <div style={{ flex: 1 }}>
              <b style={{ fontSize: 14, color: C.ink }}>{p.nome}</b>
              <div style={{ color: p.problema ? C.warn : C.s500, fontSize: 12.5, marginTop: 2 }}>{p.stato}</div>
            </div>
            <Chip>{p.tipo}</Chip>
            <span style={{ color: C.s300 }}>›</span>
          </div>
        ))}
      </div>
    </>
  );
}

function Timeline() {
  const [f, setF] = useState("tutte");
  const tipi = [["tutte", "Tutte"], ["verifica", "Verifiche"], ["documento", "Documenti"], ["evento", "Eventi"]];
  const lista = REGISTRO.filter(a => f === "tutte" || a.tipo === f);
  return (
    <div style={{ maxWidth: 720 }}>
      <div style={{ display: "flex", gap: 8, marginBottom: 18 }}>
        {tipi.map(([k, label]) => (
          <button key={k} onClick={() => setF(k)}
            style={{ padding: "6px 13px", borderRadius: 999, fontSize: 12.5, fontWeight: 600, cursor: "pointer", fontFamily: "inherit",
              border: `1px solid ${f === k ? C.ink : C.s300}`, background: f === k ? C.ink : C.white, color: f === k ? C.white : C.s700 }}>
            {label}
          </button>
        ))}
      </div>
      <div style={{ position: "relative", paddingLeft: 22 }}>
        <div style={{ position: "absolute", left: 5, top: 6, bottom: 6, width: 2, background: C.s100 }} />
        {lista.map((a, i) => (
          <div key={i} style={{ position: "relative", marginBottom: 18 }}>
            <div style={{ position: "absolute", left: -22, top: 4, width: 12, height: 12, borderRadius: 999,
              background: C.white, border: `3px solid ${a.chi === "sistema" ? C.s300 : C.accent500}` }} />
            <div style={{ fontSize: 13.5, color: C.ink }}>{a.cosa}</div>
            <div style={{ fontSize: 12, color: C.s500, marginTop: 2, ...num }}>
              {a.quando} · {a.chi}{a.motivo ? <> · «{a.motivo}»</> : null}
            </div>
          </div>
        ))}
      </div>
      <div style={{ color: C.s400, fontSize: 12, marginTop: 6 }}>Il registro è solo-aggiunta: nessuna voce si modifica o si cancella.</div>
    </div>
  );
}

/* ————————— shell ————————— */
export default function AdminPanel() {
  const [sez, setSez] = useState("oggi");
  const [palette, setPalette] = useState(false);
  const [inspector, setInspector] = useState(null);
  const [coda, setCoda] = useState(CODA_INIT);

  useEffect(() => {
    const h = e => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") { e.preventDefault(); setPalette(p => !p); }
      if (e.key === "Escape") { setPalette(false); setInspector(null); }
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, []);

  const apri = t => { setInspector(t); setPalette(false); if (t.type === "evento") setSez("eventi"); if (t.type === "persona") setSez("persone"); };
  const risolvi = id => setCoda(coda.filter(s => s.id !== id));

  const NAV = [["oggi", "Oggi", coda.length], ["eventi", "Eventi", null], ["persone", "Persone", null], ["registro", "Registro", null]];
  const titoli = { oggi: "Oggi", eventi: "Eventi", persone: "Persone e account", registro: "Registro" };

  return (
    <div style={{ fontFamily: "'Inter','Segoe UI',system-ui,sans-serif", background: C.s50, minHeight: "100vh", display: "flex" }}>
      {/* sidebar */}
      <div style={{ width: 216, background: C.ink900, color: C.white, display: "flex", flexDirection: "column", padding: "18px 12px", position: "sticky", top: 0, height: "100vh" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 9, padding: "0 8px", marginBottom: 6 }}>
          <div style={{ width: 26, height: 26, borderRadius: 7, background: C.accent, display: "grid", placeItems: "center", fontWeight: 800, fontSize: 14 }}>P</div>
          <b style={{ fontSize: 14.5 }}>PenRunner</b>
        </div>
        <div style={{ color: C.s400, fontSize: 10, letterSpacing: ".16em", padding: "0 8px", marginBottom: 20 }}>AMMINISTRAZIONE</div>
        {NAV.map(([k, label, n]) => (
          <button key={k} onClick={() => setSez(k)}
            style={{ display: "flex", alignItems: "center", gap: 10, width: "100%", textAlign: "left", border: "none", cursor: "pointer",
              background: sez === k ? C.sideActive : "transparent", color: sez === k ? C.white : C.s400,
              borderRadius: 10, padding: "9px 12px", fontSize: 13.5, fontWeight: 600, fontFamily: "inherit", marginBottom: 2 }}>
            <span style={{ flex: 1 }}>{label}</span>
            {n > 0 && <span style={{ background: C.live, color: C.white, borderRadius: 999, fontSize: 11, fontWeight: 700, padding: "1px 7px", ...num }}>{n}</span>}
          </button>
        ))}
        <div style={{ flex: 1 }} />
        <div style={{ borderTop: "1px solid rgba(148,163,184,.18)", paddingTop: 12, padding: "12px 8px 0", color: C.s400, fontSize: 12 }}>
          Marco · TonettiMedia
        </div>
      </div>

      {/* canvas */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 16, padding: "16px 28px", borderBottom: `1px solid ${C.s300}`, background: C.white, position: "sticky", top: 0, zIndex: 10 }}>
          <b style={{ fontSize: 16, color: C.ink, width: 180 }}>{titoli[sez]}</b>
          <CommandBar onOpen={() => setPalette(true)} />
        </div>
        <div style={{ padding: "24px 28px", maxWidth: 980 }}>
          {sez === "oggi" && <Oggi coda={coda} risolvi={risolvi} apri={apri} />}
          {sez === "eventi" && <ListaEventi apri={apri} sel={inspector} />}
          {sez === "persone" && <ListaPersone apri={apri} sel={inspector} />}
          {sez === "registro" && <Timeline />}
        </div>
        <div style={{ padding: "0 28px 24px", color: C.s400, fontSize: 12, maxWidth: 980 }}>
          Ogni azione dell'amministrazione è firmata, motivata e finisce nel registro. Qui non esistono azioni silenziose.
        </div>
      </div>

      <Palette open={palette} onClose={() => setPalette(false)} onPick={apri} />
      <Inspector target={inspector} onClose={() => setInspector(null)} />
    </div>
  );
}
