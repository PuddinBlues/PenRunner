import React, { useState, useMemo, useEffect } from "react";

// ---- Design tokens (PenRunner Clean Pro) ----
const C = {
  accent: "#15803D", accent50: "#DCFCE7", accentDim: "rgba(21,128,61,0.08)",
  ink: "#0F172A", slate700: "#334155", slate500: "#64748B", slate400: "#94A3B8",
  slate300: "#CBD5E1", slate100: "#F1F5F9", slate50: "#F8FAFC", white: "#FFFFFF",
  warn: "#B45309", warnBg: "rgba(180,83,9,0.10)", danger: "#B91C1C",
  info: "#1D4ED8", infoBg: "rgba(29,78,216,0.08)",
};
const FEE = 15;

// ---- Reference data ----
const CLASSES = [
  { id: "open_l4", label: "Open L4", fee: 75, group: "open" },
  { id: "open_l3", label: "Open L3", fee: 65, group: "open" },
  { id: "open_l2", label: "Open L2", fee: 55, group: "open" },
  { id: "nonpro", label: "Non Pro", fee: 60, group: "nonpro" },
  { id: "ltd_nonpro", label: "Limited NP", fee: 50, group: "nonpro" },
  { id: "novice", label: "Novice Horse", fee: 55, group: "open" },
  { id: "youth", label: "Youth", fee: 40, group: "youth" },
  { id: "green", label: "Green", fee: 35, group: "green" },
];
const classFee = (id) => CLASSES.find((c) => c.id === id)?.fee ?? 0;
const classLabel = (id) => CLASSES.find((c) => c.id === id)?.label ?? id;
const classGroup = (id) => CLASSES.find((c) => c.id === id)?.group ?? "open";
const GROUP_COLOR = {
  open: { bg: "rgba(21,128,61,0.10)", fg: "#15803D" },
  nonpro: { bg: "rgba(29,78,216,0.08)", fg: "#1D4ED8" },
  youth: { bg: "rgba(180,83,9,0.10)", fg: "#B45309" },
  green: { bg: "rgba(100,116,139,0.12)", fg: "#475569" },
};

// Stable's horses (roster) — what a scuderia would pick from
const ROSTER = [
  { id: "h1", name: "MC Millenium Falcon", chip: "·0172", rider: "M. Cortesi" },
  { id: "h2", name: "Gold In O Gun", chip: "·0288", rider: "C. Baldelli" },
  { id: "h3", name: "Chic N Tinsel", chip: "·0341", rider: "G. Rossi" },
  { id: "h4", name: "Spook Sunburst", chip: "·0455", rider: "M. Ruggeri" },
  { id: "h5", name: "Hollywood Reminy", chip: "·0512", rider: "M. Cosio" },
  { id: "h6", name: "Late Little Whiz", chip: "·0639", rider: "S. Galimberti" },
  { id: "h7", name: "Gun Spark Hollywood", chip: "·0744", rider: "R. Sudati" },
];
const RIDERS = ["M. Cortesi", "C. Baldelli", "G. Rossi", "M. Ruggeri", "M. Cosio", "S. Galimberti", "R. Sudati"];

const euro = (n) => "€" + n.toLocaleString("it-IT");

export default function App() {
  // entries: { uid, horseId, name, chip, rider, classes:[ids] }
  const [entries, setEntries] = useState([
    { uid: 1, horseId: "h1", name: "MC Millenium Falcon", chip: "·0172", rider: "M. Cortesi", classes: ["open_l4", "open_l3"] },
    { uid: 2, horseId: "h2", name: "Gold In O Gun", chip: "·0288", rider: "C. Baldelli", classes: ["open_l2"] },
  ]);
  const [picker, setPicker] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [classMenuFor, setClassMenuFor] = useState(null); // uid
  const nextUid = React.useRef(3);

  const addHorse = (h) => {
    setEntries((e) => [...e, { uid: nextUid.current++, horseId: h.id, name: h.name, chip: h.chip, rider: h.rider, classes: [] }]);
    setPicker(false);
  };
  const removeEntry = (uid) => setEntries((e) => e.filter((x) => x.uid !== uid));
  const setRider = (uid, rider) => setEntries((e) => e.map((x) => (x.uid === uid ? { ...x, rider } : x)));
  const toggleClass = (uid, cid) =>
    setEntries((e) =>
      e.map((x) => {
        if (x.uid !== uid) return x;
        const has = x.classes.includes(cid);
        return { ...x, classes: has ? x.classes.filter((c) => c !== cid) : [...x.classes, cid] };
      })
    );

  const usedHorseIds = entries.map((e) => e.horseId);
  const availableRoster = ROSTER.filter((h) => !usedHorseIds.includes(h.id));

  // ---- live totals ----
  const totals = useMemo(() => {
    const horses = entries.length;
    const enrollments = entries.reduce((s, e) => s + e.classes.length, 0);
    const classesCost = entries.reduce((s, e) => s + e.classes.reduce((ss, c) => ss + classFee(c), 0), 0);
    const fee = horses * FEE;
    return { horses, enrollments, classesCost, fee, total: classesCost + fee };
  }, [entries]);

  const incomplete = entries.filter((e) => e.classes.length === 0).length;
  const canConfirm = totals.horses > 0 && incomplete === 0;

  if (confirmed) return <Success entries={entries} totals={totals} onBack={() => setConfirmed(false)} />;

  return (
    <div style={{ fontFamily: "Inter, system-ui, sans-serif", background: C.slate50, minHeight: "100vh", color: C.ink }}>
      {/* top bar */}
      <div style={{ background: C.ink, padding: "12px 24px", display: "flex", alignItems: "center", gap: 11 }}>
        <div style={{ width: 26, height: 26, borderRadius: 7, background: C.accent, display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 800, fontSize: 14, color: "#fff" }}>P</div>
        <span style={{ fontSize: 15, fontWeight: 700, color: "#fff", letterSpacing: "-0.3px" }}>PenRunner</span>
        <ChevR />
        <span style={{ fontSize: 13, color: C.slate400 }}>Lombardia Reining · 2ª tappa</span>
        <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 8 }}>
          <div style={{ width: 26, height: 26, borderRadius: "50%", background: "rgba(21,128,61,0.2)", color: "#86EFAC", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 600 }}>23</div>
          <span style={{ fontSize: 12, color: C.slate300 }}>Scuderia 23QH</span>
        </div>
      </div>

      <div style={{ maxWidth: 1180, margin: "0 auto", padding: "24px", display: "grid", gridTemplateColumns: "1fr 320px", gap: 20, alignItems: "start" }}>
        {/* LEFT: grid */}
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
            <Badge bg={C.accentDim} fg={C.accent}>Regionale</Badge>
            <span style={{ fontSize: 12.5, color: C.slate500 }}>12 Apr 2026 · iscrizioni aperte</span>
          </div>
          <h1 style={{ fontSize: 22, fontWeight: 700, letterSpacing: "-0.4px", margin: "2px 0 2px" }}>Iscrizione scuderia</h1>
          <p style={{ fontSize: 13.5, color: C.slate500, margin: "0 0 16px" }}>Aggiungi i binomi e assegna le classi. Il totale a destra si aggiorna in tempo reale.</p>

          <div style={{ background: C.white, border: `1px solid rgba(15,23,42,0.08)`, borderRadius: 12, overflow: "visible" }}>
            {/* header */}
            <div style={{ display: "grid", gridTemplateColumns: "1.5fr 1.2fr 1.7fr 78px 36px", gap: 0, background: C.slate100, padding: "10px 16px", fontSize: 11, fontWeight: 600, color: C.slate500, textTransform: "uppercase", letterSpacing: "0.4px", borderRadius: "12px 12px 0 0" }}>
              <div>Cavallo</div><div>Cavaliere</div><div>Classi</div><div style={{ textAlign: "right" }}>Costo</div><div />
            </div>

            {entries.length === 0 && (
              <div style={{ padding: "36px 16px", textAlign: "center", color: C.slate400, fontSize: 13.5 }}>
                Nessun binomio ancora. Aggiungi il primo cavallo per iniziare.
              </div>
            )}

            {entries.map((e, i) => {
              const cost = e.classes.reduce((s, c) => s + classFee(c), 0);
              const empty = e.classes.length === 0;
              return (
                <div key={e.uid} style={{ display: "grid", gridTemplateColumns: "1.5fr 1.2fr 1.7fr 78px 36px", gap: 0, padding: "12px 16px", alignItems: "center", borderTop: "1px solid rgba(15,23,42,0.05)", background: i % 2 ? "#FAFBFC" : C.white }}>
                  {/* horse */}
                  <div>
                    <div style={{ fontSize: 13.5, fontWeight: 600 }}>{e.name}</div>
                    <div style={{ fontSize: 11, color: C.slate400 }}>microchip {e.chip}</div>
                  </div>
                  {/* rider */}
                  <div>
                    <select value={e.rider} onChange={(ev) => setRider(e.uid, ev.target.value)}
                      style={{ width: "92%", height: 32, border: `1px solid rgba(15,23,42,0.14)`, borderRadius: 7, fontSize: 12.5, color: C.slate700, padding: "0 6px", background: "#fff", fontFamily: "inherit", cursor: "pointer" }}>
                      {RIDERS.map((r) => <option key={r}>{r}</option>)}
                    </select>
                  </div>
                  {/* classes */}
                  <div style={{ position: "relative" }}>
                    <div style={{ display: "flex", gap: 4, flexWrap: "wrap", alignItems: "center" }}>
                      {e.classes.map((cid) => {
                        const g = GROUP_COLOR[classGroup(cid)];
                        return (
                          <span key={cid} onClick={() => toggleClass(e.uid, cid)} title="Rimuovi"
                            style={{ fontSize: 10.5, fontWeight: 600, background: g.bg, color: g.fg, padding: "3px 8px", borderRadius: 5, cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 4 }}>
                            {classLabel(cid)} <span style={{ opacity: 0.6, fontSize: 11 }}>×</span>
                          </span>
                        );
                      })}
                      <button onClick={() => setClassMenuFor(classMenuFor === e.uid ? null : e.uid)}
                        style={{ fontSize: 11, fontWeight: 600, color: empty ? C.warn : C.accent, background: empty ? C.warnBg : "transparent", border: empty ? "none" : `1px dashed rgba(21,128,61,0.4)`, borderRadius: 5, padding: "3px 9px", cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 3 }}>
                        + {empty ? "assegna classe" : "classe"}
                      </button>
                    </div>
                    {classMenuFor === e.uid && (
                      <ClassMenu selected={e.classes} onPick={(cid) => toggleClass(e.uid, cid)} onClose={() => setClassMenuFor(null)} />
                    )}
                  </div>
                  {/* cost */}
                  <div style={{ textAlign: "right", fontSize: 13, fontWeight: 600, fontVariantNumeric: "tabular-nums" }}>{cost ? euro(cost) : <span style={{ color: C.slate300 }}>—</span>}</div>
                  {/* delete */}
                  <div style={{ textAlign: "center" }}>
                    <button onClick={() => removeEntry(e.uid)} title="Rimuovi binomio"
                      style={{ background: "none", border: "none", cursor: "pointer", color: C.slate300, fontSize: 16, lineHeight: 1, padding: 4 }}
                      onMouseEnter={(ev) => (ev.currentTarget.style.color = C.danger)}
                      onMouseLeave={(ev) => (ev.currentTarget.style.color = C.slate300)}>⌫</button>
                  </div>
                </div>
              );
            })}

            {/* add row */}
            <div style={{ padding: "11px 16px", borderTop: "1px solid rgba(15,23,42,0.05)", display: "flex", alignItems: "center", gap: 10, borderRadius: "0 0 12px 12px", position: "relative" }}>
              <button onClick={() => setPicker(!picker)} style={{ display: "flex", alignItems: "center", gap: 7, background: "none", border: "none", cursor: "pointer", padding: 0 }}>
                <span style={{ width: 24, height: 24, borderRadius: 6, background: C.accentDim, display: "flex", alignItems: "center", justifyContent: "center", color: C.accent, fontSize: 16, fontWeight: 700 }}>+</span>
                <span style={{ fontSize: 13, fontWeight: 600, color: C.accent }}>Aggiungi binomio</span>
              </button>
              <span style={{ fontSize: 12, color: C.slate400 }}>oppure</span>
              <button style={{ fontSize: 12, fontWeight: 500, color: C.slate500, background: "none", border: "none", cursor: "pointer", display: "flex", alignItems: "center", gap: 4 }}
                onClick={() => alert("Import CSV: in un evento reale apre il caricamento di un file con i binomi della scuderia.") }>↑ importa da CSV</button>

              {picker && <HorsePicker roster={availableRoster} onPick={addHorse} onClose={() => setPicker(false)} />}
            </div>
          </div>

          {incomplete > 0 && (
            <div style={{ marginTop: 12, fontSize: 12.5, color: C.warn, display: "flex", alignItems: "center", gap: 7, background: C.warnBg, padding: "9px 13px", borderRadius: 9 }}>
              <span style={{ fontWeight: 700 }}>!</span>
              {incomplete === 1 ? "1 binomio non ha ancora una classe assegnata." : `${incomplete} binomi non hanno ancora una classe assegnata.`}
            </div>
          )}
        </div>

        {/* RIGHT: summary (sticky) */}
        <div style={{ position: "sticky", top: 24 }}>
          <div style={{ background: C.white, border: `1px solid rgba(15,23,42,0.08)`, borderRadius: 12, padding: "16px 18px" }}>
            <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 12 }}>Riepilogo iscrizione</div>

            <Row label={`${totals.horses} ${totals.horses === 1 ? "cavallo" : "cavalli"} · ${totals.enrollments} ${totals.enrollments === 1 ? "iscrizione" : "iscrizioni"}`} value={euro(totals.classesCost)} />
            <Row label={<span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>Fee PenRunner <span style={{ fontSize: 10.5, color: C.slate400 }}>{totals.horses} × {euro(FEE)}</span></span>} value={euro(totals.fee)} />

            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", paddingTop: 11, marginTop: 4, borderTop: `1px solid rgba(15,23,42,0.10)` }}>
              <span style={{ fontSize: 14, fontWeight: 600 }}>Totale</span>
              <span style={{ fontSize: 24, fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>{euro(totals.total)}</span>
            </div>

            <button disabled={!canConfirm} onClick={() => setConfirmed(true)}
              style={{ width: "100%", marginTop: 14, background: canConfirm ? C.accent : C.slate100, color: canConfirm ? "#fff" : C.slate400, border: "none", borderRadius: 9, padding: "12px", fontSize: 14, fontWeight: 600, cursor: canConfirm ? "pointer" : "not-allowed", fontFamily: "inherit", transition: "background 0.15s" }}>
              {totals.horses === 0 ? "Aggiungi un binomio" : incomplete > 0 ? "Assegna le classi mancanti" : `Conferma iscrizione · ${totals.horses} ${totals.horses === 1 ? "cavallo" : "cavalli"}`}
            </button>
            <div style={{ fontSize: 11, color: C.slate400, textAlign: "center", marginTop: 9, lineHeight: 1.5 }}>
              Il pagamento è gestito dall'organizzazione dell'evento. La fee è inclusa nella quota.
            </div>
          </div>

          {/* mini helper */}
          <div style={{ marginTop: 12, background: C.slate100, borderRadius: 10, padding: "12px 14px", fontSize: 12, color: C.slate500, lineHeight: 1.55 }}>
            Suggerimento: clicca su un badge classe per rimuoverlo, o su «+ classe» per aggiungerne altre allo stesso cavallo.
          </div>
        </div>
      </div>
    </div>
  );
}

// ---- Subcomponents ----
function Row({ label, value }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, color: C.slate700, marginBottom: 9 }}>
      <span>{label}</span>
      <span style={{ fontVariantNumeric: "tabular-nums" }}>{value}</span>
    </div>
  );
}
function Badge({ bg, fg, children }) {
  return <span style={{ fontSize: 10.5, fontWeight: 600, background: bg, color: fg, padding: "3px 9px", borderRadius: 5 }}>{children}</span>;
}
function ChevR() {
  return <span style={{ color: "#475569", fontSize: 14 }}>›</span>;
}

function HorsePicker({ roster, onPick, onClose }) {
  const [q, setQ] = useState("");
  const filtered = roster.filter((h) => h.name.toLowerCase().includes(q.toLowerCase()));
  useEffect(() => {
    const onKey = (e) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <>
      <div onClick={onClose} style={{ position: "fixed", inset: 0, zIndex: 10 }} />
      <div style={{ position: "absolute", bottom: "calc(100% + 6px)", left: 16, width: 320, background: "#fff", border: `1px solid rgba(15,23,42,0.12)`, borderRadius: 11, boxShadow: "0 12px 32px rgba(15,23,42,0.16)", zIndex: 20, overflow: "hidden" }}>
        <div style={{ padding: 10, borderBottom: "1px solid rgba(15,23,42,0.07)" }}>
          <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Cerca un cavallo della scuderia…"
            style={{ width: "100%", height: 34, border: `1px solid rgba(15,23,42,0.14)`, borderRadius: 7, padding: "0 10px", fontSize: 13, fontFamily: "inherit", outline: "none", boxSizing: "border-box" }} />
        </div>
        <div style={{ maxHeight: 240, overflowY: "auto" }}>
          {filtered.length === 0 && <div style={{ padding: "18px", textAlign: "center", fontSize: 12.5, color: C.slate400 }}>Tutti i cavalli della scuderia sono già iscritti.</div>}
          {filtered.map((h) => (
            <div key={h.id} onClick={() => onPick(h)}
              style={{ padding: "10px 12px", cursor: "pointer", display: "flex", alignItems: "center", gap: 10, borderTop: "1px solid rgba(15,23,42,0.04)" }}
              onMouseEnter={(e) => (e.currentTarget.style.background = C.slate50)}
              onMouseLeave={(e) => (e.currentTarget.style.background = "#fff")}>
              <div style={{ width: 30, height: 30, borderRadius: 7, background: C.accent50, color: C.accent, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 700 }}>{h.name[0]}</div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 600 }}>{h.name}</div>
                <div style={{ fontSize: 11, color: C.slate400 }}>microchip {h.chip} · {h.rider}</div>
              </div>
              <span style={{ fontSize: 16, color: C.accent }}>+</span>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}

function ClassMenu({ selected, onPick, onClose }) {
  useEffect(() => {
    const onKey = (e) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <>
      <div onClick={onClose} style={{ position: "fixed", inset: 0, zIndex: 10 }} />
      <div style={{ position: "absolute", top: "calc(100% + 6px)", left: 0, width: 280, background: "#fff", border: `1px solid rgba(15,23,42,0.12)`, borderRadius: 11, boxShadow: "0 12px 32px rgba(15,23,42,0.16)", zIndex: 20, overflow: "hidden" }}>
        <div style={{ padding: "9px 12px", fontSize: 11, fontWeight: 600, color: C.slate500, textTransform: "uppercase", letterSpacing: "0.4px", borderBottom: "1px solid rgba(15,23,42,0.06)" }}>Aggiungi o togli classi</div>
        <div style={{ maxHeight: 260, overflowY: "auto" }}>
          {CLASSES.map((c) => {
            const on = selected.includes(c.id);
            const g = GROUP_COLOR[c.group];
            return (
              <div key={c.id} onClick={() => onPick(c.id)}
                style={{ padding: "9px 12px", cursor: "pointer", display: "flex", alignItems: "center", gap: 10, borderTop: "1px solid rgba(15,23,42,0.04)", background: on ? C.slate50 : "#fff" }}
                onMouseEnter={(e) => (e.currentTarget.style.background = C.slate50)}
                onMouseLeave={(e) => (e.currentTarget.style.background = on ? C.slate50 : "#fff")}>
                <span style={{ width: 18, height: 18, borderRadius: 5, border: on ? "none" : `1.5px solid ${C.slate300}`, background: on ? C.accent : "transparent", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, flexShrink: 0 }}>{on ? "✓" : ""}</span>
                <span style={{ flex: 1, fontSize: 13, fontWeight: 500 }}>{c.label}</span>
                <span style={{ fontSize: 10, fontWeight: 600, background: g.bg, color: g.fg, padding: "2px 7px", borderRadius: 4 }}>{euro(c.fee)}</span>
              </div>
            );
          })}
        </div>
        <div style={{ padding: "9px 12px", borderTop: "1px solid rgba(15,23,42,0.06)" }}>
          <button onClick={onClose} style={{ width: "100%", background: C.accent, color: "#fff", border: "none", borderRadius: 7, padding: "8px", fontSize: 12.5, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>Fatto</button>
        </div>
      </div>
    </>
  );
}

function Success({ entries, totals, onBack }) {
  return (
    <div style={{ fontFamily: "Inter, system-ui, sans-serif", background: C.slate50, minHeight: "100vh", color: C.ink }}>
      <div style={{ background: C.ink, padding: "12px 24px", display: "flex", alignItems: "center", gap: 11 }}>
        <div style={{ width: 26, height: 26, borderRadius: 7, background: C.accent, display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 800, fontSize: 14, color: "#fff" }}>P</div>
        <span style={{ fontSize: 15, fontWeight: 700, color: "#fff" }}>PenRunner</span>
      </div>
      <div style={{ maxWidth: 560, margin: "0 auto", padding: "48px 24px" }}>
        <div style={{ background: C.white, border: `1px solid rgba(15,23,42,0.08)`, borderRadius: 14, padding: "28px", textAlign: "center" }}>
          <div style={{ width: 52, height: 52, borderRadius: "50%", background: C.accent50, color: C.accent, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 26, margin: "0 auto 16px" }}>✓</div>
          <h1 style={{ fontSize: 21, fontWeight: 700, margin: "0 0 6px" }}>Iscrizione confermata</h1>
          <p style={{ fontSize: 13.5, color: C.slate500, margin: "0 0 22px" }}>
            {totals.horses} {totals.horses === 1 ? "cavallo iscritto" : "cavalli iscritti"} a Lombardia Reining · 2ª tappa. Una email di riepilogo è in arrivo alla scuderia.
          </p>
          <div style={{ textAlign: "left", border: `1px solid rgba(15,23,42,0.08)`, borderRadius: 10, overflow: "hidden", marginBottom: 18 }}>
            {entries.map((e, i) => (
              <div key={e.uid} style={{ padding: "11px 14px", borderTop: i ? "1px solid rgba(15,23,42,0.05)" : "none", display: "flex", alignItems: "center", gap: 10 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13.5, fontWeight: 600 }}>{e.name}</div>
                  <div style={{ fontSize: 11.5, color: C.slate500 }}>{e.rider} · {e.classes.map(classLabel).join(", ")}</div>
                </div>
                <div style={{ fontSize: 13, fontWeight: 600, fontVariantNumeric: "tabular-nums" }}>{euro(e.classes.reduce((s, c) => s + classFee(c), 0))}</div>
              </div>
            ))}
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, color: C.slate700, marginBottom: 6 }}>
            <span>Quote classi</span><span style={{ fontVariantNumeric: "tabular-nums" }}>{euro(totals.classesCost)}</span>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, color: C.slate700, marginBottom: 10 }}>
            <span>Fee PenRunner</span><span style={{ fontVariantNumeric: "tabular-nums" }}>{euro(totals.fee)}</span>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", paddingTop: 11, borderTop: `1px solid rgba(15,23,42,0.10)`, marginBottom: 22 }}>
            <span style={{ fontSize: 14, fontWeight: 600 }}>Totale</span>
            <span style={{ fontSize: 22, fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>{euro(totals.total)}</span>
          </div>
          <button onClick={onBack} style={{ width: "100%", background: "#fff", color: C.ink, border: `1px solid rgba(15,23,42,0.16)`, borderRadius: 9, padding: "11px", fontSize: 13.5, fontWeight: 500, cursor: "pointer", fontFamily: "inherit" }}>← Torna all'iscrizione</button>
        </div>
      </div>
    </div>
  );
}
