import { useCallback, useEffect, useState } from "react";
import { navigate } from "../App.js";
import { ClassesManager } from "../components/ClassesManager.js";
import { EventForm } from "../components/EventForm.js";
import { OfficialsPanel } from "../components/OfficialsPanel.js";
import { SettingsPanel } from "../components/SettingsPanel.js";
import { Badge, Banner, Confirm, Empty, errorMessage } from "../components/Ui.js";
import { API_URL } from "../lib/api.js";
import type { Client } from "../lib/api.js";
import type { MessageKey, T } from "../lib/i18n.js";

type EventDetailData = Awaited<ReturnType<Client["events"]["get"]["query"]>>;
type AuditRow = Awaited<ReturnType<Client["audit"]["forEvent"]["query"]>>[number];

const STATUS_ORDER = [
  "bozza",
  "annunciato",
  "iscrizioni_aperte",
  "iscrizioni_chiuse",
  "in_corso",
  "concluso",
] as const;

export function EventDetail({
  t,
  client,
  eventId,
  session,
}: {
  t: T;
  client: Client;
  eventId: string;
  session: string;
}) {
  void session;
  const [event, setEvent] = useState<EventDetailData | null>(null);
  const [tab, setTab] = useState<"overview" | "classes" | "staff" | "settings" | "audit">(
    "overview",
  );
  const [error, setError] = useState<string | null>(null);
  const [confirmStatus, setConfirmStatus] = useState<string | null>(null);

  const reload = useCallback(async () => {
    try {
      setEvent(await client.events.get.query({ eventId }));
    } catch (err) {
      setError(errorMessage(err));
    }
  }, [client, eventId]);

  useEffect(() => {
    void reload();
  }, [reload]);

  if (error) return <Banner tone="danger">{t("app.error", { msg: error })}</Banner>;
  if (!event) return <p className="muted">{t("app.loading")}</p>;

  const nextStatus =
    STATUS_ORDER[STATUS_ORDER.indexOf(event.status as (typeof STATUS_ORDER)[number]) + 1];

  return (
    <>
      <button className="btn small" onClick={() => navigate("/")}>
        ← {t("app.back")}
      </button>
      <div className="row" style={{ alignItems: "center", margin: "12px 0" }}>
        <h1 style={{ margin: 0, flex: 1 }}>
          <span className={event.tier === "premium" ? "tier-premium" : ""}>
            {event.name}
          </span>{" "}
          <Badge tone={event.status === "bozza" ? undefined : "green"}>
            {t(`status.${event.status}` as MessageKey)}
          </Badge>
        </h1>
        {nextStatus && (
          <button className="btn primary" onClick={() => setConfirmStatus(nextStatus)}>
            {t("status.advanceTo", {
              status: t(`status.${nextStatus}` as MessageKey),
            })}
          </button>
        )}
      </div>
      <p className="muted num" style={{ marginTop: 0 }}>
        {event.venue} · {event.startDate} → {event.endDate}
      </p>

      {!event.organizationVetted && (
        <Banner tone="info">{t("org.vettingPending")}</Banner>
      )}

      {confirmStatus && (
        <Confirm
          t={t}
          title={t("status.confirmTitle")}
          body={t(`status.confirm.${confirmStatus}` as MessageKey)}
          onCancel={() => setConfirmStatus(null)}
          onConfirm={async () => {
            setConfirmStatus(null);
            setError(null);
            try {
              await client.events.setStatus.mutate({
                eventId,
                status: confirmStatus as EventDetailData["status"],
              });
              await reload();
            } catch (err) {
              setError(errorMessage(err));
            }
          }}
        />
      )}

      <div className="tabs">
        {(
          [
            ["overview", "detail.overview"],
            ["classes", "detail.classes"],
            ["staff", "detail.staff"],
            ["settings", "detail.settings"],
            ["audit", "detail.audit"],
          ] as const
        ).map(([key, label]) => (
          <button
            key={key}
            className={tab === key ? "active" : ""}
            onClick={() => setTab(key)}
          >
            {t(label)}
          </button>
        ))}
      </div>

      {tab === "overview" && (
        <div className="card">
          <h2>{t("detail.classes")}</h2>
          <ClassesManager t={t} client={client} eventId={eventId} manage />
        </div>
      )}
      {tab === "classes" && (
        <div className="card">
          <ClassesManager t={t} client={client} eventId={eventId} manage />
        </div>
      )}
      {tab === "staff" && (
        <OfficialsPanel t={t} client={client} eventId={eventId} vetted={event.organizationVetted} />
      )}
      {tab === "settings" && (
        <>
          <div className="card" style={{ maxWidth: 640 }}>
            <EventForm
              t={t}
              initial={{
                name: event.name,
                venue: event.venue,
                startDate: event.startDate,
                endDate: event.endDate,
                tier: event.tier as never,
                feePerHorse: String(event.feePerHorse),
                selfScratchEnabled: event.selfScratchEnabled,
              }}
              feeLocked={
                event.status !== "bozza" && event.status !== "annunciato"
              }
              submitLabel={t("event.save")}
              onSubmit={async (values) => {
                await client.events.update.mutate({
                  eventId,
                  name: values.name,
                  venue: values.venue,
                  startDate: values.startDate,
                  endDate: values.endDate,
                  tier: values.tier,
                  ...(event.status === "bozza" || event.status === "annunciato"
                    ? { feePerHorse: values.feePerHorse }
                    : {}),
                  selfScratchEnabled: values.selfScratchEnabled,
                });
                await reload();
              }}
            />
          </div>
          <SettingsPanel t={t} client={client} event={event} onSaved={reload} />
        </>
      )}
      {tab === "audit" && <AuditView t={t} client={client} eventId={eventId} />}
    </>
  );
}

/** Registro modifiche event-scoped, read-only (BR-71: trasparenza). */
function AuditView({
  t,
  client,
  eventId,
}: {
  t: T;
  client: Client;
  eventId: string;
}) {
  const [rows, setRows] = useState<AuditRow[] | null>(null);

  useEffect(() => {
    client.audit.forEvent
      .query({ eventId })
      .then(setRows)
      .catch(() => setRows([]));
  }, [client, eventId]);

  return (
    <div className="card">
      <h2>{t("audit.title")}</h2>
      <p className="hint">{t("audit.explain")}</p>
      {!rows ? (
        <p className="muted">{t("app.loading")}</p>
      ) : rows.length === 0 ? (
        <Empty>{t("audit.empty")}</Empty>
      ) : (
        <table className="tbl">
          <thead>
            <tr>
              <th>{t("audit.when")}</th>
              <th>{t("audit.who")}</th>
              <th>{t("audit.what")}</th>
              <th>{t("audit.note")}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id}>
                <td className="num" style={{ whiteSpace: "nowrap" }}>
                  {new Date(r.occurredAt as unknown as string).toLocaleString()}
                </td>
                <td>{r.actorEmail ?? "—"}</td>
                <td>
                  <code style={{ fontSize: 12 }}>{r.action}</code>
                </td>
                <td className="muted">{r.note ?? ""}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
