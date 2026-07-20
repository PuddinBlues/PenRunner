import { useEffect, useMemo, useState } from "react";
import type { ScribeStore } from "@penrunner/core";
import type { Locale, MessageKey } from "../lib/i18n.js";
import { breakdownOf, syncNow } from "../lib/scribe.js";
import type { ScoringBundle, Session } from "../lib/types.js";
import { PenaltySheet } from "../components/PenaltySheet.js";
import { Confirm } from "../components/Confirm.js";
import { HoldSheet } from "../components/HoldSheet.js";

type T = (key: MessageKey, vars?: Record<string, string | number>) => string;

const QUALITY = [-1.5, -1, -0.5, 0, 0.5, 1, 1.5];
const QLABEL: Record<string, string> = {
  "-1.5": "−1½", "-1": "−1", "-0.5": "−½", "0": "0", "0.5": "+½", "1": "+1", "1.5": "+1½",
};
const fmt1 = (n: number) => n.toFixed(1);

export function Scoring({
  t,
  locale,
  bundle,
  store,
  session,
  judgeId,
  runId,
  onMutate,
  onDone,
}: {
  t: T;
  locale: Locale;
  bundle: ScoringBundle;
  store: ScribeStore;
  session: Session;
  judgeId: string;
  runId: string;
  onMutate: () => void;
  onDone: () => void;
}) {
  const run = bundle.runs.find((r) => r.id === runId)!;
  const entry = bundle.entries.find((e) => e.id === run.entryId)!;
  const cls = bundle.classes.find((c) => c.id === entry.classId)!;
  const maneuverDefs = useMemo(
    () =>
      bundle.maneuvers
        .filter((m) => m.patternId === cls.patternId)
        .sort((a, b) => a.position - b.position),
    [bundle, cls.patternId],
  );

  const [cardId, setCardId] = useState<string | null>(null);
  const [, force] = useState(0);
  const bump = () => {
    force((n) => n + 1);
    onMutate();
  };
  const [penaltyFor, setPenaltyFor] = useState<number | "run" | null>(null);
  const [confirm, setConfirm] = useState<null | "close" | "score0" | "noScore">(null);
  const [holdOpen, setHoldOpen] = useState(false);

  // crea la carta e "manda in campo" al primo ingresso (registra started_at)
  useEffect(() => {
    void (async () => {
      let existing = store.cardForRun(runId, judgeId);
      if (!existing) {
        await store.createCard(runId, judgeId, maneuverDefs.length);
        await store.sendToField(runId);
        existing = store.cardForRun(runId, judgeId);
      }
      setCardId(existing!.clientCardId);
      bump();
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [runId, judgeId]);

  if (!cardId) return <div className="content" />;
  const card = store.card(cardId);
  const readonly = card.status !== "in_compilazione";
  const b = breakdownOf(card);
  const scored = card.maneuvers.filter((m) => m.quality !== null).length;
  const allScored = scored === card.maneuvers.length;
  const canClose = card.special === "no_score" || allScored;

  const setQuality = async (pos: number, q: number) => {
    const cur = card.maneuvers.find((m) => m.position === pos)!.quality;
    await store.setQuality(cardId, pos, cur === q ? null : q);
    bump();
  };
  const setSpecial = async (s: "score_0" | "no_score") => {
    await store.setSpecial(cardId, card.special === s ? null : s);
    bump();
  };

  const doClose = async () => {
    await store.closeCard(cardId);
    setConfirm(null);
    void syncNow(session, store).catch(() => undefined);
    onDone();
  };
  const reopen = async () => {
    await store.reopenCard(cardId);
    bump();
  };

  const total =
    b.outcome === "no_score" ? "NS" : b.outcome === "score_0" ? "0" : fmt1(b.total!);
  const below70 = b.outcome === "scored" && (b.total ?? 70) < 70;

  return (
    <div className="content">
      {/* binomio in campo, fissato in alto (rischio disallineamento) */}
      <div className="card" style={{ padding: 12, display: "flex", gap: 10, alignItems: "center", marginBottom: 12 }}>
        <span className="num" style={{ minWidth: 34, height: 34, borderRadius: 8, background: "var(--live)", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700 }}>
          {entry.drawNumber}
        </span>
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 600 }}>{bundle.horses?.[entry.horseId] ?? entry.horseId.slice(0, 6)}</div>
          <div className="hint" style={{ fontSize: 12.5 }}>
            {bundle.riders?.[entry.riderId] ?? ""} · {cls.name} · Pattern {bundle.patterns.find((p) => p.id === cls.patternId)?.code}
          </div>
        </div>
        <div className="hint num">{scored}/{card.maneuvers.length}</div>
      </div>

      {card.status === "chiusa" && (
        <div className="card" style={{ padding: 12, marginBottom: 12, background: "var(--slate-50)" }}>
          <span className="hint">{t("run.closed")} · {total}</span>
          <button className="ghost" style={{ marginTop: 8, width: "100%" }} onClick={reopen}>
            {t("score.reopen")}
          </button>
        </div>
      )}

      {/* manovre: righe con numero + label dal pattern */}
      <div style={{ opacity: card.special === "no_score" ? 0.4 : 1, pointerEvents: readonly || card.special === "no_score" ? "none" : "auto" }}>
        {maneuverDefs.map((m) => {
          const sc = card.maneuvers.find((x) => x.position === m.position)!;
          return (
            <div key={m.position} style={{ marginBottom: 12 }}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                <span style={{ fontSize: 13.5, color: "var(--slate-700)" }}>
                  {m.position} · {locale === "en" && m.labelEn ? m.labelEn : m.labelIt}
                </span>
                <span className="num" style={{ fontWeight: 700, color: sc.quality === null ? "var(--slate-300)" : sc.quality > 0 ? "var(--accent)" : sc.quality < 0 ? "var(--warn)" : "var(--ink)" }}>
                  {sc.quality === null ? "—" : QLABEL[String(sc.quality)]}
                </span>
              </div>
              <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
                <div style={{ flex: 1, display: "flex", gap: 3 }}>
                  {QUALITY.map((q) => {
                    const on = sc.quality === q;
                    return (
                      <button
                        key={q}
                        className={`qbtn${on ? (q > 0 ? " on-pos" : q < 0 ? " on-neg" : " on-zero") : ""}`}
                        onClick={() => setQuality(m.position, q)}
                      >
                        {QLABEL[String(q)]}
                      </button>
                    );
                  })}
                </div>
                <button
                  onClick={() => setPenaltyFor(m.position)}
                  className="num"
                  style={{
                    minWidth: 46,
                    height: 40,
                    borderRadius: 6,
                    fontWeight: 700,
                    background: sc.penalty ? "var(--warn)" : "#fff",
                    color: sc.penalty ? "#fff" : "var(--slate-400)",
                    border: sc.penalty ? "none" : "0.5px solid rgba(15,23,42,0.16)",
                  }}
                >
                  {sc.penalty ? "−" + (sc.penalty === 0.5 ? "½" : sc.penalty) : "⚑"}
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {/* penalità di percorso + esiti (zona separata: rischio tocco accidentale) */}
      <div style={{ display: "flex", gap: 7, marginTop: 8 }}>
        <button
          onClick={() => setPenaltyFor("run")}
          className="num"
          style={{ flex: 1, padding: "10px 4px", fontWeight: 600, background: card.runPenalty ? "var(--warn)" : "#fff", color: card.runPenalty ? "#fff" : "var(--warn)", border: card.runPenalty ? "none" : "0.5px solid rgba(180,83,9,0.4)" }}
        >
          {card.runPenalty ? `${t("score.runPenalty")} −${card.runPenalty}` : t("score.runPenalty")}
        </button>
        <button
          onClick={() => (card.special === "score_0" ? setSpecial("score_0") : setConfirm("score0"))}
          style={{ flex: 1, padding: "10px 4px", fontWeight: 600, background: card.special === "score_0" ? "var(--warn)" : "#fff", color: card.special === "score_0" ? "#fff" : "var(--warn)", border: card.special === "score_0" ? "none" : "0.5px solid rgba(180,83,9,0.4)" }}
        >
          {t("score.score0")}
        </button>
        <button
          onClick={() => (card.special === "no_score" ? setSpecial("no_score") : setConfirm("noScore"))}
          style={{ flex: 1, padding: "10px 4px", fontWeight: 600, background: card.special === "no_score" ? "var(--danger)" : "#fff", color: card.special === "no_score" ? "#fff" : "var(--danger)", border: card.special === "no_score" ? "none" : "0.5px solid rgba(185,28,28,0.4)" }}
        >
          {t("score.noScore")}
        </button>
      </div>

      {/* score provvisorio live, viraggio ambra sotto 70 */}
      <div style={{ background: "var(--ink-900)", borderRadius: 12, padding: "14px 16px", display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 14, color: "#fff" }}>
        <div>
          <div style={{ fontSize: 10.5, color: "var(--slate-400)", textTransform: "uppercase", letterSpacing: "0.5px" }}>{t("score.provisional")}</div>
          <div className="hint" style={{ fontSize: 11, color: "var(--slate-400)" }}>
            {b.outcome === "no_score" ? t("score.outOfRanking") : b.outcome === "score_0" ? t("score.outOfPattern") : `70 · ${b.qualitySum >= 0 ? "+" : ""}${b.qualitySum} · −${b.maneuverPenaltySum + b.runPenalty}`}
          </div>
        </div>
        <div className="num" style={{ fontSize: 30, fontWeight: 800, color: b.outcome === "no_score" ? "var(--slate-400)" : below70 ? "var(--amber)" : "var(--accent-500)" }}>
          {total}
        </div>
      </div>

      {!readonly && (
        <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
          <button className="ghost" style={{ flex: 1 }} onClick={() => setHoldOpen(true)}>
            {t("score.hold")}
          </button>
          <button className="primary" style={{ flex: 1.4 }} disabled={!canClose} onClick={() => setConfirm("close")}>
            {canClose ? t("score.close") : t("score.missingManeuvers", { n: card.maneuvers.length - scored })}
          </button>
        </div>
      )}
      {readonly && (
        <button className="ghost" style={{ width: "100%", marginTop: 12 }} onClick={onDone}>
          {t("common.back")}
        </button>
      )}

      {penaltyFor !== null && (
        <PenaltySheet
          t={t}
          isRun={penaltyFor === "run"}
          label={penaltyFor === "run" ? t("score.runPenalty") : t("score.penaltyTitle", { n: penaltyFor })}
          current={penaltyFor === "run" ? card.runPenalty : card.maneuvers.find((m) => m.position === penaltyFor)?.penalty ?? 0}
          onConfirm={async (val) => {
            if (penaltyFor === "run") await store.setRunPenalty(cardId, val);
            else await store.setPenalty(cardId, penaltyFor as number, val);
            setPenaltyFor(null);
            bump();
          }}
          onClose={() => setPenaltyFor(null)}
        />
      )}

      {confirm && (
        <Confirm
          t={t}
          title={confirm === "close" ? t("confirm.closeTitle") : t("score.score0")}
          body={
            confirm === "close"
              ? t("confirm.closeBody", { total })
              : confirm === "score0"
                ? t("confirm.score0Body")
                : t("confirm.noScoreBody")
          }
          onYes={async () => {
            if (confirm === "close") await doClose();
            else {
              await setSpecial(confirm === "score0" ? "score_0" : "no_score");
              setConfirm(null);
            }
          }}
          onCancel={() => setConfirm(null)}
        />
      )}

      {holdOpen && (
        <HoldSheet
          t={t}
          onConfirm={async (note) => {
            await store.holdForReview(runId, note);
            setHoldOpen(false);
            void syncNow(session, store).catch(() => undefined);
            onDone();
          }}
          onClose={() => setHoldOpen(false)}
        />
      )}
    </div>
  );
}
