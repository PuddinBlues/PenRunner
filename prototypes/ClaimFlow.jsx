import React, { useState } from "react";

// PenRunner — Prototipo "Claim" (cavaliere + giudice) · vincolante
// Stadio servito: passaggio di identità (Person → account autonomo).
// Azione primaria: reclamare il profilo senza attrito. "Un regalo, non una richiesta."
// Concetto ratificato: UNA macchina, DUE attori — stesso flusso in 4 momenti
// (Invito → Verifica leggera → Il tuo profilo → La casa), contenuti per attore.
// Mobile-first: il claim arriva via email e si apre dal telefono (frame 390px).
// Principio di spec: il claim non crea un profilo nuovo — consegna quello che esiste;
// nulla di ciò che scuderie e organizzatori hanno costruito va perso.
// Regole applicate: contesto, niente codici a video, sentence case, verde solo azioni,
// distruttive (scratch BR-17) con conferma inline e conseguenze dichiarate, tabular nums.
// Chrome del prototipo (toggle attore + passi) = solo collaudo, non fa parte del prodotto.

const C = {
  accent: "#15803D", accent500: "#16A34A", accent50: "#DCFCE7",
  ink: "#0F172A", ink900: "#0B1120",
  s700: "#334155", s500: "#64748B", s400: "#94A3B8", s300: "#CBD5E1", s100: "#F1F5F9", s50: "#F8FAFC",
  white: "#FFFFFF", warn: "#B45309", warnBg: "#FFFBEB", danger: "#B91C1C", gold: "#C8902F",
};
const num = { fontVariantNumeric: "tabular-nums" };

/* ————— contenuti per attore ————— */
const ATTORI = {
  cavaliere: {
    nome: "Sofia Ferrari", chi: "Cavaliere",
    invitoTitolo: "Quarter Valley ti ha iscritta alla 3ª tappa",
    invitoSotto: "Lombardia Reining · 12–14 settembre 2026 · Cremona Fiera",
    anteprima: [["2", "iscrizioni a tuo nome"], ["14", "run di storico"], ["sab", "i tuoi orari, appena escono"]],
    invitoNota: "Nessun obbligo: le iscrizioni valgono comunque. Il profilo è tuo quando lo vuoi.",
    email: "sofia.ferrari@gmail.com", emailBloccata: true,
    profilo: [
      { t: "Le tue iscrizioni alla 3ª tappa", d: "Rookie · L1 con Gun Smoke Whiz — fatte da Quarter Valley" },
      { t: "Il tuo storico", d: "14 run · miglior score 216,0 · da 3 stagioni" },
      { t: "I tuoi orari", d: "appena il draw è pubblico, li vedi qui e ti avvisiamo" },
      { t: "Il ritiro in autonomia", d: "se serve, ritiri da sola una run: senza telefonate" },
    ],
    profiloFirma: "Costruito da Quarter Valley e dagli organizzatori. Da oggi lo governi tu.",
  },
  giudice: {
    nome: "Enrico Righetti", chi: "Giudice",
    invitoTitolo: "Sei convocato come giudice — Censimento Show 5",
    invitoSotto: "ASD Censimento · questo weekend · Cremona",
    anteprima: [["8", "gare giudicate qui"], ["✓", "firma verificata sui documenti"], ["1", "convocazione attiva"]],
    invitoNota: "Per giudicare domani non serve: il link di giornata funziona comunque. Il profilo aggiunge il resto.",
    email: "", emailBloccata: false,
    profilo: [
      { t: "Le tue gare giudicate", d: "8 eventi a registro, con date e classi" },
      { t: "La convocazione di domani", d: "Censimento Show 5 · confermi la presenza con un tocco" },
      { t: "La firma verificata", d: "start list e classifiche portano il tuo nome, non un link volante" },
      { t: "L'accesso tuo", d: "entri con le tue credenziali: niente più link di giornata da chiedere" },
    ],
    profiloFirma: "Costruito dagli organizzatori che ti hanno convocato. Da oggi lo governi tu.",
  },
};

/* ————— atomi ————— */
const Btn = ({ children, kind = "primary", disabled, onClick, style }) => {
  const kinds = {
    primary: { background: C.accent, color: C.white, border: "1px solid transparent" },
    ghost: { background: C.white, color: C.s700, border: `1px solid ${C.s300}` },
    danger: { background: C.danger, color: C.white, border: "1px solid transparent" },
    dangerGhost: { background: C.white, color: C.danger, border: "1px solid #FCA5A5" },
  };
  return (
    <button onClick={disabled ? undefined : onClick}
      style={{ ...kinds[kind], width: "100%", borderRadius: 12, cursor: disabled ? "default" : "pointer",
        fontWeight: 700, fontSize: 15, padding: "13px 16px", opacity: disabled ? 0.45 : 1, fontFamily: "inherit", ...style }}>
      {children}
    </button>
  );
};

const Micro = ({ children, style }) => (
  <div style={{ fontSize: 11, letterSpacing: ".12em", textTransform: "uppercase", color: C.s500, fontWeight: 700, ...style }}>{children}</div>
);

const Wordmark = () => (
  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
    <div style={{ width: 24, height: 24, borderRadius: 6, background: C.accent, display: "grid", placeItems: "center", color: C.white, fontWeight: 800, fontSize: 13 }}>P</div>
    <b style={{ fontSize: 14, color: C.ink }}>PenRunner</b>
  </div>
);

/* ————— momento 1: l'invito (email) ————— */
function Invito({ a, avanti }) {
  return (
    <div style={{ padding: 20 }}>
      <div style={{ background: C.s50, border: `1px solid ${C.s100}`, borderRadius: 10, padding: "8px 12px", marginBottom: 16, fontSize: 12, color: C.s500 }}>
        Da <b style={{ color: C.s700 }}>PenRunner</b> · a {a.email || "te"} — così arriva l'email
      </div>
      <Wordmark />
      <h1 style={{ fontSize: 22, lineHeight: 1.25, color: C.ink, margin: "18px 0 6px", fontWeight: 800 }}>
        Ciao {a.nome.split(" ")[0]} — {a.invitoTitolo}
      </h1>
      <div style={{ color: C.s500, fontSize: 13.5, marginBottom: 18 }}>{a.invitoSotto}</div>

      <div style={{ background: C.white, border: `1px solid ${C.s300}`, borderRadius: 14, padding: "4px 16px", marginBottom: 8 }}>
        <div style={{ padding: "12px 0 8px" }}><Micro>Il tuo profilo ti aspetta</Micro></div>
        {a.anteprima.map(([v, l], i) => (
          <div key={i} style={{ display: "flex", alignItems: "baseline", gap: 12, padding: "10px 0", borderTop: i ? `1px solid ${C.s100}` : "none" }}>
            <div style={{ width: 40, textAlign: "right", fontSize: 18, fontWeight: 800, color: C.accent, ...num }}>{v}</div>
            <div style={{ fontSize: 14, color: C.ink }}>{l}</div>
          </div>
        ))}
      </div>
      <div style={{ color: C.s400, fontSize: 12.5, margin: "0 2px 18px" }}>{a.invitoNota}</div>

      <Btn onClick={avanti}>Apri il tuo profilo</Btn>
      <div style={{ textAlign: "center", color: C.s400, fontSize: 12, marginTop: 12 }}>Un minuto, una volta sola.</div>
    </div>
  );
}

/* ————— momento 2: verifica leggera ————— */
function Verifica({ a, avanti }) {
  const [email, setEmail] = useState(a.email);
  const [codice, setCodice] = useState("");
  const [pass, setPass] = useState("");
  const inviato = a.emailBloccata || codice.length > 0 || email.includes("@");
  const pronto = codice.trim().length === 6 && pass.length >= 8 && email.includes("@");
  return (
    <div style={{ padding: 20 }}>
      <Wordmark />
      <h1 style={{ fontSize: 22, color: C.ink, margin: "18px 0 6px", fontWeight: 800 }}>Sei tu, {a.nome.split(" ")[0]}?</h1>
      <div style={{ color: C.s500, fontSize: 13.5, marginBottom: 20 }}>
        Non ti chiediamo nulla che sappiamo già: solo la prova che questa email è tua.
      </div>

      <Micro style={{ marginBottom: 6 }}>La tua email</Micro>
      {a.emailBloccata ? (
        <div style={{ display: "flex", alignItems: "center", gap: 8, background: C.s50, border: `1px solid ${C.s100}`, borderRadius: 10, padding: "11px 14px", marginBottom: 16, fontSize: 14, color: C.s700 }}>
          {a.email} <span style={{ color: C.accent, fontSize: 12, fontWeight: 700 }}>· quella dell'invito</span>
        </div>
      ) : (
        <input value={email} onChange={e => setEmail(e.target.value)} placeholder="La tua email"
          style={{ width: "100%", padding: "11px 14px", border: `1px solid ${C.s300}`, borderRadius: 10, fontSize: 14, fontFamily: "inherit", marginBottom: 16 }} />
      )}

      <Micro style={{ marginBottom: 6 }}>Codice ricevuto per email</Micro>
      <input value={codice} onChange={e => setCodice(e.target.value.replace(/\D/g, "").slice(0, 6))} placeholder="6 cifre" inputMode="numeric"
        style={{ width: "100%", padding: "11px 14px", border: `1px solid ${C.s300}`, borderRadius: 10, fontSize: 18, letterSpacing: ".35em", fontFamily: "inherit", marginBottom: 4, ...num }} />
      <div style={{ color: C.s400, fontSize: 12, marginBottom: 16 }}>{inviato ? "Te l'abbiamo appena inviato. Vale 10 minuti." : " "}</div>

      <Micro style={{ marginBottom: 6 }}>Crea la tua password</Micro>
      <input type="password" value={pass} onChange={e => setPass(e.target.value)} placeholder="Almeno 8 caratteri"
        style={{ width: "100%", padding: "11px 14px", border: `1px solid ${C.s300}`, borderRadius: 10, fontSize: 14, fontFamily: "inherit", marginBottom: 20 }} />

      <Btn disabled={!pronto} onClick={avanti}>Conferma e continua</Btn>
      <div style={{ textAlign: "center", color: C.s400, fontSize: 12, marginTop: 12 }}>Niente moduli anagrafici: i tuoi dati esistono già.</div>
    </div>
  );
}

/* ————— momento 3: il tuo profilo ————— */
function TuoProfilo({ a, avanti }) {
  return (
    <div style={{ padding: 20 }}>
      <div style={{ width: 52, height: 52, borderRadius: 999, background: C.accent50, color: C.accent, display: "grid", placeItems: "center", fontSize: 24, margin: "10px auto 14px" }}>✓</div>
      <h1 style={{ fontSize: 22, color: C.ink, margin: "0 0 4px", fontWeight: 800, textAlign: "center" }}>Ecco cosa è già tuo</h1>
      <div style={{ color: C.s500, fontSize: 13.5, marginBottom: 18, textAlign: "center" }}>Niente da compilare. Solo da ricevere.</div>

      {a.profilo.map((r, i) => (
        <div key={i} style={{ display: "flex", gap: 12, background: C.white, border: `1px solid ${C.s300}`, borderRadius: 14, padding: "13px 15px", marginBottom: 10 }}>
          <div style={{ width: 26, height: 26, borderRadius: 999, background: C.accent50, color: C.accent, display: "grid", placeItems: "center", fontSize: 13, fontWeight: 800, flexShrink: 0 }}>✓</div>
          <div>
            <div style={{ fontWeight: 700, fontSize: 14.5, color: C.ink }}>{r.t}</div>
            <div style={{ color: C.s500, fontSize: 13, marginTop: 2 }}>{r.d}</div>
          </div>
        </div>
      ))}

      <div style={{ color: C.s400, fontSize: 12.5, textAlign: "center", margin: "14px 8px 18px" }}>{a.profiloFirma}</div>
      <Btn onClick={avanti}>Entra</Btn>
    </div>
  );
}

/* ————— momento 4: la casa ————— */
function CasaCavaliere() {
  const [scratch, setScratch] = useState(null); // null | 'chiede' | 'fatto'
  return (
    <div style={{ padding: 20 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
        <Wordmark />
        <div style={{ width: 30, height: 30, borderRadius: 999, background: C.s100, color: C.s700, display: "grid", placeItems: "center", fontSize: 12, fontWeight: 700 }}>SF</div>
      </div>

      <div style={{ background: C.ink900, color: C.white, borderRadius: 16, padding: "16px 18px", marginBottom: 16 }}>
        <Micro style={{ color: C.s400 }}>La tua prossima run</Micro>
        <div style={{ fontSize: 17, fontWeight: 800, marginTop: 6 }}>Rookie · L1 — Gun Smoke Whiz</div>
        <div style={{ color: C.s400, fontSize: 13, marginTop: 4, ...num }}>sabato · intorno alle 11:20 · Pattern 9 · draw n. 12</div>
      </div>

      <Micro style={{ marginBottom: 8 }}>Le mie iscrizioni · 3ª tappa</Micro>
      <div style={{ background: C.white, border: `1px solid ${C.s300}`, borderRadius: 14, overflow: "hidden", marginBottom: 8 }}>
        <div style={{ padding: "13px 15px", display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 700, fontSize: 14.5, color: C.ink }}>Rookie · L1 — Gun Smoke Whiz</div>
            <div style={{ color: scratch === "fatto" ? C.s400 : C.s500, fontSize: 12.5, marginTop: 2 }}>
              {scratch === "fatto" ? "Ritirata poco fa · la scuderia è avvisata" : "iscritta da Quarter Valley · quota 80 €"}
            </div>
          </div>
          {scratch === null && (
            <button onClick={() => setScratch("chiede")}
              style={{ border: "1px solid #FCA5A5", color: C.danger, background: C.white, borderRadius: 9, padding: "7px 12px", fontSize: 12.5, fontWeight: 600, fontFamily: "inherit" }}>
              Ritira
            </button>
          )}
        </div>
        {scratch === "chiede" && (
          <div style={{ borderTop: `1px solid ${C.s100}`, background: C.warnBg, padding: "12px 15px" }}>
            <div style={{ fontSize: 13, color: C.warn, fontWeight: 600, marginBottom: 10 }}>
              Ritiri questa run? Il posto in draw resta vuoto e, da regolamento, la quota è comunque dovuta. Scuderia e segreteria vengono avvisate.
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <Btn kind="danger" style={{ padding: "10px 14px", fontSize: 13.5 }} onClick={() => setScratch("fatto")}>Ritira la run</Btn>
              <Btn kind="ghost" style={{ padding: "10px 14px", fontSize: 13.5 }} onClick={() => setScratch(null)}>Annulla</Btn>
            </div>
          </div>
        )}
      </div>
      <div style={{ color: C.s400, fontSize: 12, marginBottom: 18 }}>Puoi ritirarti da sola fino al tuo turno: senza telefonate.</div>

      <Micro style={{ marginBottom: 8 }}>Il tuo storico</Micro>
      <div style={{ display: "flex", gap: 10 }}>
        {[["14", "run"], ["216,0", "miglior score"], ["3", "stagioni"]].map(([v, l], i) => (
          <div key={i} style={{ flex: 1, background: C.white, border: `1px solid ${C.s300}`, borderRadius: 14, padding: "12px 8px", textAlign: "center" }}>
            <div style={{ fontSize: 18, fontWeight: 800, color: C.ink, ...num }}>{v}</div>
            <div style={{ color: C.s500, fontSize: 11.5, marginTop: 2 }}>{l}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

function CasaGiudice() {
  const [conf, setConf] = useState(false);
  return (
    <div style={{ padding: 20 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
        <Wordmark />
        <div style={{ width: 30, height: 30, borderRadius: 999, background: C.s100, color: C.s700, display: "grid", placeItems: "center", fontSize: 12, fontWeight: 700 }}>ER</div>
      </div>

      <div style={{ background: C.ink900, color: C.white, borderRadius: 16, padding: "16px 18px", marginBottom: 8 }}>
        <Micro style={{ color: C.s400 }}>Convocazione</Micro>
        <div style={{ fontSize: 17, fontWeight: 800, marginTop: 6 }}>Censimento Show 5 · domani</div>
        <div style={{ color: C.s400, fontSize: 13, marginTop: 4 }}>Cremona · giuria da 3 · organizza ASD Censimento</div>
        {!conf
          ? <Btn style={{ marginTop: 14, padding: "11px 14px", fontSize: 14 }} onClick={() => setConf(true)}>Confermo la presenza</Btn>
          : <div style={{ marginTop: 14, background: "rgba(22,163,74,.18)", color: "#86EFAC", borderRadius: 10, padding: "10px 14px", fontSize: 13.5, fontWeight: 700 }}>✓ Presenza confermata — l'organizzatore lo vede</div>}
      </div>
      <div style={{ color: C.s400, fontSize: 12, marginBottom: 18 }}>Da oggi entri con le tue credenziali: il link di giornata non serve più.</div>

      <Micro style={{ marginBottom: 8 }}>Le tue gare giudicate</Micro>
      <div style={{ background: C.white, border: `1px solid ${C.s300}`, borderRadius: 14, overflow: "hidden", marginBottom: 14 }}>
        {[["Estate Reining Show", "giugno 2026 · 41 binomi"], ["4ª tappa Lombardia", "maggio 2026 · 28 binomi"], ["Winter Classic", "febbraio 2026 · 33 binomi"]].map(([t, d], i) => (
          <div key={i} style={{ padding: "12px 15px", borderTop: i ? `1px solid ${C.s100}` : "none" }}>
            <div style={{ fontWeight: 700, fontSize: 14, color: C.ink }}>{t}</div>
            <div style={{ color: C.s500, fontSize: 12.5, marginTop: 2, ...num }}>{d}</div>
          </div>
        ))}
      </div>
      <div style={{ background: C.accent50, color: C.accent, borderRadius: 12, padding: "11px 14px", fontSize: 13, fontWeight: 600 }}>
        Start list e classifiche portano il tuo nome verificato.
      </div>
    </div>
  );
}

/* ————— shell di collaudo ————— */
export default function ClaimFlow() {
  const [attore, setAttore] = useState("cavaliere");
  const [step, setStep] = useState(0);
  const a = ATTORI[attore];
  const PASSI = ["L'invito", "Verifica", "Il tuo profilo", "La casa"];
  const cambia = k => { setAttore(k); setStep(0); };

  return (
    <div style={{ fontFamily: "'Inter','Segoe UI',system-ui,sans-serif", background: C.s100, minHeight: "100vh", padding: "26px 12px" }}>
      {/* chrome di collaudo */}
      <div style={{ maxWidth: 420, margin: "0 auto 14px" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
          <Micro>Claim — una macchina, due attori</Micro>
          <div style={{ display: "flex", background: C.white, border: `1px solid ${C.s300}`, borderRadius: 999, padding: 3 }}>
            {[["cavaliere", "Cavaliere"], ["giudice", "Giudice"]].map(([k, l]) => (
              <button key={k} onClick={() => cambia(k)}
                style={{ border: "none", cursor: "pointer", borderRadius: 999, padding: "5px 12px", fontSize: 12, fontWeight: 700, fontFamily: "inherit",
                  background: attore === k ? C.ink : "transparent", color: attore === k ? C.white : C.s500 }}>{l}</button>
            ))}
          </div>
        </div>
        <div style={{ display: "flex", gap: 6 }}>
          {PASSI.map((p, i) => (
            <button key={i} onClick={() => setStep(i)}
              style={{ flex: 1, border: "none", cursor: "pointer", fontFamily: "inherit", background: "none", padding: 0 }}>
              <div style={{ height: 4, borderRadius: 999, background: i <= step ? C.accent : C.s300, marginBottom: 4 }} />
              <div style={{ fontSize: 10.5, color: i === step ? C.ink : C.s400, fontWeight: i === step ? 700 : 500 }}>{p}</div>
            </button>
          ))}
        </div>
      </div>

      {/* telefono */}
      <div style={{ maxWidth: 420, margin: "0 auto", background: C.s50, border: `1px solid ${C.s300}`, borderRadius: 26,
        boxShadow: "0 20px 50px rgba(15,23,42,.14)", overflow: "hidden", minHeight: 640 }}>
        {step === 0 && <Invito a={a} avanti={() => setStep(1)} />}
        {step === 1 && <Verifica a={a} avanti={() => setStep(2)} />}
        {step === 2 && <TuoProfilo a={a} avanti={() => setStep(3)} />}
        {step === 3 && (attore === "cavaliere" ? <CasaCavaliere /> : <CasaGiudice />)}
      </div>

      <div style={{ maxWidth: 420, margin: "14px auto 0", color: C.s400, fontSize: 12, textAlign: "center" }}>
        Il claim non crea un profilo nuovo: consegna quello che esiste. Nulla di ciò che scuderie e organizzatori hanno costruito va perso.
      </div>
    </div>
  );
}
