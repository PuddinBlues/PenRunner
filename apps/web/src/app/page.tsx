// ---------------------------------------------------------------------------
// Root pubblica = pagina WIP (decisione titolare, 31/7): il deck è in mano a
// IRHA e chi visita il dominio deve trovare SOLO questa vetrina. Identità
// visiva della copertina del deck (pitch/PenRunner_Pitch_IRHA.html) SENZA il
// badge "Presentazione per IRHA". Self-contained: nessun link alle superfici
// dell'app (restano raggiungibili per la demo, non linkate), nessun asset
// esterno. Il portale /it /en e lo scoreboard NON sono toccati.
// ---------------------------------------------------------------------------

import * as React from "react";

const S = {
  page: {
    minHeight: "100vh",
    background: "#0B1120",
    color: "#FFFFFF",
    display: "flex",
    flexDirection: "column" as const,
    alignItems: "center",
    justifyContent: "center",
    textAlign: "center" as const,
    fontFamily: "-apple-system, 'Segoe UI', 'Inter', Roboto, sans-serif",
    padding: "48px 24px",
    position: "relative" as const,
  },
  wordmark: {
    fontSize: "clamp(52px, 10vw, 84px)",
    fontWeight: 800,
    letterSpacing: "-0.02em",
    margin: 0,
    lineHeight: 1.05,
  },
  tagline: {
    fontSize: "clamp(17px, 2.6vw, 24px)",
    color: "#CBD5E1",
    marginTop: 18,
    maxWidth: 720,
    lineHeight: 1.45,
  },
  soon: {
    marginTop: 40,
    fontSize: 14,
    letterSpacing: "0.18em",
    textTransform: "uppercase" as const,
    color: "#15803D",
    fontWeight: 700,
  },
  footer: {
    position: "absolute" as const,
    bottom: 32,
    fontSize: 14,
    color: "#64748B",
  },
};

export const metadata = {
  title: "PenRunner",
  description: "Tutte le gare di reining su un'unica piattaforma — veloce, sicura.",
};

export default function WipPage() {
  return (
    <main style={S.page}>
      <h1 style={S.wordmark}>PenRunner</h1>
      <p style={S.tagline}>
        Tutte le gare di reining su un&rsquo;unica piattaforma — veloce,
        sicura.
      </p>
      <p style={S.soon}>Prossimamente</p>
      <p style={S.footer}>TonettiMedia</p>
    </main>
  );
}
