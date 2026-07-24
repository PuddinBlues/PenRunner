import { useMemo } from "react";
import type { ScribeStore } from "@penrunner/core";
import type { Locale, MessageKey } from "../lib/i18n.js";
import { detectOtherDeviceActivity } from "../lib/scribe.js";
import type { ScoringBundle } from "../lib/types.js";

type T = (key: MessageKey, vars?: Record<string, string | number>) => string;

// Coda run in ordine di draw, raggruppata per BLOCCO DI DRAG (BR-27/51:
// posizioni fisse — lo scratch accorcia il blocco, il confine non si muove).
// Il drag è il momento rituale: a blocco completo si propone la firma; se
// manca qualcosa, la lista dice PERCHÉ (carte non chiuse / in review).
// Recovery implicito: alla riapertura lo store è già reidratato.
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
  onSign: (blockCardIds: string[]) => void;
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
    const held = store.heldRunIds();
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
        cardId: card?.clientCardId,
        held: run ? held.has(run.id) : false,
      };
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bundle, store, classId, judgeId, tick]);

  // Blocchi a POSIZIONI FISSE: la posizione nell'ordine pubblicato (scratch
  // inclusi) decide il blocco; l'ultimo blocco chiude la classe.
  const dragEveryN = bundle.dragEveryNRuns ?? 5;
  const blocks = useMemo(() => {
    const out: Array<{ index: number; rows: typeof rows }> = [];
    rows.forEach((r, i) => {
      const b = Math.floor(i / dragEveryN);
      if (!out[b]) out[b] = { index: b + 1, rows: [] };
      out[b].rows.push(r);
    });
    return out;
  }, [rows, dragEveryN]);

  function blockState(block: { rows: typeof rows }) {
    const active = block.rows.filter((r) => !r.scratched && r.run);
    const closed = active.filter((r) => r.cardStatus === "chiusa");
    const inReview = active.filter(
      (r) => r.held && r.cardStatus !== "chiusa" && r.cardStatus !== "firmata",
    );
    const notClosed = active.filter(
      (r) =>
        r.cardStatus !== "chiusa" && r.cardStatus !== "firmata" && !r.held,
    );
    return {
      signable: closed.map((r) => r.cardId!),
      complete: active.length > 0 && notClosed.length === 0 && inReview.length === 0,
      allSigned:
        active.length > 0 && active.every((r) => r.cardStatus === "firmata"),
      inReview: inReview.length,
      notClosed: notClosed.length,
    };
  }

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
      {blocks.map((block, bi) => {
        const st = blockState(block);
        return (
          <div key={block.index} style={{ marginBottom: 4 }}>
            <div style={{ display: "grid", gap: 8 }}>
              {block.rows.map((r) => {
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
            {/* Il confine del blocco: marker fisso + stato firma (il drag è
                il momento rituale — e se manca qualcosa, si dice PERCHÉ). */}
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                margin: "10px 0",
                fontSize: 12.5,
              }}
            >
              {bi < blocks.length - 1 && (
                <span style={{ color: "var(--slate-400)", fontWeight: 700, letterSpacing: "0.08em" }}>
                  {t("block.drag")}
                </span>
              )}
              {st.allSigned ? (
                <span style={{ color: "var(--accent)", fontWeight: 600 }}>
                  ✓ {t("block.signed")}
                </span>
              ) : st.signable.length > 0 && st.complete ? (
                <button
                  className="primary"
                  style={{ padding: "8px 14px", minHeight: 38, fontSize: 13.5 }}
                  onClick={() => onSign(st.signable)}
                >
                  {t("block.sign", { n: st.signable.length })}
                </button>
              ) : (
                <>
                  {st.signable.length > 0 && (
                    <button
                      className="ghost"
                      style={{ padding: "8px 14px", minHeight: 38, fontSize: 13.5 }}
                      onClick={() => onSign(st.signable)}
                    >
                      {t("block.sign", { n: st.signable.length })}
                    </button>
                  )}
                  {st.notClosed > 0 && (
                    <span style={{ color: "var(--slate-500)" }}>
                      {t("block.missingClosed", { n: st.notClosed })}
                    </span>
                  )}
                  {st.inReview > 0 && (
                    <span style={{ color: "var(--warn)", fontWeight: 600 }}>
                      {t("block.inReview", { n: st.inReview })}
                    </span>
                  )}
                </>
              )}
            </div>
          </div>
        );
      })}
      <p className="hint" style={{ marginTop: 8, fontSize: 12.5 }}>
        {t("runlist.tapToScore")}
      </p>
    </div>
  );
}
