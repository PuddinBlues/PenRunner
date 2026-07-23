import { useCallback, useEffect, useState } from "react";
import { Badge, Banner, Confirm, Empty, errorMessage } from "@penrunner/ui";
import { PORTAL_URL } from "../lib/api.js";
import type { Client } from "../lib/api.js";
import type { MessageKey, T } from "../lib/i18n.js";

type MyEntry = Awaited<ReturnType<Client["entries"]["byStable"]["query"]>>[number];
type Ranking = Awaited<ReturnType<Client["live"]["classRanking"]["query"]>>;

/**
 * Le mie iscrizioni: stato per binomio, draw number quando pubblicato, avvisi
 * in traccia, score dalla classifica pubblica, scratch self-serve (BR-17) con
 * conferma a tre conseguenze e messaggi umani su gate/cutoff.
 */
export function MyEntries({
  t,
  client,
  stableId,
}: {
  t: T;
  client: Client;
  stableId: string;
}) {
  const [rows, setRows] = useState<MyEntry[] | null>(null);
  const [scores, setScores] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [scratching, setScratching] = useState<MyEntry | null>(null);
  const [busy, setBusy] = useState(false);

  const reload = useCallback(async () => {
    try {
      const data = await client.entries.byStable.query({ stableId });
      setRows(data);
      // Score pubblicati: dalla classifica PUBBLICA (fonte comune col portale),
      // solo per le classi con draw pubblicato.
      const classIds = [
        ...new Set(
          data.filter((r) => r.drawStatus === "pubblicato").map((r) => r.classId),
        ),
      ];
      const found: Record<string, string> = {};
      await Promise.all(
        classIds.map(async (classId) => {
          try {
            const ranking: Ranking = await client.live.classRanking.query({
              classId,
            });
            for (const row of ranking.ranking) {
              found[row.entryId] =
                row.label ?? (row.total !== null ? row.total.toFixed(1) : "");
            }
          } catch {
            /* classifica non ancora disponibile */
          }
        }),
      );
      setScores(found);
    } catch (err) {
      setError(errorMessage(err));
    }
  }, [client, stableId]);

  useEffect(() => {
    void reload();
  }, [reload]);

  if (!rows) return <p className="muted">{t("app.loading")}</p>;

  // Raggruppa per evento (ordine già per data dal server).
  const byEvent = new Map<string, MyEntry[]>();
  for (const r of rows) {
    byEvent.set(r.eventId, [...(byEvent.get(r.eventId) ?? []), r]);
  }

  return (
    <>
      <h1>{t("mine.title")}</h1>
      {error && <Banner tone="danger">{t("app.error", { msg: error })}</Banner>}
      {notice && <Banner tone="info">{notice}</Banner>}

      {rows.length === 0 ? (
        <div className="card">
          <Empty>{t("mine.empty")}</Empty>
        </div>
      ) : (
        [...byEvent.entries()].map(([eventId, entries]) => (
          <div className="card" key={eventId}>
            <h2>
              {entries[0]!.eventName}{" "}
              <a
                href={`${PORTAL_URL}/it/event/${eventId}`}
                target="_blank"
                rel="noreferrer"
                style={{ fontSize: 13, fontWeight: 400 }}
              >
                {t("mine.results")}
              </a>
            </h2>
            <table className="tbl">
              <tbody>
                {entries.map((e) => {
                  const warnings = (e.eligibilityWarnings ?? []) as {
                    code: string;
                    message: string;
                  }[];
                  const score = scores[e.entryId];
                  return (
                    <tr key={e.entryId}>
                      <td>
                        <strong>{e.horseName}</strong> · {e.riderName}
                        <div className="muted">{e.className}</div>
                        {warnings.length > 0 && (
                          <div>
                            {warnings.map((w, i) => (
                              <span key={i}>
                                <Badge tone="warn">{w.code}</Badge>{" "}
                              </span>
                            ))}
                          </div>
                        )}
                      </td>
                      <td className="num">
                        {e.drawStatus === "pubblicato" && e.drawNumber !== null ? (
                          <>
                            {t("mine.draw")} {e.drawNumber}
                          </>
                        ) : (
                          <span className="muted">{t("mine.drawPending")}</span>
                        )}
                        {score && (
                          <div>
                            {t("mine.score")}: <strong>{score}</strong>
                          </div>
                        )}
                      </td>
                      <td>
                        <Badge
                          tone={
                            e.status === "check_in"
                              ? "green"
                              : e.status === "ritirata"
                                ? "danger"
                                : undefined
                          }
                        >
                          {t(`entry.${e.status}` as MessageKey)}
                        </Badge>
                      </td>
                      <td style={{ textAlign: "right" }}>
                        {["confermata", "check_in"].includes(e.status) &&
                          e.eventStatus !== "concluso" && (
                            <button
                              className="btn small danger"
                              onClick={() => setScratching(e)}
                            >
                              {t("mine.scratch")}
                            </button>
                          )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ))
      )}

      {scratching && (
        <Confirm
          title={t("mine.scratchTitle")}
          body={t("mine.scratchBody")}
          confirmLabel={t("common.confirm")}
          cancelLabel={t("common.cancel")}
          onCancel={() => setScratching(null)}
          onConfirm={async () => {
            if (busy) return;
            const entry = scratching;
            setScratching(null);
            setBusy(true);
            setError(null);
            setNotice(null);
            try {
              await client.entries.scratch.mutate({ entryId: entry.entryId });
              setNotice(t("mine.scratched"));
              await reload();
            } catch (err) {
              const msg = errorMessage(err);
              // Messaggi umani, non errori tecnici: il gate e il cutoff
              // dicono COSA FARE invece (BR-80).
              if (msg.includes("si comunica all'organizzazione")) {
                setError(t("mine.scratchGateOff"));
              } else if (msg.includes("turno del binomio è già iniziato")) {
                setError(t("mine.scratchTooLate"));
              } else {
                setError(msg);
              }
            } finally {
              setBusy(false);
            }
          }}
        />
      )}
    </>
  );
}
