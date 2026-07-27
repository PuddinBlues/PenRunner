import { useMemo, useState } from "react";
import { prepareSignatureBatch, type ScribeStore } from "@penrunner/core";
import type { MessageKey } from "../lib/i18n.js";
import type { ScoringBundle } from "../lib/types.js";
import { SignaturePad } from "../components/SignaturePad.js";

type T = (key: MessageKey, vars?: Record<string, string | number>) => string;

// BR-27 (validata col giudice): la firma è in BATCH A OGNI DRAG — il blocco
// di carte chiuse dal drag precedente; l'ultimo blocco chiude la classe. Il
// giudice rivede l'elenco con OGNI totale visibile, firma una volta; dopo,
// immutabili. `blockCardIds` delimita il blocco (vuoto = tutte le chiuse:
// chi salta un blocco firma due blocchi al drag dopo).
export function Signing({
  t,
  bundle,
  store,
  classId,
  judgeId,
  blockCardIds,
  onMutate,
  onDone,
}: {
  t: T;
  bundle: ScoringBundle;
  store: ScribeStore;
  classId: string;
  judgeId: string;
  blockCardIds: string[];
  onMutate: () => void;
  onDone: () => void;
}) {
  const [stroke, setStroke] = useState<string | null>(null);

  // carte CHIUSE non firmate del giudice, coi totali (dal motore)
  const items = useMemo(() => {
    const runIdsOfClass = bundle.entries
      .filter((e) => e.classId === classId)
      .map((e) => bundle.runs.find((r) => r.entryId === e.id)?.id)
      .filter((x): x is string => Boolean(x));
    const cards = runIdsOfClass.map((rid) => store.cardForRun(rid, judgeId));
    const closed = cards.filter(
      (c) =>
        c &&
        c.status === "chiusa" &&
        (blockCardIds.length === 0 || blockCardIds.includes(c.clientCardId)),
    );
    const batch = prepareSignatureBatch(
      closed.map((c) => ({
        ref: c!.clientCardId,
        card: { maneuvers: c!.maneuvers, runPenalty: c!.runPenalty, special: c!.special },
        expectedManeuvers: c!.maneuvers.length,
      })),
    );
    return batch.map((b) => {
      const card = store.card(b.ref);
      const run = bundle.runs.find((r) => r.id === card.runId)!;
      const entry = bundle.entries.find((e) => e.id === run.entryId)!;
      return {
        clientCardId: b.ref,
        drawNumber: entry.drawNumber,
        horse: bundle.horses?.[entry.horseId] ?? entry.horseId.slice(0, 6),
        total: b.display.breakdown,
      };
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bundle, store, classId, judgeId]);

  const fmt = (bd: (typeof items)[number]["total"]) =>
    bd.outcome === "no_score" ? "NS" : bd.outcome === "score_0" ? "0" : bd.total!.toFixed(1);

  const sign = async () => {
    await store.signBatch(items.map((i) => ({ clientCardId: i.clientCardId, ...(stroke ? { signatureStroke: stroke } : {}) })));
    onMutate();
    onDone();
  };

  return (
    <div className="content">
      <h1 style={{ fontSize: 20 }}>{t("sign.title")}</h1>
      <p className="hint">{t("sign.intro")}</p>

      {items.length === 0 ? (
        <p className="hint" style={{ marginTop: 16 }}>{t("sign.nothing")}</p>
      ) : (
        <>
          <div className="card" style={{ marginTop: 12, overflow: "hidden" }}>
            {items.map((i) => (
              <div key={i.clientCardId} style={{ display: "flex", gap: 12, padding: "12px 14px", borderTop: "0.5px solid rgba(15,23,42,0.08)", alignItems: "baseline" }}>
                <span className="num" style={{ fontWeight: 700, width: 28 }}>{i.drawNumber}</span>
                <span style={{ flex: 1 }}>{i.horse}</span>
                <span className="num" style={{ fontWeight: 800, fontSize: 18, color: i.total.outcome === "scored" && (i.total.total ?? 70) < 70 ? "var(--amber)" : "var(--ink)" }}>
                  {fmt(i.total)}
                </span>
              </div>
            ))}
          </div>

          <div style={{ marginTop: 18 }}>
            <div className="hint" style={{ marginBottom: 6 }}>{t("sign.drawSignature")}</div>
            <SignaturePad onChange={setStroke} />
          </div>

          <button className="primary" style={{ marginTop: 16 }} onClick={sign}>
            {t("sign.signAll", { n: items.length })}
          </button>
        </>
      )}
      <button className="ghost" style={{ width: "100%", marginTop: 10 }} onClick={onDone}>
        {t("common.back")}
      </button>
    </div>
  );
}
