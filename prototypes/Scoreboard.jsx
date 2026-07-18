import React, { useState, useEffect } from "react";

// ---- Tokens (PenRunner) ----
const C = {
  accent: "#15803D", accent400: "#22C55E",
  ink900: "#0B1120", ink800: "#111827", panel: "#131C2E",
  slate300: "#CBD5E1", slate400: "#94A3B8", slate500: "#64748B",
  live: "#DC2626", warn: "#F59E0B", white: "#FFFFFF",
  line: "rgba(148,163,184,0.14)",
};

// ---- Dati dimostrativi (derivati: run states + start list + ETA) ----
const BOARD = {
  event: "4ª Tappa Lombardia Reining", clazz: "Green Level", go: 1, pattern: "Pattern 9",
  previous: { draw: 12, horse: "Spark Of Whiz", rider: "L. Ferrari", stable: "Rancho El Paso", score: 71.0, status: "provvisorio" },
  inPen: { draw: 13, horse: "Smart Lil Dream", rider: "G. Colombo", stable: "Quarter Valley" },
  // ETA demo: derivata da ADESSO + slot 4'30" e drag 7' (default BR-51) — nel prodotto arriva dal motore ETA (BR-50/52)
  next: [
    { draw: 14, horse: "Chic Olena Bay", rider: "S. Moretti", etaOffsetMin: 4.5 },
    { draw: 15, horse: "Gunnabe A Star", rider: "L. Ferrari", etaOffsetMin: 9, lastBeforeDrag: true },
    { draw: 16, horse: "Whizkey Time", rider: "A. Ricci", etaOffsetMin: 20.5, afterDrag: true },
  ],
  leader: { draw: 7, horse: "Tinsel Town Gun", rider: "M. Bianchi", score: 71.5 },
};

export default function App() {
  const [now, setNow] = useState(new Date());
  const [pulse, setPulse] = useState(true);
  const [portrait, setPortrait] = useState(typeof window !== "undefined" && window.innerHeight > window.innerWidth);
  useEffect(() => { const t = setInterval(() => { setNow(new Date()); setPulse(p => !p); }, 1000); return () => clearInterval(t); }, []);
  useEffect(() => {
    const onR = () => setPortrait(window.innerHeight > window.innerWidth);
    window.addEventListener("resize", onR); window.addEventListener("orientationchange", onR);
    return () => { window.removeEventListener("resize", onR); window.removeEventListener("orientationchange", onR); };
  }, []);

  // La scoreboard è una vista da maxischermo (landscape, kiosk).
  // In portrait: rimando alla pagina evento, che è l'esperienza mobile del pubblico.
  if (portrait) {
    return (
      <div style={{ fontFamily: "Inter, system-ui, sans-serif", background: C.ink900, color: "#fff", width: "100vw", height: "100vh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 18, padding: "0 32px", textAlign: "center" }}>
        <div style={{ width: 52, height: 52, borderRadius: 13, background: C.accent, display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 800, fontSize: 26 }}>P</div>
        <div style={{ fontSize: 19, fontWeight: 700 }}>Questa è la vista da maxischermo</div>
        <div style={{ fontSize: 14.5, color: C.slate400, lineHeight: 1.6, maxWidth: 340 }}>Ruota il dispositivo in orizzontale per la scoreboard, oppure segui la diretta con classifica completa e turni stimati sulla pagina evento.</div>
        <button style={{ background: C.accent, color: "#fff", border: "none", borderRadius: 10, padding: "13px 22px", fontSize: 14.5, fontWeight: 600, cursor: "pointer", fontFamily: "inherit", marginTop: 6 }}
          onClick={() => alert("Apre la pagina evento pubblica — la vista mobile per il pubblico.")}>Vai alla diretta dell'evento →</button>
      </div>
    );
  }
  const b = BOARD;
  const fmt = (s) => (s % 1 === 0 ? `${s}` : `${Math.floor(s)}½`);
  const etaAt = (offsetMin) => new Date(now.getTime() + offsetMin * 60000).toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" });

  return (
    <div style={{ fontFamily: "Inter, system-ui, sans-serif", background: C.ink900, color: "#fff", width: "100vw", height: "100vh", display: "flex", flexDirection: "column", overflow: "hidden" }}>

      {/* top bar */}
      <div style={{ display: "flex", alignItems: "center", gap: 18, padding: "1.2vh 2.2vw", borderBottom: `1px solid ${C.line}` }}>
        <div style={{ width: "2.6vw", height: "2.6vw", minWidth: 30, minHeight: 30, borderRadius: "0.6vw", background: C.accent, display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 800, fontSize: "1.4vw" }}>P</div>
        <div>
          <div style={{ fontSize: "1.5vw", fontWeight: 700, letterSpacing: "-0.02em" }}>{b.event}</div>
          <div style={{ fontSize: "1vw", color: C.slate400 }}>{b.clazz} · Go {b.go} · {b.pattern}</div>
        </div>
        <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 12 }}>
          <span style={{ width: "0.7vw", height: "0.7vw", minWidth: 9, minHeight: 9, borderRadius: "50%", background: C.live, opacity: pulse ? 1 : 0.35, transition: "opacity 0.4s" }} />
          <span style={{ fontSize: "1.1vw", fontWeight: 700, color: C.live, letterSpacing: "0.08em" }}>LIVE</span>
          <span style={{ fontSize: "1.1vw", color: C.slate400, fontVariantNumeric: "tabular-nums", marginLeft: 8 }}>{now.toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" })}</span>
        </div>
      </div>

      {/* main */}
      <div style={{ flex: 1, display: "flex", minHeight: 0 }}>

        {/* colonna principale */}
        <div style={{ flex: "1 1 64%", display: "flex", flexDirection: "column", padding: "2vh 2.2vw", gap: "2vh", minWidth: 0 }}>

          {/* precedente + score */}
          <div style={{ background: C.panel, borderRadius: "1.2vw", padding: "2.2vh 2vw", display: "flex", alignItems: "center", gap: "2vw", border: `1px solid ${C.line}` }}>
            <div style={{ minWidth: 0, flex: 1 }}>
              <div style={{ fontSize: "0.95vw", fontWeight: 600, color: C.slate400, textTransform: "uppercase", letterSpacing: "0.12em", marginBottom: "0.8vh" }}>Ultimo score · Draw {b.previous.draw}</div>
              <div style={{ fontSize: "2.4vw", fontWeight: 800, letterSpacing: "-0.02em", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{b.previous.horse}</div>
              <div style={{ fontSize: "1.4vw", color: C.slate300 }}>{b.previous.rider} <span style={{ color: C.slate500 }}>· {b.previous.stable}</span></div>
            </div>
            <div style={{ textAlign: "right" }}>
              <div style={{ fontSize: "7.5vw", fontWeight: 800, lineHeight: 1, fontVariantNumeric: "tabular-nums", letterSpacing: "-0.03em" }}>{fmt(b.previous.score)}</div>
              <div style={{ fontSize: "0.95vw", color: C.warn, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.1em", marginTop: "0.6vh" }}>{b.previous.status}</div>
            </div>
          </div>

          {/* in campo */}
          <div style={{ flex: 1, background: `linear-gradient(135deg, rgba(220,38,38,0.10), transparent 55%), ${C.panel}`, borderRadius: "1.2vw", padding: "2.6vh 2vw", border: `1px solid rgba(220,38,38,0.35)`, display: "flex", flexDirection: "column", justifyContent: "center", minHeight: 0 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: "1.4vh" }}>
              <span style={{ width: "0.8vw", height: "0.8vw", minWidth: 10, minHeight: 10, borderRadius: "50%", background: C.live, opacity: pulse ? 1 : 0.35, transition: "opacity 0.4s" }} />
              <span style={{ fontSize: "1.1vw", fontWeight: 700, color: C.live, textTransform: "uppercase", letterSpacing: "0.14em" }}>In campo · Draw {b.inPen.draw}</span>
            </div>
            <div style={{ fontSize: "5vw", fontWeight: 800, letterSpacing: "-0.03em", lineHeight: 1.05, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{b.inPen.horse}</div>
            <div style={{ fontSize: "2.2vw", color: C.slate300, marginTop: "0.8vh" }}>{b.inPen.rider} <span style={{ color: C.slate500 }}>· {b.inPen.stable}</span></div>
          </div>
        </div>

        {/* colonna destra */}
        <div style={{ flex: "1 1 36%", borderLeft: `1px solid ${C.line}`, padding: "2vh 1.8vw", display: "flex", flexDirection: "column", gap: "1.6vh", minWidth: 0 }}>
          <div style={{ fontSize: "0.95vw", fontWeight: 600, color: C.slate400, textTransform: "uppercase", letterSpacing: "0.12em" }}>A seguire</div>
          {b.next.map((n) => (
            <React.Fragment key={n.draw}>
              <div style={{ background: C.panel, borderRadius: "0.9vw", padding: "1.5vh 1.2vw", display: "flex", alignItems: "center", gap: "1vw", border: `1px solid ${C.line}` }}>
                <div style={{ fontSize: "1.9vw", fontWeight: 800, fontVariantNumeric: "tabular-nums", color: C.slate300, minWidth: "3vw" }}>{n.draw}</div>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{ fontSize: "1.4vw", fontWeight: 700, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{n.horse}</div>
                  <div style={{ fontSize: "1vw", color: C.slate400 }}>{n.rider}</div>
                </div>
                <div style={{ fontSize: "1.2vw", color: C.slate400, fontVariantNumeric: "tabular-nums" }}>~{etaAt(n.etaOffsetMin)}</div>
              </div>
              {n.lastBeforeDrag && (
                <div style={{ display: "flex", alignItems: "center", gap: "0.8vw", padding: "0 0.4vw" }}>
                  <div style={{ flex: 1, height: 1, background: "rgba(245,158,11,0.4)" }} />
                  <span style={{ fontSize: "0.9vw", color: C.warn, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.1em" }}>Drag · ~7 min</span>
                  <div style={{ flex: 1, height: 1, background: "rgba(245,158,11,0.4)" }} />
                </div>
              )}
            </React.Fragment>
          ))}

          <div style={{ marginTop: "auto", background: "rgba(21,128,61,0.10)", border: "1px solid rgba(34,197,94,0.3)", borderRadius: "0.9vw", padding: "1.6vh 1.2vw" }}>
            <div style={{ fontSize: "0.9vw", fontWeight: 600, color: C.accent400, textTransform: "uppercase", letterSpacing: "0.12em", marginBottom: "0.6vh" }}>Score to beat · Go {b.go}</div>
            <div style={{ display: "flex", alignItems: "baseline", gap: "1vw" }}>
              <span style={{ fontSize: "2.6vw", fontWeight: 800, fontVariantNumeric: "tabular-nums" }}>{fmt(b.leader.score)}</span>
              <span style={{ fontSize: "1.15vw", color: C.slate300, minWidth: 0, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{b.leader.horse} · {b.leader.rider}</span>
            </div>
          </div>
        </div>
      </div>

      {/* fascia brand/sponsor */}
      <div style={{ borderTop: `1px solid ${C.line}`, padding: "1vh 2.2vw", display: "flex", alignItems: "center", gap: "2vw" }}>
        <span style={{ fontSize: "0.85vw", color: C.slate500 }}>penrunner.com</span>
        <div style={{ marginLeft: "auto", display: "flex", gap: "2.4vw", alignItems: "center" }}>
          {["SPONSOR A", "SPONSOR B", "SPONSOR C"].map(s => (
            <span key={s} style={{ fontSize: "0.9vw", color: C.slate500, letterSpacing: "0.14em", fontWeight: 600, opacity: 0.7 }}>{s}</span>
          ))}
        </div>
      </div>
    </div>
  );
}
