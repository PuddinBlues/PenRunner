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

  // form cavaliere
  const [riderName, setRiderName] = useState("");
  const [riderEmail, setRiderEmail] = useState("");
  const [riderBirth, setRiderBirth] = useState("");
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
                    <strong>{m.fullName}</strong>
                    {m.email && (
                      <div className="muted">
                        {m.email} · {t("roster.claimHint")}
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <div className="row" style={{ marginTop: 12 }}>
          <label className="field">
            <span>{t("roster.fullName")}</span>
            <input value={riderName} onChange={(e) => setRiderName(e.target.value)} />
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
            disabled={!riderName}
            onClick={async () => {
              setError(null);
              setNotice(null);
              try {
                const res = await client.roster.addRider.mutate({
                  stableId,
                  fullName: riderName,
                  ...(riderEmail ? { email: riderEmail } : {}),
                  ...(riderBirth ? { birthDate: riderBirth } : {}),
                });
                setNotice(
                  res.linked ? t("roster.riderLinked") : t("roster.riderCreated"),
                );
                setRiderName("");
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
