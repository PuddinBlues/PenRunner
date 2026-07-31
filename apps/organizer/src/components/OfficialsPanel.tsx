import { useCallback, useEffect, useState } from "react";
import { Badge, Banner, Empty, errorMessage } from "./Ui.js";
import type { Client } from "../lib/api.js";
import type { MessageKey, T } from "../lib/i18n.js";

type InviteRow = Awaited<ReturnType<Client["invite"]["list"]["query"]>>[number];

/**
 * Convocazione ufficiali di gara (giudici, scribe, segreteria). Riusato in
 * DUE punti (decisione titolare, cantiere B1): il passo del wizard di
 * creazione — gli ufficiali si scelgono PRIMA di organizzare l'evento — e il
 * tab a evento in corso. Ogni giudice vale uguale: nessun peso, con cinque
 * si scartano alto e basso e si sommano i tre restanti (regola chiusa).
 */
export function OfficialsPanel({
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
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
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
        {/* BR-84: nome e cognome separati */}
        <label className="field">
          <span>{t("common.firstName")}</span>
          <input value={firstName} onChange={(e) => setFirstName(e.target.value)} />
        </label>
        <label className="field">
          <span>{t("common.lastName")}</span>
          <input value={lastName} onChange={(e) => setLastName(e.target.value)} />
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
          disabled={!vetted || !firstName || !lastName || !email}
          onClick={async () => {
            setError(null);
            setLink(null);
            setCopied(false);
            try {
              const res = await client.invite.create.mutate({
                eventId,
                role,
                person: { firstName, lastName, email },
              });
              // Link all'app scribe con il token: si consegna a mano.
              const scribeUrl =
                (import.meta.env.VITE_SCRIBE_URL as string | undefined) ??
                "http://localhost:5173";
              setLink(`${scribeUrl}/?token=${res.token}`);
              setFirstName("");
              setLastName("");
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
