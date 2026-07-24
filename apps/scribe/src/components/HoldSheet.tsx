import { useState } from "react";
import type { MessageKey } from "../lib/i18n.js";

type T = (key: MessageKey, vars?: Record<string, string | number>) => string;

// BR-29: score in review. Il giudice trattiene per una penalità dubbia; la
// carta resta APERTA, viaggia solo l'evento con la nota del dubbio e la
// MANOVRA indicata (suggerimento del giudice: al drag il confronto parte
// già informato).
export function HoldSheet({
  t,
  maneuverCount,
  onConfirm,
  onClose,
}: {
  t: T;
  maneuverCount: number;
  onConfirm: (note: string, position?: number) => void;
  onClose: () => void;
}) {
  const [note, setNote] = useState("");
  const [position, setPosition] = useState<number | null>(null);
  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="sheet" onClick={(e) => e.stopPropagation()}>
        <div style={{ fontWeight: 700, fontSize: 17, marginBottom: 6 }}>{t("score.hold")}</div>
        <div className="hint" style={{ marginBottom: 6 }}>{t("score.holdManeuver")}</div>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 12 }}>
          {Array.from({ length: maneuverCount }, (_, i) => i + 1).map((n) => (
            <button
              key={n}
              className="ghost num"
              style={{
                width: 44,
                height: 44,
                ...(position === n
                  ? { background: "var(--warn)", color: "#fff", border: "none" }
                  : {}),
              }}
              onClick={() => setPosition((p) => (p === n ? null : n))}
            >
              {n}
            </button>
          ))}
        </div>
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder={t("score.holdNote")}
          rows={3}
          style={{ width: "100%", padding: 12, borderRadius: 8, border: "0.5px solid rgba(15,23,42,0.2)", fontFamily: "inherit", fontSize: 15, marginBottom: 16, resize: "none" }}
        />
        <div style={{ display: "flex", gap: 8 }}>
          <button className="ghost" style={{ flex: 1 }} onClick={onClose}>{t("confirm.cancel")}</button>
          <button
            className="primary"
            style={{ flex: 1.5 }}
            disabled={!note.trim()}
            onClick={() => onConfirm(note.trim(), position ?? undefined)}
          >
            {t("confirm.yes")}
          </button>
        </div>
      </div>
    </div>
  );
}
