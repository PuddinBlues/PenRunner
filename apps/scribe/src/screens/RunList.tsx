import { useMemo } from "react";
import type { ScribeStore } from "@penrunner/core";
import type { Locale, MessageKey } from "../lib/i18n.js";
import { detectOtherDeviceActivity } from "../lib/scribe.js";
import type { ScoringBundle } from "../lib/types.js";

type T = (key: MessageKey, vars?: Record<string, string | number>) => string;

// Coda run in ordine di draw, ogni binomio col suo stato locale. Recovery
// implicito: alla riapertura lo store è già reidratato, la coda è qui.
export function RunList({
  t,
  locale,
  bundle,
  store,
  classId,
  judgeId,
  tick,
  onScore,
  onSign,
}: {
  t: T;
  locale: Locale;
  bundle: ScoringBundle;
  store: ScribeStore;
  classId: string;
  judgeId: string;
  tick: number;
  onScore: (runId: string) => void;
  onSign: () => void;
}) {
  const otherDevice = useMemo(
    () => detectOtherDeviceActivity(bundle, store, classId, judgeId),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [bundle, store, classId, judgeId, tick],
  );

  const rows = useMemo(() => {
    const entries = bundle.entries
      .filter((e) => e.classId === classId && e.drawNumber !== null)
      .sort((a, b) => a.drawNumber! - b.drawNumber!);
    return entries.map((e) => {
      const run = bundle.runs.find((r) => r.entryId === e.id);
      const card = run ? store.cardForRun(run.id, judgeId) : undefined;
      return {
        entry: e,
        run,
        horse: bundle.horses?.[e.horseId] ?? e.horseId.slice(0, 6),
        rider: bundle.riders?.[e.riderId] ?? "",
        scratched: ["ritirata", "assente"].includes(e.status),
        cardStatus: card?.status,
      };
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bundle, store, classId, judgeId, tick]);

  const closedUnsigned = rows.filter((r) => r.cardStatus === "chiusa").length;

  function badge(r: (typeof rows)[number]): { label: string; color: string } {
    if (r.scratched) return { label: t("run.waiting"), color: "var(--slate-400)" };
    if (r.cardStatus === "firmata") return { label: t("run.signed"), color: "var(--accent)" };
    if (r.cardStatus === "chiusa") return { label: t("run.closed"), color: "var(--slate-700)" };
    if (r.run && r.run.status !== "attesa") return { label: t("run.inField"), color: "var(--live)" };
    return { label: t("run.waiting"), color: "var(--slate-400)" };
  }

  return (
    <div className="content">
      <h1 style={{ fontSize: 20 }}>{t("runlist.title")}</h1>
      {otherDevice && (
        <div
          className="card"
          style={{ padding: 12, marginBottom: 12, background: "var(--warn-bg)", borderColor: "rgba(180,83,9,0.3)" }}
        >
          <span className="hint" style={{ color: "var(--warn)" }}>
            ⚠ {t("recovery.otherDevice")}
          </span>
        </div>
      )}
      {rows.length === 0 && <p className="hint">{t("runlist.empty")}</p>}
      <div style={{ display: "grid", gap: 8 }}>
        {rows.map((r) => {
          const b = badge(r);
          return (
            <button
              key={r.entry.id}
              className="card"
              disabled={r.scratched || !r.run}
              onClick={() => r.run && onScore(r.run.id)}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 12,
                padding: 14,
                textAlign: "left",
                opacity: r.scratched ? 0.5 : 1,
                background: "#fff",
              }}
            >
              <span
                className="num"
                style={{
                  minWidth: 34,
                  height: 34,
                  borderRadius: 8,
                  background: "var(--ink)",
                  color: "#fff",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontWeight: 700,
                }}
              >
                {r.entry.drawNumber}
              </span>
              <span style={{ flex: 1 }}>
                <div style={{ fontWeight: 600 }}>{r.horse}</div>
                {r.rider && <div className="hint" style={{ fontSize: 12.5 }}>{r.rider}</div>}
              </span>
              <span style={{ fontSize: 12.5, fontWeight: 600, color: b.color }}>{b.label}</span>
            </button>
          );
        })}
      </div>

      {closedUnsigned > 0 && (
        <button className="primary" style={{ marginTop: 20 }} onClick={onSign}>
          {t("sign.title")} · {closedUnsigned}
        </button>
      )}
      <p className="hint" style={{ marginTop: 12, fontSize: 12.5 }}>
        {t("runlist.tapToScore")}
      </p>
    </div>
  );
}
