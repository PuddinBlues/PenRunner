import { useCallback, useEffect, useState } from "react";
import { navigate } from "../App.js";
import { ClassesManager } from "../components/ClassesManager.js";
import { EventForm } from "../components/EventForm.js";
import { SettingsPanel } from "../components/SettingsPanel.js";
import { Badge, Banner, Confirm, Empty, errorMessage } from "../components/Ui.js";
import { API_URL } from "../lib/api.js";
import type { Client } from "../lib/api.js";
import type { MessageKey, T } from "../lib/i18n.js";

type EventDetailData = Awaited<ReturnType<Client["events"]["get"]["query"]>>;
type InviteRow = Awaited<ReturnType<Client["invite"]["list"]["query"]>>[number];
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
        <Invites t={t} client={client} eventId={eventId} vetted={event.organizationVetted} />
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

/** Inviti giudice/scribe/segreteria con link consegnabile a mano. */
function Invites({
  t,
  client,
  eventId,
  vetted,
}: {
  t: T;
  client: Client;
  eventId: string;
  vetted: boolean;
}) {
  const [rows, setRows] = useState<InviteRow[] | null>(null);
  const [role, setRole] = useState<"giudice" | "scribe" | "segreteria">("giudice");
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [link, setLink] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    try {
      setRows(await client.invite.list.query({ eventId }));
    } catch {
      setRows([]); // pre-vetting: la lista richiede event.configure
    }
  }, [client, eventId]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const inviteState = (r: InviteRow) => {
    if (r.deactivatedAt) return t("invite.deactivated");
    if (r.revokedAt) return t("invite.revoked");
    if (r.acceptedAt) return t("invite.accepted");
    if (r.expiresAt && new Date(r.expiresAt) < new Date()) return t("invite.expired");
    return t("invite.pending");
  };

  return (
    <div className="card">
      <h2>{t("invite.title")}</h2>
      <p className="hint">{t("invite.explain")}</p>
      {!vetted && <Banner tone="info">{t("invite.vettingGate")}</Banner>}

      {rows && rows.length > 0 ? (
        <table className="tbl" style={{ marginBottom: 16 }}>
          <tbody>
            {rows.map((r) => (
              <tr key={r.assignmentId}>
                <td>
                  <strong>{r.fullName}</strong>
                  <div className="muted">{r.email}</div>
                </td>
                <td>{t(`invite.${r.role}` as MessageKey)}</td>
                <td>
                  <Badge tone={r.acceptedAt ? "green" : undefined}>
                    {inviteState(r)}
                  </Badge>
                </td>
                <td style={{ textAlign: "right" }}>
                  {r.inviteId && !r.revokedAt && !r.acceptedAt && (
                    <button
                      className="btn small danger"
                      onClick={async () => {
                        await client.invite.revoke.mutate({ inviteId: r.inviteId! });
                        await reload();
                      }}
                    >
                      {t("invite.revoke")}
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <Empty>{t("invite.empty")}</Empty>
      )}

      <div className="row" style={{ marginBottom: 12 }}>
        <label className="field" style={{ maxWidth: 160 }}>
          <span>{t("invite.role")}</span>
          <select value={role} onChange={(e) => setRole(e.target.value as typeof role)}>
            <option value="giudice">{t("invite.giudice")}</option>
            <option value="scribe">{t("invite.scribe")}</option>
            <option value="segreteria">{t("invite.segreteria")}</option>
          </select>
        </label>
        <label className="field">
          <span>{t("invite.fullName")}</span>
          <input value={fullName} onChange={(e) => setFullName(e.target.value)} />
        </label>
        <label className="field">
          <span>{t("invite.email")}</span>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </label>
        <button
          className="btn primary"
          disabled={!vetted || !fullName || !email}
          onClick={async () => {
            setError(null);
            setLink(null);
            setCopied(false);
            try {
              const res = await client.invite.create.mutate({
                eventId,
                role,
                person: { fullName, email },
              });
              // Link all'app scribe con il token: si consegna a mano.
              const scribeUrl =
                (import.meta.env.VITE_SCRIBE_URL as string | undefined) ??
                API_URL.replace(":3001", ":5173");
              setLink(`${scribeUrl}/?token=${res.token}`);
              setFullName("");
              setEmail("");
              await reload();
            } catch (err) {
              setError(errorMessage(err));
            }
          }}
        >
          {t("invite.create")}
        </button>
      </div>
      {error && <div className="error-inline">{error}</div>}
      {link && (
        <div>
          <p className="hint" style={{ marginBottom: 4 }}>
            {t("invite.linkReady")}
          </p>
          <div className="linkbox">{link}</div>
          <button
            className="btn small"
            onClick={async () => {
              await navigator.clipboard.writeText(link);
              setCopied(true);
            }}
          >
            {copied ? t("invite.copied") : t("invite.copy")}
          </button>
        </div>
      )}
    </div>
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
