import { useCallback, useEffect, useState } from "react";
import { navigate } from "../App.js";
import { Badge, Banner, Empty, errorMessage } from "../components/Ui.js";
import type { Client } from "../lib/api.js";
import type { MessageKey, T } from "../lib/i18n.js";

type Orgs = Awaited<ReturnType<Client["org"]["mine"]["query"]>>;
type Events = Awaited<ReturnType<Client["events"]["mine"]["query"]>>;

export function EventsList({ t, client }: { t: T; client: Client }) {
  const [orgs, setOrgs] = useState<Orgs | null>(null);
  const [events, setEvents] = useState<Events>([]);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    try {
      const [o, e] = await Promise.all([
        client.org.mine.query(),
        client.events.mine.query(),
      ]);
      setOrgs(o);
      setEvents(e);
    } catch (err) {
      setError(errorMessage(err));
    }
  }, [client]);

  useEffect(() => {
    void reload();
  }, [reload]);

  if (error) return <Banner tone="danger">{t("app.error", { msg: error })}</Banner>;
  if (orgs === null) return <p className="muted">{t("app.loading")}</p>;
  if (orgs.length === 0) return <CreateOrg t={t} client={client} onDone={reload} />;

  const vetted = orgs.some((o) => o.vetted);

  return (
    <>
      {!vetted && <Banner tone="info">{t("org.vettingPending")}</Banner>}
      <div className="row" style={{ marginBottom: 16, alignItems: "center" }}>
        <h1 style={{ margin: 0, flex: 1 }}>{t("events.title")}</h1>
        <button className="btn primary" onClick={() => navigate("/new")}>
          {t("events.new")}
        </button>
      </div>
      {events.length === 0 ? (
        <div className="card">
          <Empty>{t("events.empty")}</Empty>
        </div>
      ) : (
        events.map((e) => (
          <div
            key={e.id}
            className="card event-card"
            onClick={() => navigate(`/event/${e.id}`)}
          >
            <div style={{ flex: 1 }}>
              <strong className={e.tier === "premium" ? "tier-premium" : ""}>
                {e.name}
              </strong>
              <div className="dates num">
                {e.venue} · {e.startDate} → {e.endDate} ·{" "}
                {t("events.classes", { n: e.classesCount })}
              </div>
            </div>
            <Badge tone={e.status === "bozza" ? undefined : "green"}>
              {t(`status.${e.status}` as MessageKey)}
            </Badge>
          </div>
        ))
      )}
    </>
  );
}

/** Onboarding organizzazione: profilo + club in un passo (BR-80). */
function CreateOrg({
  t,
  client,
  onDone,
}: {
  t: T;
  client: Client;
  onDone: () => Promise<void>;
}) {
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [orgName, setOrgName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  return (
    <div className="card" style={{ maxWidth: 480 }}>
      <h1>{t("org.createTitle")}</h1>
      <p className="hint">{t("org.createBody")}</p>
      {/* BR-84: nome e cognome separati */}
      <label className="field">
        <span>{t("common.firstName")}</span>
        <input value={firstName} onChange={(e) => setFirstName(e.target.value)} autoComplete="given-name" />
      </label>
      <label className="field">
        <span>{t("common.lastName")}</span>
        <input value={lastName} onChange={(e) => setLastName(e.target.value)} autoComplete="family-name" />
      </label>
      <label className="field">
        <span>{t("org.name")}</span>
        <input value={orgName} onChange={(e) => setOrgName(e.target.value)} />
      </label>
      {error && <div className="error-inline">{error}</div>}
      <button
        className="btn primary"
        disabled={busy || !firstName || !lastName || !orgName}
        onClick={async () => {
          setBusy(true);
          setError(null);
          try {
            // Profilo prima del club: rivendica quello esistente se c'è
            // (modello identità), altrimenti lo crea. Se l'account ha già
            // un profilo collegato, si prosegue col club.
            try {
              const { claimable } = await client.profile.claimStatus.query();
              if (claimable) await client.profile.claimAccept.mutate();
              else await client.profile.create.mutate({ firstName, lastName });
            } catch {
              /* profilo già collegato */
            }
            await client.org.create.mutate({ name: orgName });
            await onDone();
          } catch (err) {
            setError(errorMessage(err));
          } finally {
            setBusy(false);
          }
        }}
      >
        {t("org.create")}
      </button>
    </div>
  );
}
