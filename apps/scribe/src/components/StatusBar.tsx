import type { Locale, MessageKey } from "../lib/i18n.js";

type T = (key: MessageKey, vars?: Record<string, string | number>) => string;

// Stato offline sempre visibile (BR-81 lato pratico): online/offline e coda.
// Distinzione esplicita: "al sicuro" (persistito localmente) vs "sincronizzato".
export function StatusBar({
  t,
  locale,
  onLocale,
  online,
  queue,
}: {
  t: T;
  locale: Locale;
  onLocale: (l: Locale) => void;
  online: boolean;
  queue: { cards: number; events: number };
}) {
  const pending = queue.cards + queue.events;
  return (
    <div className="statusbar">
      <span className="dot" style={{ background: online ? "var(--accent-500)" : "var(--amber)" }} />
      <span>{online ? t("offline.online") : t("offline.offline")}</span>
      <span style={{ color: "var(--slate-400)" }}>·</span>
      <span className="num" style={{ color: pending ? "var(--amber)" : "var(--slate-400)" }}>
        {pending ? t("offline.queued", { n: pending }) : t("offline.allSynced")}
      </span>
      <button
        onClick={() => onLocale(locale === "it" ? "en" : "it")}
        style={{
          marginLeft: "auto",
          minHeight: 0,
          padding: "4px 10px",
          background: "transparent",
          color: "#fff",
          border: "0.5px solid rgba(255,255,255,0.3)",
          fontSize: 12,
        }}
      >
        {locale === "it" ? "EN" : "IT"}
      </button>
    </div>
  );
}
