import type { MessageKey } from "../lib/i18n.js";

type T = (key: MessageKey, vars?: Record<string, string | number>) => string;

// Conferma INFORMATIVA, non cerimoniale: mostra COSA si conferma (il totale,
// "no score = fuori classifica"), non un "sei sicuro?" che si impara a ignorare.
export function Confirm({
  t,
  title,
  body,
  onYes,
  onCancel,
}: {
  t: T;
  title: string;
  body: string;
  onYes: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="sheet-backdrop" onClick={onCancel}>
      <div className="sheet" onClick={(e) => e.stopPropagation()}>
        <div style={{ fontWeight: 700, fontSize: 17, marginBottom: 6 }}>{title}</div>
        <div className="hint" style={{ marginBottom: 18, fontSize: 14.5 }}>{body}</div>
        <div style={{ display: "flex", gap: 8 }}>
          <button className="ghost" style={{ flex: 1 }} onClick={onCancel}>{t("confirm.cancel")}</button>
          <button className="primary" style={{ flex: 1.5 }} onClick={onYes}>{t("confirm.yes")}</button>
        </div>
      </div>
    </div>
  );
}
