import { useEffect } from "react";

// ---------------------------------------------------------------------------
// BR-83 — Aggiornamento delle PWA. Le app con service worker: controllano gli
// aggiornamenti al ritorno in primo piano e a intervallo; quando la nuova
// versione è pronta mostrano un banner discreto; MAI auto-reload (nello
// scribe un reload a sorpresa in piena run è inaccettabile); l'aggiornamento
// non tocca IndexedDB. Qui vivono i pezzi senza dipendenze dal plugin PWA:
// il cablaggio a virtual:pwa-register sta in ogni app.
// ---------------------------------------------------------------------------

/**
 * Check di aggiornamento: a ogni ritorno in primo piano (focus /
 * visibilitychange) e ogni intervalMs (default 60'). check undefined = SW
 * non ancora registrato, nessun cablaggio.
 */
export function useUpdateChecks(
  check: (() => void) | undefined,
  intervalMs = 60 * 60_000,
): void {
  useEffect(() => {
    if (!check) return;
    const onFocus = () => check();
    const onVisible = () => {
      if (!document.hidden) check();
    };
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisible);
    const id = setInterval(check, intervalMs);
    return () => {
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisible);
      clearInterval(id);
    };
  }, [check, intervalMs]);
}

/** Banner "nuova versione": discreto, in basso, l'aggiornamento è un TAP. */
export function UpdateBanner({
  message,
  actionLabel,
  note,
  onUpdate,
}: {
  message: string;
  actionLabel: string;
  /** riga aggiuntiva (es. scribe: elementi in coda di sync) */
  note?: string | undefined;
  onUpdate: () => void;
}) {
  return (
    <div
      role="status"
      style={{
        position: "fixed",
        bottom: 16,
        left: 16,
        right: 16,
        zIndex: 1000,
        background: "#0B1120",
        color: "#fff",
        borderRadius: 8,
        padding: "12px 16px",
        display: "flex",
        alignItems: "center",
        gap: 12,
        flexWrap: "wrap",
        boxShadow: "0 4px 24px rgba(0,0,0,0.35)",
      }}
    >
      <span style={{ fontSize: 14, lineHeight: 1.4 }}>
        {message}
        {note ? (
          <>
            <br />
            <span style={{ fontSize: 12, color: "#FCD34D" }}>{note}</span>
          </>
        ) : null}
      </span>
      <button
        onClick={onUpdate}
        style={{
          marginLeft: "auto",
          background: "#15803D",
          color: "#fff",
          border: "none",
          borderRadius: 8,
          padding: "8px 14px",
          fontWeight: 600,
          fontSize: 14,
          cursor: "pointer",
        }}
      >
        {actionLabel}
      </button>
    </div>
  );
}

/** Stamp di versione (SHA corto di build) — "che versione hai?" a colpo d'occhio. */
export function VersionStamp({ version }: { version: string }) {
  return (
    <span
      aria-hidden="true"
      style={{
        position: "fixed",
        bottom: 2,
        right: 6,
        zIndex: 999,
        fontSize: 10,
        color: "#94A3B8",
        opacity: 0.7,
        pointerEvents: "none",
        fontVariantNumeric: "tabular-nums",
      }}
    >
      {version}
    </span>
  );
}
