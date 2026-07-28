import { useCallback, useEffect, useState } from "react";
import { Empty, errorMessage } from "@penrunner/ui";
import type { Client } from "../lib/api.js";
import type { T } from "../lib/i18n.js";

type RosterData = Awaited<ReturnType<Client["roster"]["list"]["query"]>>;

/**
 * Roster: cavalieri e cavalli. Il dedup è del server (email/microchip
 * COLLEGANO, mai duplicano) — qui si rende ESPLICITO l'esito, e si ricorda
 * la via del claim per il cavaliere.
 */
export function Roster({
  t,
  client,
  stableId,
}: {
  t: T;
  client: Client;
  stableId: string;
}) {
  const [data, setData] = useState<RosterData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  // form cavaliere (BR-84: nome e cognome separati)
  const [riderFirst, setRiderFirst] = useState("");
  const [riderLast, setRiderLast] = useState("");
  const [riderEmail, setRiderEmail] = useState("");
  const [riderBirth, setRiderBirth] = useState("");
  // editor inline del profilo: nome (badge BR-84) + i campi che risolvono
  // gli avvisi di eleggibilità (fase b: chi vede l'avviso può sistemarlo)
  const [editing, setEditing] = useState<{
    personId: string;
    firstName: string;
    lastName: string;
    membershipIrha: string;
    membershipFise: string;
    birthDate: string;
  } | null>(null);
  // form cavallo
  const [horseName, setHorseName] = useState("");
  const [microchip, setMicrochip] = useState("");
  const [ownerId, setOwnerId] = useState("");

  const reload = useCallback(async () => {
    try {
      const d = await client.roster.list.query({ stableId });
      setData(d);
      setOwnerId((prev) => prev || (d.members[0]?.personId ?? ""));
    } catch (err) {
      setError(errorMessage(err));
    }
  }, [client, stableId]);

  useEffect(() => {
    void reload();
  }, [reload]);

  if (!data) return <p className="muted">{t("app.loading")}</p>;

  return (
    <>
      <h1>{t("roster.title")}</h1>
      {error && <div className="banner danger">{t("app.error", { msg: error })}</div>}
      {notice && <div className="banner info">{notice}</div>}

      <div className="card">
        <h2>{t("roster.riders")}</h2>
        {data.members.length === 0 ? (
          <Empty>{t("roster.ridersEmpty")}</Empty>
        ) : (
          <table className="tbl">
            <tbody>
              {data.members.map((m) => (
                <tr key={m.personId}>
                  <td>
                    {editing?.personId === m.personId ? (
                      <div>
                        <div className="row">
                          <input
                            value={editing.firstName}
                            onChange={(e) => setEditing({ ...editing, firstName: e.target.value })}
                            placeholder={t("common.firstName")}
                          />
                          <input
                            value={editing.lastName}
                            onChange={(e) => setEditing({ ...editing, lastName: e.target.value })}
                            placeholder={t("common.lastName")}
                          />
                        </div>
                        <div className="row" style={{ marginTop: 6 }}>
                          <input
                            value={editing.membershipIrha}
                            onChange={(e) => setEditing({ ...editing, membershipIrha: e.target.value })}
                            placeholder={t("roster.membershipIrha")}
                          />
                          <input
                            value={editing.membershipFise}
                            onChange={(e) => setEditing({ ...editing, membershipFise: e.target.value })}
                            placeholder={t("roster.membershipFise")}
                          />
                          <input
                            type="date"
                            value={editing.birthDate}
                            onChange={(e) => setEditing({ ...editing, birthDate: e.target.value })}
                          />
                        </div>
                        <div className="row" style={{ marginTop: 6 }}>
                          <button
                            className="btn small primary"
                            disabled={!editing.firstName || !editing.lastName}
                            onClick={async () => {
                              try {
                                await client.roster.updateRider.mutate({
                                  stableId,
                                  personId: m.personId,
                                  firstName: editing.firstName,
                                  lastName: editing.lastName,
                                  membershipIrha: editing.membershipIrha || null,
                                  membershipFise: editing.membershipFise || null,
                                  birthDate: editing.birthDate || null,
                                });
                                setEditing(null);
                                await reload();
                              } catch (err) {
                                setError(errorMessage(err));
                              }
                            }}
                          >
                            {t("common.confirm")}
                          </button>
                          <button className="btn small" onClick={() => setEditing(null)}>
                            {t("common.cancel")}
                          </button>
                        </div>
                      </div>
                    ) : (
                      <>
                        <strong>{m.fullName}</strong>{" "}
                        <button
                          className="btn small"
                          style={m.nameNeedsReview ? { color: "var(--amber, #B45309)" } : {}}
                          onClick={() =>
                            setEditing({
                              personId: m.personId,
                              firstName: m.firstName,
                              lastName: m.lastName,
                              membershipIrha: m.membershipIrha ?? "",
                              membershipFise: m.membershipFise ?? "",
                              birthDate: m.birthDate ?? "",
                            })
                          }
                        >
                          {m.nameNeedsReview ? t("roster.nameReview") : t("roster.edit")}
                        </button>
                        <div className="muted" style={{ fontSize: 12 }}>
                          {[
                            m.membershipIrha ? `IRHA ${m.membershipIrha}` : t("roster.noIrha"),
                            m.membershipFise ? `FISE ${m.membershipFise}` : t("roster.noFise"),
                            m.birthDate ?? t("roster.noBirth"),
                          ].join(" · ")}
                        </div>
                        {m.email && (
                          <div className="muted">
                            {m.email} · {t("roster.claimHint")}
                          </div>
                        )}
                      </>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <div className="row" style={{ marginTop: 12 }}>
          <label className="field">
            <span>{t("common.firstName")}</span>
            <input value={riderFirst} onChange={(e) => setRiderFirst(e.target.value)} autoComplete="off" />
          </label>
          <label className="field">
            <span>{t("common.lastName")}</span>
            <input value={riderLast} onChange={(e) => setRiderLast(e.target.value)} autoComplete="off" />
          </label>
          <label className="field">
            <span>{t("roster.email")}</span>
            <input
              type="email"
              value={riderEmail}
              onChange={(e) => setRiderEmail(e.target.value)}
            />
          </label>
          <label className="field" style={{ maxWidth: 160 }}>
            <span>{t("roster.birthDate")}</span>
            <input
              type="date"
              value={riderBirth}
              onChange={(e) => setRiderBirth(e.target.value)}
            />
          </label>
          <button
            className="btn primary"
            disabled={!riderFirst || !riderLast}
            onClick={async () => {
              setError(null);
              setNotice(null);
              try {
                const res = await client.roster.addRider.mutate({
                  stableId,
                  firstName: riderFirst,
                  lastName: riderLast,
                  ...(riderEmail ? { email: riderEmail } : {}),
                  ...(riderBirth ? { birthDate: riderBirth } : {}),
                });
                setNotice(
                  res.linked ? t("roster.riderLinked") : t("roster.riderCreated"),
                );
                setRiderFirst("");
                setRiderLast("");
                setRiderEmail("");
                setRiderBirth("");
                await reload();
              } catch (err) {
                setError(errorMessage(err));
              }
            }}
          >
            {t("roster.addRider")}
          </button>
        </div>
      </div>

      <div className="card">
        <h2>{t("roster.horses")}</h2>
        {data.horses.length === 0 ? (
          <Empty>{t("roster.horsesEmpty")}</Empty>
        ) : (
          <table className="tbl">
            <tbody>
              {data.horses.map((h) => (
                <tr key={h.id}>
                  <td>
                    <strong>{h.name}</strong>
                    <div className="muted num">{h.microchip}</div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <div className="row" style={{ marginTop: 12 }}>
          <label className="field">
            <span>{t("roster.horseName")}</span>
            <input value={horseName} onChange={(e) => setHorseName(e.target.value)} />
          </label>
          <label className="field">
            <span>{t("roster.microchip")}</span>
            <input
              className="num"
              value={microchip}
              onChange={(e) => setMicrochip(e.target.value)}
            />
          </label>
          <label className="field">
            <span>{t("roster.owner")}</span>
            <select value={ownerId} onChange={(e) => setOwnerId(e.target.value)}>
              {data.members.map((m) => (
                <option key={m.personId} value={m.personId}>
                  {m.fullName}
                </option>
              ))}
            </select>
          </label>
          <button
            className="btn primary"
            disabled={!horseName || !microchip || !ownerId}
            onClick={async () => {
              setError(null);
              setNotice(null);
              try {
                const res = await client.roster.addHorse.mutate({
                  stableId,
                  name: horseName,
                  microchip,
                  ownerPersonId: ownerId,
                });
                if (res.linked) setNotice(t("roster.horseLinked"));
                setHorseName("");
                setMicrochip("");
                await reload();
              } catch (err) {
                setError(errorMessage(err));
              }
            }}
          >
            {t("roster.addHorse")}
          </button>
        </div>
      </div>
    </>
  );
}
