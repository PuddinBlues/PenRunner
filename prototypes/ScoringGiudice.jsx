import React, { useState, useMemo } from "react";

const C = {
  accent: "#15803D", accent500: "#16A34A", accent50: "#DCFCE7",
  ink: "#0F172A", ink900: "#0B1120",
  slate700: "#334155", slate500: "#64748B", slate400: "#94A3B8", slate300: "#CBD5E1",
  slate100: "#F1F5F9", slate50: "#F8FAFC", white: "#FFFFFF",
  warn: "#B45309", warnBg: "#FFF7ED", warnText: "#9A3412", warnBorder: "rgba(180,83,9,0.25)",
  danger: "#B91C1C", amberLive: "#FBBF24", offline: "#FBBF24",
};

const QUALITY = [-1.5, -1, -0.5, 0, 0.5, 1, 1.5];
const PENALTY_VALUES = [0.5, 1, 2, 5];

const fmtQ = (v) => (v === 0 ? "0" : (v > 0 ? "+" : "") + (Number.isInteger(v) ? v : v.toString().replace("0.5", "½").replace("-", "-").replace("1.5", "1½")));
const labelQ = (v) => {
  const map = { "-1.5": "-1½", "-1": "-1", "-0.5": "-½", "0": "0", "0.5": "+½", "1": "+1", "1.5": "+1½" };
  return map[v.toString()] ?? v;
};
const fmtScore = (n) => n.toFixed(1);

const MANEUVERS = [
  { id: 1, label: "Spin destra" },
  { id: 2, label: "Spin sinistra" },
  { id: 3, label: "Cerchi destra" },
  { id: 4, label: "Cerchi sinistra" },
  { id: 5, label: "Rollback" },
  { id: 6, label: "Stop scivolato" },
  { id: 7, label: "Backup" },
];

export default function App() {
  // scores[id] = { quality: number|null, penalty: number }
  const [scores, setScores] = useState(() =>
    Object.fromEntries(MANEUVERS.map((m) => [m.id, { quality: null, penalty: 0 }]))
  );
  const [runPenalty, setRunPenalty] = useState(0);
  const [special, setSpecial] = useState(null); // null | 'score_0' | 'no_score'
  const [penaltySheet, setPenaltySheet] = useState(null); // maneuver id or 'run'
  const [signed, setSigned] = useState(false);

  const setQuality = (id, q) =>
    setScores((s) => ({ ...s, [id]: { ...s[id], quality: s[id].quality === q ? null : q } }));
  const setPenalty = (id, p) =>
    setScores((s) => ({ ...s, [id]: { ...s[id], penalty: p } }));

  const totals = useMemo(() => {
    const qualitySum = MANEUVERS.reduce((s, m) => s + (scores[m.id].quality ?? 0), 0);
    const penSum = MANEUVERS.reduce((s, m) => s + scores[m.id].penalty, 0) + runPenalty;
    const scored = MANEUVERS.filter((m) => scores[m.id].quality !== null).length;
    let provisional;
    if (special === "no_score") provisional = null;
    else if (special === "score_0") provisional = 0;
    else provisional = 70 + qualitySum - penSum;
    return { qualitySum, penSum, scored, provisional };
  }, [scores, runPenalty, special]);

  const allScored = totals.scored === MANEUVERS.length;
  const canSign = special === "no_score" || allScored;

  if (signed) return <Signed totals={totals} special={special} onBack={() => setSigned(false)} />;

  return (
    <div style={{ fontFamily: "Inter, system-ui, sans-serif", background: C.slate100, minHeight: "100vh", padding: "14px 0", display: "flex", justifyContent: "center" }}>
      <div style={{ width: 360, maxWidth: "100%", background: C.white, borderRadius: 22, overflow: "hidden", border: `1px solid rgba(15,23,42,0.1)`, position: "relative" }}>

        {/* status bar */}
        <div style={{ background: C.ink, padding: "10px 16px", display: "flex", alignItems: "center", gap: 8 }}>
          <GavelIcon />
          <span style={{ fontSize: 12, fontWeight: 600, color: "#fff" }}>Scribe · giudice E. Righetti</span>
          <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 5 }}>
            <WifiOff />
            <span style={{ fontSize: 11, color: C.offline, fontWeight: 500 }}>Offline · 4 in coda</span>
          </div>
        </div>

        {/* entry context */}
        <div style={{ padding: "13px 16px 12px", background: C.slate50, borderBottom: `1px solid rgba(15,23,42,0.05)`, display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ width: 38, height: 38, borderRadius: 10, background: C.ink, color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 15, fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>12</div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 14, fontWeight: 600, color: C.ink }}>MC Millenium Falcon</div>
            <div style={{ fontSize: 11.5, color: C.slate500 }}>M. Cortesi · Open L4 · Pattern 9</div>
          </div>
          <div style={{ textAlign: "right" }}>
            <div style={{ fontSize: 10, color: C.slate400, textTransform: "uppercase", letterSpacing: "0.4px" }}>Manovre</div>
            <div style={{ fontSize: 13, fontWeight: 600, color: C.slate700, fontVariantNumeric: "tabular-nums" }}>{totals.scored} / {MANEUVERS.length}</div>
          </div>
        </div>

        {/* maneuvers */}
        <div style={{ padding: "13px 16px 4px", opacity: special === "no_score" ? 0.5 : 1, pointerEvents: special === "no_score" ? "none" : "auto" }}>
          {MANEUVERS.map((m) => {
            const sc = scores[m.id];
            return (
              <div key={m.id} style={{ marginBottom: 14 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                  <span style={{ fontSize: 13, color: C.slate700 }}>{m.id} · {m.label}</span>
                  <span style={{ fontSize: 13, fontWeight: 700, fontVariantNumeric: "tabular-nums", color: sc.quality === null ? C.slate300 : sc.quality > 0 ? C.accent : sc.quality < 0 ? C.warn : C.ink }}>
                    {sc.quality === null ? "—" : labelQ(sc.quality)}
                  </span>
                </div>
                <div style={{ display: "flex", gap: 5, alignItems: "center" }}>
                  <div style={{ flex: 1, display: "flex", gap: 3 }}>
                    {QUALITY.map((q) => {
                      const on = sc.quality === q;
                      return (
                        <button key={q} onClick={() => setQuality(m.id, q)}
                          style={{
                            flex: 1, height: 29, borderRadius: 6, border: "none", cursor: "pointer", fontFamily: "inherit",
                            fontSize: 10.5, fontWeight: on ? 600 : 400,
                            background: on ? (q > 0 ? C.accent : q < 0 ? C.warn : C.ink) : C.slate100,
                            color: on ? "#fff" : C.slate400,
                          }}>{labelQ(q)}</button>
                      );
                    })}
                  </div>
                  <button onClick={() => setPenaltySheet(m.id)}
                    style={{
                      height: 29, minWidth: 42, padding: "0 9px", borderRadius: 6, cursor: "pointer", fontFamily: "inherit",
                      fontSize: sc.penalty ? 12 : 11, fontWeight: sc.penalty ? 700 : 600,
                      background: sc.penalty ? C.warn : "#fff",
                      color: sc.penalty ? "#fff" : C.slate400,
                      border: sc.penalty ? "none" : `1px solid rgba(15,23,42,0.12)`,
                      fontVariantNumeric: "tabular-nums",
                      display: "flex", alignItems: "center", justifyContent: "center", gap: 3,
                    }}>
                    {sc.penalty ? "−" + (sc.penalty === 0.5 ? "½" : sc.penalty) : <FlagIcon />}
                  </button>
                </div>
              </div>
            );
          })}
        </div>

        {/* run-level penalties */}
        <div style={{ padding: "6px 16px 13px" }}>
          <div style={{ display: "flex", gap: 7 }}>
            <button onClick={() => setPenaltySheet("run")}
              style={{ flex: 1, background: runPenalty ? C.warn : "#fff", color: runPenalty ? "#fff" : C.warn, border: runPenalty ? "none" : `1px solid rgba(180,83,9,0.4)`, borderRadius: 8, padding: "9px 4px", fontSize: 11.5, fontWeight: 600, cursor: "pointer", fontFamily: "inherit", fontVariantNumeric: "tabular-nums" }}>
              {runPenalty ? `Run −${runPenalty}` : "Penalità di run"}
            </button>
            <button onClick={() => setSpecial(special === "score_0" ? null : "score_0")}
              style={{ flex: 1, background: special === "score_0" ? C.warn : "#fff", color: special === "score_0" ? "#fff" : C.warn, border: special === "score_0" ? "none" : `1px solid rgba(180,83,9,0.4)`, borderRadius: 8, padding: "9px 4px", fontSize: 11.5, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>
              Score 0
            </button>
            <button onClick={() => setSpecial(special === "no_score" ? null : "no_score")}
              style={{ flex: 1, background: special === "no_score" ? C.danger : "#fff", color: special === "no_score" ? "#fff" : C.danger, border: special === "no_score" ? "none" : `1px solid rgba(185,28,28,0.4)`, borderRadius: 8, padding: "9px 4px", fontSize: 11.5, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>
              No score
            </button>
          </div>
        </div>

        {/* live score */}
        <div style={{ padding: "0 16px 16px" }}>
          <div style={{ background: C.ink900, borderRadius: 12, padding: "14px 16px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div>
              <div style={{ fontSize: 10.5, color: C.slate500, textTransform: "uppercase", letterSpacing: "0.5px" }}>Score provvisorio</div>
              <div style={{ fontSize: 11, color: C.slate400, marginTop: 3, fontVariantNumeric: "tabular-nums" }}>
                {special === "no_score" ? "fuori classifica" :
                 special === "score_0" ? "fuori pattern" :
                 `70 base · ${totals.qualitySum >= 0 ? "+" : ""}${totals.qualitySum} voti · −${totals.penSum} penalità`}
              </div>
            </div>
            <div style={{ fontSize: 30, fontWeight: 800, fontVariantNumeric: "tabular-nums", lineHeight: 1,
              color: special === "no_score" ? C.slate500 : totals.provisional >= 70 ? C.accent500 : C.amberLive }}>
              {totals.provisional === null ? "NS" : fmtScore(totals.provisional)}
            </div>
          </div>

          <button disabled={!canSign} onClick={() => setSigned(true)}
            style={{ width: "100%", marginTop: 11, background: canSign ? C.accent : C.slate100, color: canSign ? "#fff" : C.slate400, border: "none", borderRadius: 9, padding: "14px", fontSize: 14, fontWeight: 600, cursor: canSign ? "pointer" : "not-allowed", fontFamily: "inherit" }}>
            {special === "no_score" ? "Firma · no score" : allScored ? "Firma e conferma score" : `Mancano ${MANEUVERS.length - totals.scored} manovre`}
          </button>
        </div>

        {/* penalty bottom sheet */}
        {penaltySheet !== null && (
          <PenaltySheet
            isRun={penaltySheet === "run"}
            label={penaltySheet === "run" ? "Penalità di run" : `Penalità · manovra ${penaltySheet} ${MANEUVERS.find((m) => m.id === penaltySheet)?.label}`}
            current={penaltySheet === "run" ? runPenalty : scores[penaltySheet]?.penalty ?? 0}
            onConfirm={(val) => {
              if (penaltySheet === "run") setRunPenalty(val);
              else setPenalty(penaltySheet, val);
              setPenaltySheet(null);
            }}
            onClose={() => setPenaltySheet(null)}
          />
        )}

        <style>{`
          @keyframes slideup { from { transform: translateY(100%) } to { transform: translateY(0) } }
          @media (prefers-reduced-motion: reduce){ *{animation:none !important} }
        `}</style>
      </div>
    </div>
  );
}

function PenaltySheet({ isRun, label, current, onConfirm, onClose }) {
  const [val, setVal] = useState(current || 0);
  const display = val === 0.5 ? "½" : val.toString();
  const quick = isRun ? [2, 5] : PENALTY_VALUES;
  return (
    <>
      <div onClick={onClose} style={{ position: "absolute", inset: 0, background: "rgba(11,17,32,0.45)", zIndex: 10 }} />
      <div style={{ position: "absolute", left: 0, right: 0, bottom: 0, background: "#fff", borderRadius: "20px 20px 22px 22px", boxShadow: "0 -8px 28px rgba(15,23,42,0.2)", padding: "18px 18px 20px", zIndex: 20, animation: "slideup 0.22s ease" }}>
        <div style={{ width: 34, height: 4, borderRadius: 2, background: C.slate300, margin: "0 auto 14px" }} />
        <div style={{ fontSize: 14, fontWeight: 600, color: C.ink, marginBottom: 3 }}>{label}</div>
        <div style={{ fontSize: 12, color: C.slate500, marginBottom: 16 }}>Inserisci il valore chiamato dal giudice</div>

        {/* big number */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 14, marginBottom: 16 }}>
          <button onClick={() => setVal((v) => Math.max(0, +(v - 0.5).toFixed(1)))}
            style={{ width: 46, height: 46, borderRadius: 11, background: C.slate50, border: `1px solid rgba(15,23,42,0.12)`, color: C.slate500, fontSize: 22, cursor: "pointer", fontFamily: "inherit" }}>−</button>
          <div style={{ width: 96, height: 64, border: `1.5px solid ${val ? C.warn : C.slate300}`, borderRadius: 12, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 30, fontWeight: 800, color: val ? C.warnText : C.slate400, background: val ? C.warnBg : "#fff", fontVariantNumeric: "tabular-nums" }}>
            {val ? "−" + display : "0"}
          </div>
          <button onClick={() => setVal((v) => +(v + 0.5).toFixed(1))}
            style={{ width: 46, height: 46, borderRadius: 11, background: C.ink, border: "none", color: "#fff", fontSize: 22, cursor: "pointer", fontFamily: "inherit" }}>+</button>
        </div>

        {/* quick values */}
        <div style={{ display: "flex", gap: 6, justifyContent: "center", marginBottom: 18 }}>
          {quick.map((q) => (
            <button key={q} onClick={() => setVal(q)}
              style={{ fontSize: 12.5, fontWeight: 600, background: val === q ? C.warn : C.slate100, color: val === q ? "#fff" : C.slate700, padding: "7px 15px", borderRadius: 7, border: "none", cursor: "pointer", fontFamily: "inherit" }}>
              {q === 0.5 ? "½" : q}
            </button>
          ))}
        </div>

        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={onClose}
            style={{ flex: 1, background: "#fff", border: `1px solid rgba(15,23,42,0.16)`, color: C.slate700, borderRadius: 8, padding: "12px", fontSize: 13, fontWeight: 500, cursor: "pointer", fontFamily: "inherit" }}>Annulla</button>
          <button onClick={() => onConfirm(val)}
            style={{ flex: 1.5, background: C.accent, color: "#fff", border: "none", borderRadius: 8, padding: "12px", fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>Conferma</button>
        </div>
      </div>
    </>
  );
}

function Signed({ totals, special, onBack }) {
  return (
    <div style={{ fontFamily: "Inter, system-ui, sans-serif", background: C.slate100, minHeight: "100vh", padding: "14px 0", display: "flex", justifyContent: "center" }}>
      <div style={{ width: 360, maxWidth: "100%", background: C.white, borderRadius: 22, overflow: "hidden", border: `1px solid rgba(15,23,42,0.1)` }}>
        <div style={{ background: C.ink, padding: "10px 16px", display: "flex", alignItems: "center", gap: 8 }}>
          <GavelIcon /><span style={{ fontSize: 12, fontWeight: 600, color: "#fff" }}>Scribe · giudice E. Righetti</span>
        </div>
        <div style={{ padding: "32px 20px", textAlign: "center" }}>
          <div style={{ width: 50, height: 50, borderRadius: "50%", background: C.accent50, color: C.accent, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 24, margin: "0 auto 16px" }}>✓</div>
          <h1 style={{ fontSize: 19, fontWeight: 700, color: C.ink, margin: "0 0 5px" }}>Score firmato</h1>
          <p style={{ fontSize: 13, color: C.slate500, margin: "0 0 22px", lineHeight: 1.5 }}>MC Millenium Falcon · Open L4. Sarà sincronizzato e pubblicato al rientro della connessione.</p>

          <div style={{ background: C.ink900, borderRadius: 12, padding: "20px", marginBottom: 18 }}>
            <div style={{ fontSize: 11, color: C.slate500, textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: 6 }}>Score finale</div>
            <div style={{ fontSize: 42, fontWeight: 800, color: special === "no_score" ? C.slate400 : totals.provisional >= 70 ? C.accent500 : C.amberLive, fontVariantNumeric: "tabular-nums", lineHeight: 1 }}>
              {totals.provisional === null ? "NS" : fmtScore(totals.provisional)}
            </div>
          </div>

          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 6, fontSize: 11.5, color: C.offline, marginBottom: 22 }}>
            <WifiOff /> In coda di sincronizzazione · 5 score
          </div>

          <button onClick={onBack}
            style={{ width: "100%", background: C.accent, color: "#fff", border: "none", borderRadius: 9, padding: "13px", fontSize: 14, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>Prossimo binomio →</button>
          <button onClick={onBack}
            style={{ width: "100%", marginTop: 8, background: "#fff", color: C.slate700, border: `1px solid rgba(15,23,42,0.16)`, borderRadius: 9, padding: "11px", fontSize: 13, fontWeight: 500, cursor: "pointer", fontFamily: "inherit" }}>← Rivedi questo score</button>
        </div>
      </div>
    </div>
  );
}

function GavelIcon() { return <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#86EFAC" strokeWidth="2"><path d="m14 13-7.5 7.5a2.1 2.1 0 0 1-3-3L11 10M16 11l5-5M14.5 4.5l5 5M9 8l7 7"/></svg>; }
function WifiOff() { return <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#FBBF24" strokeWidth="2"><path d="M2 2l20 20M8.5 16.5a5 5 0 0 1 7 0M5 13a10 10 0 0 1 5.2-2.7M2 8.8a15 15 0 0 1 4.2-2.5M16.7 11A10 10 0 0 1 19 13M22 8.8a15 15 0 0 0-5-3.3M12 20h.01"/></svg>; }
function FlagIcon() { return <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 22V4M4 4h11l-2 4 2 4H4"/></svg>; }
