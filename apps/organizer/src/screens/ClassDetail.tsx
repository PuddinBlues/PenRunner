import { useCallback, useEffect, useState } from "react";
import { navigate } from "../App.js";
import { Badge, Banner, Confirm, Empty, errorMessage } from "../components/Ui.js";
import { openPdf } from "../lib/api.js";
import type { Client } from "../lib/api.js";
import type { Locale, MessageKey, T } from "../lib/i18n.js";
import { warningView } from "../lib/warnings.js";

type EventDetailData = Awaited<ReturnType<Client["events"]["get"]["query"]>>;
type ClassRow = Awaited<
  ReturnType<Client["classes"]["listByEvent"]["query"]>
>[number];
type EntryRow = Awaited<
  ReturnType<Client["entries"]["listByClass"]["query"]>
>[number];
type DrawResult = Awaited<ReturnType<Client["draw"]["generate"]["mutate"]>>;
type StartList = Awaited<ReturnType<Client["draw"]["startList"]["query"]>>;
type Registry = Awaited<ReturnType<Client["entries"]["registryByEvent"]["query"]>>;
type RunRow = Awaited<ReturnType<Client["scoring"]["runsByClass"]["query"]>>[number];
type Ranking = Awaited<ReturnType<Client["live"]["classRanking"]["query"]>>;
type Payout = Awaited<ReturnType<Client["payout"]["classPayout"]["query"]>>;
type RunCards = Awaited<ReturnType<Client["scoring"]["runCards"]["query"]>>;

export function ClassDetail({
  t,
  locale,
  client,
  eventId,
  classId,
  session,
}: {
  t: T;
  locale: Locale;
  client: Client;
  eventId: string;
  classId: string;
  session: string;
}) {
  const [event, setEvent] = useState<EventDetailData | null>(null);
  const [cls, setCls] = useState<ClassRow | null>(null);
  const [tab, setTab] = useState<"checkin" | "draw" | "results" | "docs">("checkin");
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    try {
      const [ev, rows] = await Promise.all([
        client.events.get.query({ eventId }),
        client.classes.listByEvent.query({ eventId }),
      ]);
      setEvent(ev);
      setCls(rows.find((r) => r.id === classId) ?? null);
    } catch (err) {
      setError(errorMessage(err));
    }
  }, [client, eventId, classId]);

  useEffect(() => {
    void reload();
  }, [reload]);

  if (error) return <Banner tone="danger">{t("app.error", { msg: error })}</Banner>;
  if (!event || !cls) return <p className="muted">{t("app.loading")}</p>;

  return (
    <>
      <button className="btn small" onClick={() => navigate(`/event/${eventId}`)}>
        ← {event.name}
      </button>
      <h1 style={{ margin: "12px 0 4px" }}>{cls.name}</h1>
      <p className="muted">
        {cls.categoryCode} · Pattern {cls.patternCode} · {cls.judgesCount}{" "}
        {t("classes.judges").toLowerCase()} ·{" "}
        {t("classes.entries", { n: cls.entriesCount })}
      </p>

      <div className="tabs">
        {(
          [
            ["checkin", "checkin.title"],
            ["draw", "draw.title"],
            ["results", "results.title"],
            ["docs", "docs.title"],
          ] as const
        ).map(([key, label]) => (
          <button
            key={key}
            className={tab === key ? "active" : ""}
            onClick={() => setTab(key)}
          >
            {t(label as MessageKey)}
          </button>
        ))}
      </div>

      {tab === "checkin" && (
        <CheckIn t={t} client={client} classId={classId} onChanged={reload} />
      )}
      {tab === "draw" && (
        <Draw
          t={t}
          client={client}
          eventId={eventId}
          classId={classId}
          drawStatus={cls.drawStatus}
          surgeryEnabled={event.drawSurgeryEnabled}
          onChanged={reload}
        />
      )}
      {tab === "results" && (
        <Results t={t} locale={locale} client={client} classId={classId} session={session} />
      )}
      {tab === "docs" && (
        <Docs t={t} locale={locale} classId={classId} session={session} />
      )}
    </>
  );
}

/** Check-in con avvisi BR-18: si vede tutto, non si blocca niente. */
function CheckIn({
  t,
  client,
  classId,
  onChanged,
}: {
  t: T;
  client: Client;
  classId: string;
  onChanged: () => Promise<void>;
}) {
  const [rows, setRows] = useState<EntryRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [scratching, setScratching] = useState<string | null>(null);

  const reload = useCallback(async () => {
    try {
      setRows(await client.entries.listByClass.query({ classId }));
    } catch (err) {
      setError(errorMessage(err));
    }
  }, [client, classId]);

  useEffect(() => {
    void reload();
  }, [reload]);

  if (!rows) return <p className="muted">{t("app.loading")}</p>;

  return (
    <div className="card">
      <p className="hint">{t("checkin.note")}</p>
      {error && <div className="error-inline">{error}</div>}
      {rows.length === 0 ? (
        <Empty>{t("checkin.empty")}</Empty>
      ) : (
        <table className="tbl">
          <thead>
            <tr>
              <th className="num">{t("common.draw")}</th>
              <th>{t("checkin.status")}</th>
              <th>{t("checkin.warnings")}</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {rows.map((e) => {
              const warnings = (e.liveWarnings ?? []) as {
                code: string;
                message: string;
                params?: Record<string, string>;
              }[];
              return (
                <tr key={e.id}>
                  <td className="num">{e.drawNumber ?? "—"}</td>
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
                  <td>
                    {warnings.length === 0 ? (
                      <span className="muted">{t("checkin.noWarnings")}</span>
                    ) : (
                      warnings.map((w, i) => {
                        const v = warningView(w, t);
                        return (
                          <div key={i} style={{ marginBottom: 4 }}>
                            <Badge tone="warn">{v.title}</Badge>{" "}
                            <span className="muted">{v.body}</span>
                          </div>
                        );
                      })
                    )}
                  </td>
                  <td style={{ textAlign: "right", whiteSpace: "nowrap" }}>
                    {e.status === "confermata" && (
                      <button
                        className="btn small primary"
                        onClick={async () => {
                          setError(null);
                          try {
                            await client.entries.checkIn.mutate({ entryId: e.id });
                            await reload();
                            await onChanged();
                          } catch (err) {
                            setError(errorMessage(err));
                          }
                        }}
                      >
                        {t("checkin.do")}
                      </button>
                    )}{" "}
                    {(e.status === "confermata" || e.status === "check_in") && (
                      <button
                        className="btn small danger"
                        onClick={() => setScratching(e.id)}
                      >
                        {t("checkin.scratch")}
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
      {scratching && (
        <Confirm
          t={t}
          title={t("checkin.scratch")}
          body={t("checkin.scratchConfirm")}
          onCancel={() => setScratching(null)}
          onConfirm={async () => {
            const entryId = scratching;
            setScratching(null);
            setError(null);
            try {
              await client.entries.scratch.mutate({ entryId });
              await reload();
              await onChanged();
            } catch (err) {
              setError(errorMessage(err));
            }
          }}
        />
      )}
    </div>
  );
}

/** Draw: genera (BR-19 con warnings), pubblica, late entry, chirurgia gated (BR-43). */
function Draw({
  t,
  client,
  eventId,
  classId,
  drawStatus,
  surgeryEnabled,
  onChanged,
}: {
  t: T;
  client: Client;
  eventId: string;
  classId: string;
  drawStatus: string;
  surgeryEnabled: boolean;
  onChanged: () => Promise<void>;
}) {
  const [gap, setGap] = useState("8");
  const [result, setResult] = useState<DrawResult | null>(null);
  const [startList, setStartList] = useState<StartList | null>(null);
  const [registry, setRegistry] = useState<Registry | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirmPublish, setConfirmPublish] = useState(false);
  const [lateHorse, setLateHorse] = useState("");
  const [lateRider, setLateRider] = useState("");
  const [latePos, setLatePos] = useState("");
  const [movePos, setMovePos] = useState<Record<string, string>>({});

  const reloadStartList = useCallback(async () => {
    if (drawStatus !== "pubblicato") return;
    try {
      setStartList(await client.draw.startList.query({ classId }));
    } catch {
      setStartList(null);
    }
  }, [client, classId, drawStatus]);

  useEffect(() => {
    void reloadStartList();
    client.entries.registryByEvent
      .query({ eventId })
      .then(setRegistry)
      .catch(() => setRegistry(null));
  }, [client, eventId, reloadStartList]);

  return (
    <div className="card">
      <p className="hint">{t("draw.explain")}</p>
      {error && <div className="error-inline">{error}</div>}

      {drawStatus !== "pubblicato" && (
        <>
          <div className="row" style={{ marginBottom: 12 }}>
            <label className="field" style={{ maxWidth: 220 }}>
              <span>{t("draw.gap")}</span>
              <input
                className="num"
                type="number"
                min="0"
                max="50"
                value={gap}
                onChange={(e) => setGap(e.target.value)}
              />
            </label>
            <button
              className="btn primary"
              onClick={async () => {
                setError(null);
                try {
                  setResult(
                    await client.draw.generate.mutate({
                      classId,
                      minRiderGap: Number(gap),
                    }),
                  );
                  await onChanged();
                } catch (err) {
                  setError(errorMessage(err));
                }
              }}
            >
              {drawStatus === "generato" ? t("draw.regenerate") : t("draw.generate")}
            </button>
            {drawStatus === "generato" && (
              <button className="btn" onClick={() => setConfirmPublish(true)}>
                {t("draw.publish")}
              </button>
            )}
          </div>
          {result && (
            <div style={{ marginBottom: 12 }}>
              <Badge tone={result.warnings.length ? "warn" : "green"}>
                {t("draw.achievedGap", {
                  gap: result.achievedGap ?? "—",
                  target: result.targetGap,
                })}
              </Badge>{" "}
              {result.warnings.length > 0 && (
                <Badge tone="warn">
                  {t("draw.warnings", { n: result.warnings.length })}
                </Badge>
              )}
            </div>
          )}
          {drawStatus === "nessuno" && !result && <Empty>{t("draw.empty")}</Empty>}
          {drawStatus === "generato" && (
            <Badge tone="info">{t("draw.generated")}</Badge>
          )}
        </>
      )}

      {confirmPublish && (
        <Confirm
          t={t}
          title={t("draw.publish")}
          body={t("draw.publishConfirm", {
            surgery: surgeryEnabled ? t("draw.publishConfirmSurgery") : "",
          })}
          onCancel={() => setConfirmPublish(false)}
          onConfirm={async () => {
            setConfirmPublish(false);
            setError(null);
            try {
              await client.draw.publish.mutate({ classId });
              await onChanged();
              await reloadStartList();
            } catch (err) {
              setError(errorMessage(err));
            }
          }}
        />
      )}

      {drawStatus === "pubblicato" && (
        <>
          <Badge tone="green">{t("draw.published")}</Badge>
          {startList && (
            <table className="tbl" style={{ margin: "12px 0" }}>
              <tbody>
                {startList.entries.map((e) => (
                  <tr
                    key={e.entryId}
                    className={
                      startList.dragAfter.includes(e.drawNumber! - 1) ? "drag" : ""
                    }
                  >
                    <td className="num" style={{ width: 40 }}>
                      {e.drawNumber}
                    </td>
                    <td style={e.scratched ? { textDecoration: "line-through" } : {}}>
                      <strong>{e.horseName}</strong> · {e.riderName}
                      {e.scratched && (
                        <>
                          {" "}
                          <Badge tone="danger">{t("entry.ritirata")}</Badge>
                        </>
                      )}
                    </td>
                    <td style={{ textAlign: "right", whiteSpace: "nowrap" }}>
                      {surgeryEnabled && !e.scratched && (
                        <span>
                          <input
                            className="num"
                            style={{ width: 64, display: "inline-block" }}
                            type="number"
                            min="1"
                            placeholder={t("draw.moveTo")}
                            value={movePos[e.entryId] ?? ""}
                            onChange={(ev) =>
                              setMovePos((m) => ({
                                ...m,
                                [e.entryId]: ev.target.value,
                              }))
                            }
                          />{" "}
                          <button
                            className="btn small"
                            disabled={!movePos[e.entryId]}
                            onClick={async () => {
                              setError(null);
                              try {
                                await client.draw.setPosition.mutate({
                                  entryId: e.entryId,
                                  position: Number(movePos[e.entryId]),
                                });
                                await reloadStartList();
                              } catch (err) {
                                setError(errorMessage(err));
                              }
                            }}
                          >
                            {t("draw.move")}
                          </button>
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          <h2>{t("draw.lateEntry")}</h2>
          <p className="hint">{t("draw.lateExplain")}</p>
          {registry && registry.horses.length > 0 ? (
            <div className="row">
              <label className="field">
                <span>{t("draw.lateHorse")}</span>
                <select value={lateHorse} onChange={(e) => setLateHorse(e.target.value)}>
                  <option value="" />
                  {registry.horses.map((h) => (
                    <option key={h.id} value={h.id}>
                      {h.name} ({h.microchip})
                    </option>
                  ))}
                </select>
              </label>
              <label className="field">
                <span>{t("draw.lateRider")}</span>
                <select value={lateRider} onChange={(e) => setLateRider(e.target.value)}>
                  <option value="" />
                  {registry.riders.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.fullName}
                    </option>
                  ))}
                </select>
              </label>
              {surgeryEnabled && (
                <label className="field" style={{ maxWidth: 140 }}>
                  <span>{t("draw.latePosition")}</span>
                  <input
                    className="num"
                    type="number"
                    min="1"
                    value={latePos}
                    onChange={(e) => setLatePos(e.target.value)}
                  />
                </label>
              )}
              <button
                className="btn primary"
                disabled={!lateHorse || !lateRider}
                onClick={async () => {
                  setError(null);
                  try {
                    await client.draw.addLateEntry.mutate({
                      classId,
                      horseId: lateHorse,
                      riderId: lateRider,
                      ...(surgeryEnabled && latePos
                        ? { position: Number(latePos) }
                        : {}),
                    });
                    setLateHorse("");
                    setLateRider("");
                    setLatePos("");
                    await reloadStartList();
                    await onChanged();
                  } catch (err) {
                    setError(errorMessage(err));
                  }
                }}
              >
                {t("draw.lateAdd")}
              </button>
            </div>
          ) : (
            <p className="muted">{t("draw.lateNoRegistry")}</p>
          )}
        </>
      )}
    </div>
  );
}

/** Risultati: run → carte → valida (BR-27/29), pubblica classe, classifica e payout. */
function Results({
  t,
  locale,
  client,
  classId,
  session,
}: {
  t: T;
  locale: Locale;
  client: Client;
  classId: string;
  session: string;
}) {
  const [runs, setRuns] = useState<RunRow[] | null>(null);
  const [ranking, setRanking] = useState<Ranking | null>(null);
  const [payout, setPayout] = useState<Payout | null>(null);
  const [cards, setCards] = useState<Record<string, RunCards>>({});
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [mismatchRun, setMismatchRun] = useState<string | null>(null);

  const reload = useCallback(async () => {
    try {
      const [r, rk] = await Promise.all([
        client.scoring.runsByClass.query({ classId }),
        client.live.classRanking.query({ classId }),
      ]);
      setRuns(r);
      setRanking(rk);
      client.payout.classPayout
        .query({ classId })
        .then(setPayout)
        .catch(() => setPayout(null));
    } catch (err) {
      setError(errorMessage(err));
    }
  }, [client, classId]);

  useEffect(() => {
    void reload();
  }, [reload]);

  if (!runs) return <p className="muted">{t("app.loading")}</p>;

  const validate = async (runId: string, acknowledgeMismatch: boolean) => {
    setError(null);
    try {
      await client.scoring.validateRun.mutate({ runId, acknowledgeMismatch });
      setMismatchRun(null);
      await reload();
    } catch (err) {
      const msg = errorMessage(err);
      if (msg.includes("Mismatch")) setMismatchRun(runId);
      else setError(msg);
    }
  };

  return (
    <>
      <div className="card">
        <p className="hint">{t("results.explain")}</p>
        {error && <div className="error-inline">{error}</div>}
        {notice && <div className="ok-inline">{notice}</div>}
        {runs.length === 0 ? (
          <Empty>{t("results.empty")}</Empty>
        ) : (
          <table className="tbl">
            <tbody>
              {runs.map((r) => (
                <RunRowView
                  key={r.runId}
                  t={t}
                  locale={locale}
                  r={r}
                  cards={cards[r.runId]}
                  session={session}
                  mismatch={mismatchRun === r.runId}
                  onExpand={async () => {
                    try {
                      const c = await client.scoring.runCards.query({
                        runId: r.runId,
                      });
                      setCards((prev) => ({ ...prev, [r.runId]: c }));
                    } catch (err) {
                      setError(errorMessage(err));
                    }
                  }}
                  onValidate={(ack) => validate(r.runId, ack)}
                />
              ))}
            </tbody>
          </table>
        )}
        <div style={{ marginTop: 16 }}>
          <button
            className="btn primary"
            onClick={async () => {
              setError(null);
              setNotice(null);
              try {
                const res = await client.scoring.publishClass.mutate({ classId });
                setNotice(
                  t("results.publishOutcome", {
                    n: res.published,
                    w: res.warnings.length,
                  }),
                );
                await reload();
              } catch (err) {
                setError(errorMessage(err));
              }
            }}
          >
            {t("results.publishClass")}
          </button>
        </div>
      </div>

      {ranking && ranking.ranking.length > 0 && (
        <div className="card">
          <h2>
            {t("results.ranking")}{" "}
            <Badge tone={ranking.official ? "green" : "warn"}>
              {ranking.official ? t("results.official") : t("results.provisional")}
            </Badge>
          </h2>
          {!ranking.official && <p className="hint">{t("results.officialNote")}</p>}
          <table className="tbl">
            <thead>
              <tr>
                <th className="num">{t("results.place")}</th>
                <th>{t("checkin.horse")} / {t("checkin.rider")}</th>
                <th className="num" style={{ textAlign: "right" }}>
                  {t("results.score")}
                </th>
              </tr>
            </thead>
            <tbody>
              {ranking.ranking.map((row) => (
                <tr key={row.entryId}>
                  <td className="num">
                    {row.position ?? "—"}
                    {row.sharedPosition ? "=" : ""}
                  </td>
                  <td>
                    <strong>{row.horseName}</strong> · {row.riderName}
                  </td>
                  <td className="num" style={{ textAlign: "right" }}>
                    {row.label ?? (row.total !== null ? row.total.toFixed(1) : "—")}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {payout && (
        <div className="card">
          <h2>
            {t("payout.title")}{" "}
            <span className="num muted">
              {t("payout.purse")}: {(payout.purse.purseCents / 100).toFixed(2)} €
            </span>
          </h2>
          <p className="hint">{t("payout.disclaimer")}</p>
          <table className="tbl">
            <tbody>
              {payout.placements.map((p) => (
                <tr key={p.rank}>
                  <td className="num" style={{ width: 40 }}>
                    {p.rank}
                  </td>
                  <td>
                    {p.binomi.map((b) => (
                      <div key={b.entryId}>
                        {b.horseName} · {b.riderName}
                      </div>
                    ))}
                  </td>
                  <td className="num" style={{ textAlign: "right" }}>
                    {(p.amountCents / 100).toFixed(2)} €
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}

function RunRowView({
  t,
  locale,
  r,
  cards,
  session,
  mismatch,
  onExpand,
  onValidate,
}: {
  t: T;
  locale: Locale;
  r: RunRow;
  cards: RunCards | undefined;
  session: string;
  mismatch: boolean;
  onExpand: () => Promise<void>;
  onValidate: (ack: boolean) => void;
}) {
  return (
    <>
      <tr>
        <td className="num" style={{ width: 40 }}>
          {r.drawNumber ?? "—"}
        </td>
        <td>
          <strong>{r.horseName}</strong> · {r.riderName}
          {r.reviewHeldAt && (
            <>
              {" "}
              <Badge tone="warn">{t("results.inReview")}</Badge>{" "}
              <Badge tone={r.reviewSource === "sistema" ? "danger" : "info"}>
                {r.reviewSource === "sistema"
                  ? t("results.reviewSystem")
                  : t("results.reviewJudge")}
              </Badge>
              <div className="muted">
                {r.reviewPosition !== null &&
                  `${t("results.reviewManeuver", { n: r.reviewPosition })} — `}
                {r.reviewNote}
              </div>
            </>
          )}
        </td>
        <td>
          <Badge
            tone={
              r.status === "pubblicata"
                ? "green"
                : r.status === "validata"
                  ? "info"
                  : undefined
            }
          >
            {t(`run.${r.status}` as MessageKey)}
          </Badge>
        </td>
        <td style={{ textAlign: "right", whiteSpace: "nowrap" }}>
          <button className="btn small" onClick={onExpand}>
            {t("results.cards")}
          </button>{" "}
          {r.status === "in_attesa_firma" || r.status === "in_inserimento" ? (
            <button className="btn small primary" onClick={() => onValidate(false)}>
              {t("results.validate")}
            </button>
          ) : null}
        </td>
      </tr>
      {mismatch && (
        <tr>
          <td colSpan={4}>
            <Banner tone="warn">
              {t("results.mismatch")}{" "}
              <button className="btn small" onClick={() => onValidate(true)}>
                {t("results.acknowledge")}
              </button>
            </Banner>
          </td>
        </tr>
      )}
      {cards && (
        <tr>
          <td colSpan={4}>
            {cards.cards.length === 0 ? (
              <span className="muted">—</span>
            ) : (
              cards.cards.map(({ card, total, outcome }) => (
                <div key={card.id} style={{ display: "flex", gap: 12, alignItems: "center" }}>
                  <span className="num">
                    {outcome === "scored" && total !== null
                      ? total.toFixed(1)
                      : outcome}
                  </span>
                  <Badge tone={card.status === "firmata" || card.status === "validata" ? "green" : undefined}>
                    {card.status}
                  </Badge>
                  {card.engineMismatch && <Badge tone="warn">mismatch</Badge>}
                  <button
                    className="btn small"
                    onClick={() =>
                      void openPdf(
                        `/documents/run/${r.runId}/scorecard/${card.judgeId}.pdf?locale=${locale}`,
                        session,
                      )
                    }
                  >
                    {t("docs.scorecard")}
                  </button>
                </div>
              ))
            )}
          </td>
        </tr>
      )}
    </>
  );
}

/** Documenti PDF, sempre derivati live. */
function Docs({
  t,
  locale,
  classId,
  session,
}: {
  t: T;
  locale: Locale;
  classId: string;
  session: string;
}) {
  const [error, setError] = useState<string | null>(null);
  const open = (path: string) =>
    openPdf(`${path}?locale=${locale}`, session).catch((err) =>
      setError(errorMessage(err)),
    );
  return (
    <div className="card">
      <p className="hint">{t("docs.explain")}</p>
      {error && <div className="error-inline">{error}</div>}
      <div className="row">
        <button
          className="btn"
          onClick={() => void open(`/documents/class/${classId}/start-list.pdf`)}
        >
          {t("docs.startList")} (PDF)
        </button>
        <button
          className="btn"
          onClick={() => void open(`/documents/class/${classId}/results.pdf`)}
        >
          {t("docs.results")} (PDF)
        </button>
        <button
          className="btn"
          onClick={() => void open(`/documents/class/${classId}/payout.pdf`)}
        >
          {t("docs.payout")} (PDF)
        </button>
      </div>
    </div>
  );
}
