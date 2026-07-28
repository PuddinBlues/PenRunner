import { useEffect, useMemo, useState } from "react";
import { Badge, Empty, errorMessage } from "@penrunner/ui";
import type { Client } from "../lib/api.js";
import { computeFeeBreakdown, type FeeItem } from "../lib/fee.js";
import { warningView } from "../lib/warnings.js";
import type { MessageKey, T } from "../lib/i18n.js";

type OpenEvents = Awaited<ReturnType<Client["entries"]["openEvents"]["query"]>>;
type EnrollmentInfo = Awaited<
  ReturnType<Client["entries"]["enrollmentInfo"]["query"]>
>;
type RosterData = Awaited<ReturnType<Client["roster"]["list"]["query"]>>;
type BulkResult = Awaited<ReturnType<Client["entries"]["bulkCreate"]["mutate"]>>;

interface Pair {
  horseId: string;
  riderId: string;
  classIds: string[];
}

/**
 * Iscrizione massiva in tre passi: evento → griglia binomi (card + chips,
 * fee live BR-01) → riepilogo con avvisi BR-18 e quote del SERVER (fa fede
 * quella). La conferma rende la fee dovuta (BR-03) e lo dice prima.
 */
export function Enroll({
  t,
  client,
  stableId,
  onDone,
  onNeedRoster,
}: {
  t: T;
  client: Client;
  stableId: string;
  onDone: () => void;
  onNeedRoster: () => void;
}) {
  const [events, setEvents] = useState<OpenEvents | null>(null);
  const [info, setInfo] = useState<EnrollmentInfo | null>(null);
  const [roster, setRoster] = useState<RosterData | null>(null);
  const [pairs, setPairs] = useState<Pair[]>([]);
  const [step, setStep] = useState<"event" | "grid" | "review" | "done">("event");
  const [bulk, setBulk] = useState<BulkResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // menu "+ classe" della griglia desktop (indice della riga aperta)
  const [classMenuFor, setClassMenuFor] = useState<number | null>(null);

  useEffect(() => {
    void (async () => {
      try {
        const [ev, ro] = await Promise.all([
          client.entries.openEvents.query(),
          client.roster.list.query({ stableId }),
        ]);
        setEvents(ev);
        setRoster(ro);
      } catch (err) {
        setError(errorMessage(err));
      }
    })();
  }, [client, stableId]);

  const classFees = useMemo(() => {
    const map: Record<string, number> = {};
    for (const c of info?.classes ?? []) map[c.id] = Number(c.entryFee);
    return map;
  }, [info]);

  const items = useMemo(
    () =>
      pairs.flatMap((p) =>
        p.classIds.map((classId) => ({
          horseId: p.horseId,
          riderId: p.riderId,
          classId,
        })),
      ),
    [pairs],
  );

  // Coppie (classe, cavallo) già iscritte: la chip lo dice PRIMA del
  // checkout, col motivo — mai scoprire il duplicato alla conferma.
  const enrolledBy = useMemo(() => {
    const m = new Map<string, string>();
    for (const e of info?.enrolled ?? []) m.set(`${e.classId}:${e.horseId}`, e.status);
    return m;
  }, [info]);
  const breakdown = useMemo(
    () =>
      computeFeeBreakdown(
        items satisfies FeeItem[],
        classFees,
        Number(info?.event.feePerHorse ?? 0),
      ),
    [items, classFees, info],
  );

  const submitAll = async () => {
    setBusy(true); // rete del doppio tap: il bottone si spegne in volo
    setError(null);
    try {
      const created = await client.entries.bulkCreate.mutate({
        stableId,
        items: items.map(({ classId, horseId, riderId }) => ({
          classId,
          horseId,
          riderId,
        })),
      });
      await client.entries.confirm.mutate({
        entryIds: created.entries.map((e) => e.entryId),
      });
      setBulk(created);
      setStep("done");
    } catch (err) {
      const msg = errorMessage(err);
      // Il server NOMINA il binomio duplicato: passa così com'è. Il fallback
      // resta solo per il backstop del vincolo (corsa concorrente).
      setError(
        msg.includes("entries_class_horse") ? t("enroll.alreadyEntered") : msg,
      );
    } finally {
      setBusy(false);
    }
  };

  if (error && !events) {
    return <div className="banner danger">{t("app.error", { msg: error })}</div>;
  }
  if (!events || !roster) return <p className="muted">{t("app.loading")}</p>;

  // BR-80: senza roster non si compila la griglia — si dice il passo.
  if (roster.horses.length === 0 || roster.members.length === 0) {
    return (
      <div className="card">
        <Empty>
          {t("enroll.needRoster")}{" "}
          <div style={{ marginTop: 12 }}>
            <button className="btn primary" onClick={onNeedRoster}>
              {t("enroll.goRoster")}
            </button>
          </div>
        </Empty>
      </div>
    );
  }

  if (step === "event") {
    return (
      <>
        <h1>{t("enroll.pickEvent")}</h1>
        {events.length === 0 ? (
          <div className="card">
            <Empty>{t("enroll.noEvents")}</Empty>
          </div>
        ) : (
          events.map((e) => (
            <div
              key={e.id}
              className="card event-card"
              onClick={async () => {
                setError(null);
                try {
                  setInfo(await client.entries.enrollmentInfo.query({ eventId: e.id }));
                  setPairs([
                    {
                      horseId: roster.horses[0]!.id,
                      riderId: roster.members[0]!.personId,
                      classIds: [],
                    },
                  ]);
                  setStep("grid");
                } catch (err) {
                  setError(errorMessage(err));
                }
              }}
            >
              <div style={{ flex: 1 }}>
                <strong className={e.tier === "premium" ? "tier-premium" : ""}>
                  {e.name}
                </strong>
                <div className="dates num">
                  {e.venue} · {e.startDate} → {e.endDate}
                </div>
              </div>
              <Badge tone="green">
                {t("enroll.feePerHorse", { fee: Number(e.feePerHorse) })}
              </Badge>
            </div>
          ))
        )}
        {error && <div className="error-inline">{error}</div>}
      </>
    );
  }

  if (!info) return <p className="muted">{t("app.loading")}</p>;

  if (step === "grid") {
    return (
      <>
        <button className="btn small" onClick={() => setStep("event")}>
          ← {t("app.back")}
        </button>
        <div className="enroll-mobile">
        <h1 style={{ marginTop: 12 }}>{t("enroll.grid")}</h1>
        <p className="hint">{t("enroll.gridHint")}</p>

        {pairs.map((pair, i) => (
          <div className="card" key={i}>
            <div className="row" style={{ marginBottom: 12 }}>
              <label className="field">
                <span>{t("enroll.horse")}</span>
                <select
                  value={pair.horseId}
                  onChange={(e) =>
                    setPairs((ps) =>
                      ps.map((p, j) => (j === i ? { ...p, horseId: e.target.value } : p)),
                    )
                  }
                >
                  {roster.horses.map((h) => (
                    <option key={h.id} value={h.id}>
                      {h.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="field">
                <span>{t("enroll.rider")}</span>
                <select
                  value={pair.riderId}
                  onChange={(e) =>
                    setPairs((ps) =>
                      ps.map((p, j) => (j === i ? { ...p, riderId: e.target.value } : p)),
                    )
                  }
                >
                  {roster.members.map((m) => (
                    <option key={m.personId} value={m.personId}>
                      {m.fullName}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <div className="chips">
              {info.classes.map((c) => {
                const on = pair.classIds.includes(c.id);
                const full = c.remaining !== null && c.remaining <= 0 && !on;
                const enrolledStatus = enrolledBy.get(`${c.id}:${pair.horseId}`);
                const scratched =
                  enrolledStatus === "ritirata" || enrolledStatus === "assente";
                // stesso cavallo, stessa classe in un'altra riga della griglia
                const dupRow =
                  !on &&
                  !enrolledStatus &&
                  pairs.some(
                    (p, j) =>
                      j !== i &&
                      p.horseId === pair.horseId &&
                      p.classIds.includes(c.id),
                  );
                const locked = Boolean(enrolledStatus) || dupRow;
                return (
                  <button
                    key={c.id}
                    className={`chip ${on ? "on" : ""}`}
                    disabled={full || locked}
                    onClick={() =>
                      setPairs((ps) =>
                        ps.map((p, j) =>
                          j === i
                            ? {
                                ...p,
                                classIds: on
                                  ? p.classIds.filter((id) => id !== c.id)
                                  : [...p.classIds, c.id],
                              }
                            : p,
                        ),
                      )
                    }
                  >
                    {c.name} · <span className="num">{Number(c.entryFee)} €</span>
                    {enrolledStatus && (
                      <> · {scratched ? t("enroll.scratchedLock") : t("enroll.alreadyIn")}</>
                    )}
                    {dupRow && <> · {t("enroll.dupRow")}</>}
                    {!locked && full && <> · {t("enroll.full")}</>}
                    {!locked && !full && c.remaining !== null && (
                      <> · {t("enroll.left", { n: c.remaining })}</>
                    )}
                  </button>
                );
              })}
            </div>
            <div style={{ marginTop: 12, textAlign: "right" }}>
              <button
                className="btn small danger"
                onClick={() => setPairs((ps) => ps.filter((_, j) => j !== i))}
              >
                {t("enroll.removePair")}
              </button>
            </div>
          </div>
        ))}

        <button
          className="btn"
          style={{ marginBottom: 16 }}
          onClick={() =>
            setPairs((ps) => [
              ...ps,
              {
                horseId: roster.horses[0]!.id,
                riderId: roster.members[0]!.personId,
                classIds: [],
              },
            ])
          }
        >
          {t("enroll.addPair")}
        </button>

        <div className="total-bar">
          <span>
            {t("enroll.classesCost", { n: breakdown.enrollments })}:{" "}
            <span className="num">{breakdown.classesCost} €</span> ·{" "}
            {t("enroll.fee", { n: breakdown.horses })}:{" "}
            <span className="num">{breakdown.fee} €</span>
          </span>
          <button
            className="btn primary"
            disabled={items.length === 0}
            onClick={() => setStep("review")}
          >
            {t("enroll.continue")} · <span className="num">{breakdown.total} €</span>
          </button>
        </div>
        {error && <div className="error-inline">{error}</div>}
        </div>

        {/* Desktop ≥1024 (prototipo IscrizioneMassiva: griglia tabellare +
            riepilogo sticky, conferma diretta dal riepilogo) */}
        <div className="enroll-desktop">
          <div>
            <div className="muted" style={{ marginBottom: 2 }}>
              {info.event.venue} · <span className="num">{info.event.startDate} → {info.event.endDate}</span>
            </div>
            <h1 style={{ margin: "2px 0 2px" }}>{t("enroll.grid")}</h1>
            <p className="hint" style={{ margin: "0 0 16px" }}>{t("enroll.gridHintDesk")}</p>

            <div className="egrid">
              <div className="egrid-head">
                <div>{t("enroll.horse")}</div>
                <div>{t("enroll.rider")}</div>
                <div>{t("enroll.classesCol")}</div>
                <div style={{ textAlign: "right" }}>{t("enroll.costCol")}</div>
                <div />
              </div>
              {pairs.length === 0 && (
                <div style={{ padding: "36px 16px", textAlign: "center" }} className="muted">
                  {t("enroll.emptyGrid")}
                </div>
              )}
              {pairs.map((pair, i) => {
                const rowCost = pair.classIds.reduce(
                  (sum, id) => sum + (classFees[id] ?? 0),
                  0,
                );
                const empty = pair.classIds.length === 0;
                return (
                  <div className="egrid-row" key={i}>
                    <div>
                      <select
                        value={pair.horseId}
                        onChange={(e) =>
                          setPairs((ps) =>
                            ps.map((p, j) => (j === i ? { ...p, horseId: e.target.value } : p)),
                          )
                        }
                      >
                        {roster.horses.map((h) => (
                          <option key={h.id} value={h.id}>{h.name}</option>
                        ))}
                      </select>
                      <div className="muted" style={{ fontSize: 11 }}>
                        {roster.horses.find((h) => h.id === pair.horseId)?.microchip ?? ""}
                      </div>
                    </div>
                    <div>
                      <select
                        value={pair.riderId}
                        onChange={(e) =>
                          setPairs((ps) =>
                            ps.map((p, j) => (j === i ? { ...p, riderId: e.target.value } : p)),
                          )
                        }
                      >
                        {roster.members.map((m) => (
                          <option key={m.personId} value={m.personId}>{m.fullName}</option>
                        ))}
                      </select>
                    </div>
                    <div style={{ position: "relative" }}>
                      <div style={{ display: "flex", gap: 4, flexWrap: "wrap", alignItems: "center" }}>
                        {pair.classIds.map((cid) => (
                          <button
                            key={cid}
                            className="class-badge"
                            title={t("enroll.removeClass")}
                            onClick={() =>
                              setPairs((ps) =>
                                ps.map((p, j) =>
                                  j === i
                                    ? { ...p, classIds: p.classIds.filter((x) => x !== cid) }
                                    : p,
                                ),
                              )
                            }
                          >
                            {info.classes.find((c) => c.id === cid)?.name ?? ""}
                            <span style={{ opacity: 0.6 }}>×</span>
                          </button>
                        ))}
                        <button
                          className={`class-add ${empty ? "empty" : ""}`}
                          onClick={() => setClassMenuFor(classMenuFor === i ? null : i)}
                        >
                          + {empty ? t("enroll.assignClass") : t("enroll.addClass")}
                        </button>
                      </div>
                      {classMenuFor === i && (
                        <div className="class-menu">
                          {info.classes.map((c) => {
                            const on = pair.classIds.includes(c.id);
                            const enrolledStatus = enrolledBy.get(`${c.id}:${pair.horseId}`);
                            const scratched =
                              enrolledStatus === "ritirata" || enrolledStatus === "assente";
                            const dupRow =
                              !on &&
                              !enrolledStatus &&
                              pairs.some(
                                (p, j) => j !== i && p.horseId === pair.horseId && p.classIds.includes(c.id),
                              );
                            const full = c.remaining !== null && c.remaining <= 0 && !on;
                            const locked = Boolean(enrolledStatus) || dupRow || full;
                            const reason = enrolledStatus
                              ? scratched
                                ? t("enroll.scratchedLock")
                                : t("enroll.alreadyIn")
                              : dupRow
                                ? t("enroll.dupRow")
                                : full
                                  ? t("enroll.full")
                                  : null;
                            return (
                              <button
                                key={c.id}
                                disabled={locked}
                                onClick={() => {
                                  setPairs((ps) =>
                                    ps.map((p, j) =>
                                      j === i
                                        ? {
                                            ...p,
                                            classIds: on
                                              ? p.classIds.filter((x) => x !== c.id)
                                              : [...p.classIds, c.id],
                                          }
                                        : p,
                                    ),
                                  );
                                  setClassMenuFor(null);
                                }}
                              >
                                <span style={{ flex: 1 }}>
                                  {on ? "✓ " : ""}
                                  {c.name}
                                </span>
                                <span className="num muted">{Number(c.entryFee)} €</span>
                                {reason && <span className="muted" style={{ fontSize: 11 }}>{reason}</span>}
                              </button>
                            );
                          })}
                        </div>
                      )}
                    </div>
                    <div className="num" style={{ textAlign: "right", fontWeight: 600 }}>
                      {rowCost ? `${rowCost} €` : <span style={{ color: "var(--slate-300)" }}>—</span>}
                    </div>
                    <div style={{ textAlign: "center" }}>
                      <button
                        className="btn small danger"
                        style={{ border: "none", background: "none" }}
                        title={t("enroll.removePair")}
                        onClick={() => setPairs((ps) => ps.filter((_, j) => j !== i))}
                      >
                        ⌫
                      </button>
                    </div>
                  </div>
                );
              })}
              <div className="egrid-foot">
                <button
                  className="btn small"
                  onClick={() =>
                    setPairs((ps) => [
                      ...ps,
                      {
                        horseId: roster.horses[0]!.id,
                        riderId: roster.members[0]!.personId,
                        classIds: [],
                      },
                    ])
                  }
                >
                  + {t("enroll.addPair")}
                </button>
              </div>
            </div>

            {pairs.filter((p) => p.classIds.length === 0).length > 0 && (
              <div
                style={{
                  marginTop: 12,
                  fontSize: 12.5,
                  color: "var(--warn, #B45309)",
                  background: "rgba(180,83,9,0.10)",
                  padding: "9px 13px",
                  borderRadius: 9,
                }}
              >
                {t("enroll.incomplete", {
                  n: pairs.filter((p) => p.classIds.length === 0).length,
                })}
              </div>
            )}
          </div>

          <div className="esummary">
            <div className="card" style={{ margin: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 12 }}>
                {t("enroll.review")}
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, marginBottom: 9 }}>
                <span>{t("enroll.sumPairs", { h: breakdown.horses, n: breakdown.enrollments })}</span>
                <span className="num">{breakdown.classesCost} €</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, marginBottom: 9 }}>
                <span>
                  {t("enroll.feeShort", {
                    h: breakdown.horses,
                    fee: Number(info.event.feePerHorse),
                  })}
                </span>
                <span className="num">{breakdown.fee} €</span>
              </div>
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "baseline",
                  paddingTop: 11,
                  marginTop: 4,
                  borderTop: "1px solid rgba(15,23,42,0.10)",
                }}
              >
                <span style={{ fontSize: 14, fontWeight: 600 }}>{t("enroll.total")}</span>
                <span className="num" style={{ fontSize: 24, fontWeight: 700 }}>
                  {breakdown.total} €
                </span>
              </div>
              <button
                className="btn primary"
                style={{ width: "100%", marginTop: 14 }}
                disabled={
                  busy ||
                  pairs.length === 0 ||
                  pairs.some((p) => p.classIds.length === 0)
                }
                onClick={submitAll}
              >
                {pairs.length === 0
                  ? t("enroll.ctaAdd")
                  : pairs.some((p) => p.classIds.length === 0)
                    ? t("enroll.ctaAssign")
                    : `${t("enroll.confirm")} · ${breakdown.total} €`}
              </button>
              <p className="hint" style={{ marginTop: 9, textAlign: "center" }}>
                {t("enroll.confirmNote")}
              </p>
              {error && <div className="error-inline">{error}</div>}
            </div>
            <div
              style={{
                marginTop: 12,
                background: "var(--slate-100)",
                borderRadius: 10,
                padding: "12px 14px",
                fontSize: 12,
                color: "var(--slate-500)",
                lineHeight: 1.55,
              }}
            >
              {t("enroll.deskHint")}
            </div>
          </div>
        </div>
      </>
    );
  }

  if (step === "review") {
    return (
      <>
        <button className="btn small" onClick={() => setStep("grid")}>
          ← {t("app.back")}
        </button>
        <h1 style={{ marginTop: 12 }}>{t("enroll.review")}</h1>
        <div className="card">
          <table className="tbl">
            <tbody>
              <tr>
                <td>{t("enroll.classesCost", { n: breakdown.enrollments })}</td>
                <td className="num" style={{ textAlign: "right" }}>
                  {breakdown.classesCost} €
                </td>
              </tr>
              <tr>
                <td>{t("enroll.fee", { n: breakdown.horses })}</td>
                <td className="num" style={{ textAlign: "right" }}>
                  {breakdown.fee} €
                </td>
              </tr>
              <tr>
                <td>
                  <strong>{t("enroll.total")}</strong>
                </td>
                <td className="num" style={{ textAlign: "right" }}>
                  <strong>{breakdown.total} €</strong>
                </td>
              </tr>
            </tbody>
          </table>
          <p className="hint" style={{ marginTop: 12 }}>
            {t("enroll.confirmNote")}
          </p>
          {error && <div className="error-inline">{error}</div>}
          <button className="btn primary" disabled={busy} onClick={submitAll}>
            {t("enroll.confirm")}
          </button>
        </div>
      </>
    );
  }

  // done
  const allWarnings = bulk?.entries.flatMap((e) => e.warnings) ?? [];
  return (
    <div className="card">
      <h1>{t("enroll.done")}</h1>
      {bulk && (
        <p className="num">
          {t("enroll.serverQuote")}: <strong>{bulk.quote.total} €</strong>
        </p>
      )}
      {allWarnings.length === 0 ? (
        <p className="muted">{t("enroll.noWarnings")}</p>
      ) : (
        <>
          <h2>{t("enroll.warnings", { n: allWarnings.length })}</h2>
          {allWarnings.map((w, i) => {
            const v = warningView(w, t);
            return (
              <div key={i} style={{ marginTop: 6 }}>
                <Badge tone="warn">{v.title}</Badge>
                {v.body && (
                  <div className="muted" style={{ fontSize: 12 }}>{v.body}</div>
                )}
              </div>
            );
          })}
        </>
      )}
      <button className="btn primary" style={{ marginTop: 16 }} onClick={onDone}>
        {t("nav.entries" as MessageKey)}
      </button>
    </div>
  );
}
