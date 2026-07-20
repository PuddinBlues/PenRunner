import { useState } from "react";
import type { MessageKey } from "../lib/i18n.js";

type T = (key: MessageKey, vars?: Record<string, string | number>) => string;

// Penalità di manovra = TOTALE unico chiamato dal giudice (BR-22): nessun
// catalogo per tipo, si digita la cifra. Valori rapidi = vocabolario reale.
const QUICK = [0.5, 1, 2, 5];

export function PenaltySheet({
  t,
  isRun,
  label,
  current,
  onConfirm,
  onClose,
}: {
  t: T;
  isRun: boolean;
  label: string;
  current: number;
  onConfirm: (val: number) => void;
  onClose: () => void;
}) {
  const [val, setVal] = useState(current || 0);
  const quick = isRun ? [2, 5] : QUICK;
  const display = val === 0.5 ? "½" : String(val);
  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="sheet" onClick={(e) => e.stopPropagation()}>
        <div style={{ fontWeight: 600, marginBottom: 3 }}>{label}</div>
        <div className="hint" style={{ marginBottom: 16 }}>{t("score.penaltyHint")}</div>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 14, marginBottom: 16 }}>
          <button className="ghost" style={{ width: 48, height: 48, fontSize: 22 }} onClick={() => setVal((v) => Math.max(0, +(v - 0.5).toFixed(1)))}>−</button>
          <div className="num" style={{ width: 100, height: 64, border: `1.5px solid ${val ? "var(--warn)" : "var(--slate-300)"}`, borderRadius: 12, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 30, fontWeight: 800, color: val ? "var(--warn)" : "var(--slate-400)", background: val ? "var(--warn-bg)" : "#fff" }}>
            {val ? "−" + display : "0"}
          </div>
          <button style={{ width: 48, height: 48, fontSize: 22, background: "var(--ink)", color: "#fff" }} onClick={() => setVal((v) => +(v + 0.5).toFixed(1))}>+</button>
        </div>
        <div style={{ display: "flex", gap: 6, justifyContent: "center", marginBottom: 18 }}>
          {quick.map((q) => (
            <button key={q} className="num" style={{ padding: "8px 16px", fontWeight: 600, background: val === q ? "var(--warn)" : "var(--slate-100)", color: val === q ? "#fff" : "var(--slate-700)" }} onClick={() => setVal(q)}>
              {q === 0.5 ? "½" : q}
            </button>
          ))}
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button className="ghost" style={{ flex: 1 }} onClick={onClose}>{t("confirm.cancel")}</button>
          <button className="primary" style={{ flex: 1.5 }} onClick={() => onConfirm(val)}>{t("confirm.yes")}</button>
        </div>
      </div>
    </div>
  );
}
