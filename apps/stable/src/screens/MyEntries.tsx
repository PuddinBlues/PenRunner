import { useCallback, useEffect, useState } from "react";
import { Badge, Banner, Confirm, Empty, errorMessage } from "@penrunner/ui";
import { PORTAL_URL, downloadDoc } from "../lib/api.js";
import type { Client } from "../lib/api.js";
import type { MessageKey, T } from "../lib/i18n.js";
import { warningView } from "../lib/warnings.js";

type MyEntry = Awaited<ReturnType<Client["entries"]["byStable"]["query"]>>[number];
type Ranking = Awaited<ReturnType<Client["live"]["classRanking"]["query"]>>;
type StableAccount = Awaited<
  ReturnType<Client["account"]["byStable"]["query"]>
>[number];

/**
 * Le mie iscrizioni: stato per binomio, draw number quando pubblicato, avvisi
 * in traccia, score dalla classifica pubblica, scratch self-serve (BR-17) con
 * conferma a tre conseguenze e messaggi umani su gate/cutoff.
 */
const FIXABLE_IN_ROSTER = new Set([
  "fise_license_missing",
  "irha_membership_missing",
  "age_birthdate_missing",
]);

export function MyEntries({
  t,
  client,
  stableId,
  session,
  onGoRoster,
}: {
  t: T;
  client: Client;
  stableId: string;
  session: string | null;
  /** fase b: l'avviso risolvibile porta DOVE si risolve (roster) */
  onGoRoster: () => void;
}) {
  const [rows, setRows] = useState<MyEntry[] | null>(null);
  const [scores, setScores] = useState<Record<string, string>>({});
  const [accounts, setAccounts] = useState<StableAccount[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [scratching, setScratching] = useState<MyEntry | null>(null);
  const [busy, setBusy] = useState(false);

  const reload = useCallback(async () => {
    try {
      const data = await client.entries.byStable.query({ stableId });
      setRows(data);
      // BR-89: il conto per evento — derivato, si ricarica insieme alle
      // iscrizioni (uno scratch non lo cambia, una conferma sì).
      client.account.byStable
        .query({ stableId })
        .then(setAccounts)
        .catch(() => setAccounts([]));
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
                    params?: Record<string, string>;
                  }[];
                  const score = scores[e.entryId];
                  return (
                    <tr key={e.entryId}>
                      <td>
                        <strong>{e.horseName}</strong> · {e.riderName}
                        <div className="muted">{e.className}</div>
                        {warnings.length > 0 && (
                          <div style={{ marginTop: 4 }}>
                            {warnings.map((w, i) => {
                              const v = warningView(w, t);
                              return (
                                <div key={i} style={{ marginTop: 4 }}>
                                  <Badge tone="warn">{v.title}</Badge>
                                  {FIXABLE_IN_ROSTER.has(w.code) && (
                                    <>
                                      {" "}
                                      <a
                                        href="#"
                                        style={{ fontSize: 12 }}
                                        onClick={(ev) => {
                                          ev.preventDefault();
                                          onGoRoster();
                                        }}
                                      >
                                        {t("warn.fixInRoster" as MessageKey)}
                                      </a>
                                    </>
                                  )}
                                  {v.body && (
                                    <div className="muted" style={{ fontSize: 12 }}>
                                      {v.body}
                                    </div>
                                  )}
                                </div>
                              );
                            })}
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
            <AccountBox
              t={t}
              account={accounts.find((a) => a.eventId === eventId)}
              stableId={stableId}
              session={session}
              onError={(msg) => setError(msg)}
            />
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

/**
 * BR-89: il conto dell'evento — SEMPRE derivato (niente salvato), stessa
 * funzione di pricing del checkout. Lo storico viene dai movimenti auditati
 * (conferma, ritiro, late entry): il conto di Sara che si aggiorna da solo.
 */
function AccountBox({
  t,
  account,
  stableId,
  session,
  onError,
}: {
  t: T;
  account: StableAccount | undefined;
  stableId: string;
  session: string | null;
  onError: (msg: string) => void;
}) {
  const [showHistory, setShowHistory] = useState(false);
  if (!account || account.quote.enrollments === 0) return null;
  const { quote, history } = account;
  const eur = (n: number) => `${n} €`;
  return (
    <div
      style={{
        marginTop: 12,
        paddingTop: 12,
        borderTop: "1px solid var(--s100, #F1F5F9)",
      }}
    >
      <div className="row" style={{ alignItems: "baseline", gap: 12, flexWrap: "wrap" }}>
        <strong>{t("account.title")}</strong>
        <span className="muted num" style={{ fontSize: 13 }}>
          {t("account.lines", {
            enrollments: String(quote.enrollments),
            classesCost: eur(quote.classesCost),
          })}{" "}
          · {t("account.feeLine", {
            horses: String(quote.horses),
            fee: eur(quote.fee),
          })}
        </span>
        <span className="num" style={{ fontWeight: 700 }}>
          {t("account.total")}: {eur(quote.total)}
        </span>
      </div>
      <p className="muted" style={{ fontSize: 12, margin: "4px 0 8px" }}>
        {t("account.derived")}
      </p>
      <div className="row" style={{ gap: 8 }}>
        <button
          className="btn small"
          onClick={() => {
            void downloadDoc(
              `/documents/event/${account.eventId}/stable/${stableId}/account.csv`,
              session,
            ).catch((err) => onError(errorMessage(err)));
          }}
        >
          {t("account.csv")}
        </button>
        {history.length > 0 && (
          <button className="btn small" onClick={() => setShowHistory((v) => !v)}>
            {showHistory ? t("account.hideHistory") : t("account.history")}
          </button>
        )}
      </div>
      {showHistory && (
        <ul className="muted" style={{ fontSize: 12.5, margin: "8px 0 0", paddingLeft: 18 }}>
          {history.map((h, i) => (
            <li key={i} className="num">
              {new Date(h.occurredAt as unknown as string).toLocaleString()} —{" "}
              {t(`account.action.${h.action.replaceAll(".", "_")}` as MessageKey)}
              {h.horseName ? ` · ${h.horseName}` : ""}
              {h.className ? ` · ${h.className}` : ""}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
