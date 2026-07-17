import React, { useState } from "react";

// ---- Tokens (PenRunner Clean Pro) ----
const C = {
  accent: "#15803D", accent500: "#16A34A", accent50: "#DCFCE7", accentDim: "rgba(21,128,61,0.08)",
  ink: "#0F172A", ink900: "#0B1120",
  slate700: "#334155", slate500: "#64748B", slate400: "#94A3B8", slate300: "#CBD5E1",
  slate100: "#F1F5F9", slate50: "#F8FAFC", white: "#FFFFFF",
  warn: "#B45309", warnBg: "#FFF7ED", danger: "#B91C1C", info: "#1D4ED8", infoBg: "#EFF4FF",
  live: "#DC2626",
};

// ---- Dati reali: Pattern 9, IRHA Patternbook 2026 (da reference/patterns.json) ----
const PATTERN = {
  code: "9",
  name: "Pattern 9",
  season: 2026,
  entry: { gait: "walk_in", trot_in_mandatable: true, trot_imposed: true },
  classContext: { className: "Open L4 · Derby", event: "European Reining Championship", goRound: 1 },
  maneuvers: [
    { order: 1, types: ["rundown", "stop", "backup"], it: "Galoppare passando per il centro, oltrepassarlo, fare uno sliding stop. Back verso il centro dell'arena (almeno 3 m). Esitare." },
    { order: 2, types: ["spin"], it: "Completare 4 spin a destra. Esitare." },
    { order: 3, types: ["spin"], it: "Completare 4 spin e ¼ a sinistra — il cavallo termina con la testa rivolta al lato sinistro dell'arena. Esitare." },
    { order: 4, types: ["circles", "lead_change"], it: "Galoppo a mano sinistra: tre cerchi a sinistra — il primo piccolo e lento, poi due larghi e veloci. Cambio di galoppo al centro." },
    { order: 5, types: ["circles", "lead_change"], it: "Tre cerchi a mano destra — il primo piccolo e lento, poi due larghi e veloci. Cambio di galoppo al centro." },
    { order: 6, types: ["circles", "rundown", "rollback"], it: "Iniziare un cerchio a sinistra largo e veloce senza chiuderlo. Correre il lato lungo, oltre il marker mediano rollback a destra ad almeno 6 m dalla staccionata. Non esitare." },
    { order: 7, types: ["rundown", "rollback"], it: "Continuare sulla linea del cerchio senza chiuderlo. Correre il lato lungo opposto, oltre il marker mediano rollback a sinistra ad almeno 6 m. Non esitare." },
    { order: 8, types: ["rundown", "stop"], it: "Continuare sulla linea del cerchio senza chiuderlo. Correre il lato lungo, oltre il marker mediano sliding stop ad almeno 6 m. Esitare per mostrare la fine della prova." },
  ],
};

const TYPE_META = {
  rundown: { label: "Rundown", bg: "rgba(29,78,216,0.09)", fg: "#1D4ED8" },
  rollback: { label: "Rollback", bg: "rgba(180,83,9,0.10)", fg: "#B45309" },
  stop: { label: "Sliding stop", bg: "rgba(185,28,28,0.08)", fg: "#B91C1C" },
  backup: { label: "Back", bg: "rgba(100,116,139,0.12)", fg: "#475569" },
  spin: { label: "Spin", bg: "rgba(21,128,61,0.10)", fg: "#15803D" },
  circles: { label: "Cerchi", bg: "rgba(21,128,61,0.10)", fg: "#15803D" },
  lead_change: { label: "Cambio", bg: "rgba(29,78,216,0.09)", fg: "#1D4ED8" },
  figure_8: { label: "Figura 8", bg: "rgba(29,78,216,0.09)", fg: "#1D4ED8" },
};

export default function App() {
  const [checked, setChecked] = useState({});
  const p = PATTERN;
  const doneCount = Object.values(checked).filter(Boolean).length;

  return (
    <div style={{ fontFamily: "Inter, system-ui, sans-serif", background: C.slate50, minHeight: "100vh", color: C.ink }}>
      <div style={{ maxWidth: 640, margin: "0 auto" }}>

        {/* top bar */}
        <div style={{ background: C.ink900, padding: "13px 20px", display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ width: 25, height: 25, borderRadius: 7, background: C.accent, display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 800, fontSize: 14, color: "#fff" }}>P</div>
          <span style={{ fontSize: 14, fontWeight: 700, color: "#fff" }}>PenRunner</span>
          <span style={{ color: "#475569", fontSize: 13 }}>›</span>
          <span style={{ fontSize: 12.5, color: C.slate400, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{p.classContext.event}</span>
        </div>

        {/* header */}
        <div style={{ background: "#fff", borderBottom: "1px solid rgba(15,23,42,0.07)", padding: "22px 20px 18px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8, flexWrap: "wrap" }}>
            <span style={{ fontSize: 10.5, fontWeight: 600, background: C.accentDim, color: C.accent, padding: "3px 9px", borderRadius: 5 }}>{p.classContext.className}</span>
            <span style={{ fontSize: 12, color: C.slate400 }}>Go round {p.classContext.goRound} · Patternbook IRHA {p.season}</span>
          </div>
          <h1 style={{ fontSize: 27, fontWeight: 800, letterSpacing: "-0.6px", margin: "0 0 4px" }}>{p.name}</h1>
          <p style={{ fontSize: 13.5, color: C.slate500, margin: 0 }}>{p.maneuvers.length} manovre · la sequenza che ogni binomio esegue in questa classe.</p>
        </div>

        {/* entry rule */}
        <div style={{ padding: "16px 20px 0" }}>
          <div style={{ background: p.entry.trot_imposed ? C.warnBg : C.infoBg, border: `1px solid ${p.entry.trot_imposed ? "rgba(180,83,9,0.25)" : "rgba(29,78,216,0.18)"}`, borderRadius: 11, padding: "12px 15px", display: "flex", gap: 11 }}>
            <span style={{ fontSize: 15, color: p.entry.trot_imposed ? C.warn : C.info, fontWeight: 700, flexShrink: 0 }}>{p.entry.trot_imposed ? "!" : "◆"}</span>
            <div style={{ fontSize: 13, color: C.slate700, lineHeight: 1.55 }}>
              <b style={{ color: C.ink }}>Ingresso: {p.entry.trot_imposed ? "al trotto (imposto per questa classe)" : p.entry.gait === "walk_in" ? "al passo" : p.entry.gait === "trot_in" ? "al trotto" : "al galoppo"}</b><br />
              {p.entry.trot_imposed
                ? "Lo show management ha richiesto l'ingresso obbligatorio al trotto, come pubblicato nell'ordine di partenza. La mancata osservanza comporta score 0."
                : "Il cavallo atleta deve essere al passo o fermo prima di iniziare il pattern."}
            </div>
          </div>
        </div>

        {/* maneuvers list */}
        <div style={{ padding: "18px 20px 10px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 12 }}>
            <span style={{ fontSize: 14.5, fontWeight: 600 }}>La sequenza</span>
            <span style={{ fontSize: 11.5, color: C.slate400, fontVariantNumeric: "tabular-nums" }}>{doneCount > 0 ? `${doneCount}/${p.maneuvers.length} seguite` : "tocca una manovra per seguirla in diretta"}</span>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {p.maneuvers.map((m) => {
              const done = checked[m.order];
              return (
                <div key={m.order} onClick={() => setChecked((c) => ({ ...c, [m.order]: !c[m.order] }))}
                  style={{ background: "#fff", border: `1px solid ${done ? "rgba(21,128,61,0.35)" : "rgba(15,23,42,0.08)"}`, borderRadius: 12, padding: "13px 15px", cursor: "pointer", display: "flex", gap: 13, opacity: done ? 0.75 : 1, transition: "border-color 0.2s, opacity 0.2s" }}>
                  <div style={{ width: 28, height: 28, borderRadius: 8, flexShrink: 0, background: done ? C.accent : C.slate100, color: done ? "#fff" : C.slate500, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, fontWeight: 700, fontVariantNumeric: "tabular-nums", transition: "background 0.2s" }}>
                    {done ? "✓" : m.order}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: "flex", gap: 4, flexWrap: "wrap", marginBottom: 6 }}>
                      {m.types.map((t) => TYPE_META[t] ? (
                        <span key={t} style={{ fontSize: 10, fontWeight: 600, background: TYPE_META[t].bg, color: TYPE_META[t].fg, padding: "2px 8px", borderRadius: 4 }}>{TYPE_META[t].label}</span>
                      ) : null)}
                    </div>
                    <div style={{ fontSize: 13.5, color: C.slate700, lineHeight: 1.5, textDecoration: done ? "line-through" : "none", textDecorationColor: "rgba(15,23,42,0.25)" }}>{m.it}</div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* diagram note + actions */}
        <div style={{ padding: "8px 20px 30px" }}>
          <div style={{ background: C.slate100, borderRadius: 11, padding: "13px 15px", fontSize: 12.5, color: C.slate500, lineHeight: 1.55, marginBottom: 14 }}>
            Il diagramma ufficiale del pattern è nel Patternbook IRHA {p.season}, disponibile su <span style={{ color: C.info, fontWeight: 500 }}>irha.it</span>. I passi qui sopra sono la sequenza normativa completa.
          </div>
          <div style={{ display: "flex", gap: 9 }}>
            <button style={{ flex: 1, background: C.accent, color: "#fff", border: "none", borderRadius: 9, padding: "12px", fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}
              onClick={() => alert("Torna alla pagina evento con i live results della classe.")}>← Torna alla diretta</button>
            <button style={{ flex: 1, background: "#fff", color: C.slate700, border: "1px solid rgba(15,23,42,0.14)", borderRadius: 9, padding: "12px", fontSize: 13, fontWeight: 500, cursor: "pointer", fontFamily: "inherit" }}
              onClick={() => alert("Condivide il link pubblico di questa pagina pattern.")}>↗ Condividi pattern</button>
          </div>
        </div>
      </div>
    </div>
  );
}
