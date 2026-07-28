import { useState } from "react";
import { errorMessage } from "@penrunner/ui";
import type { Client } from "../lib/api.js";
import type { T } from "../lib/i18n.js";

/** Primo accesso: profilo (claim se esiste) + scuderia in un passo (BR-80). */
export function Onboarding({
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
  const [stableName, setStableName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  return (
    <div className="card" style={{ maxWidth: 480 }}>
      <h1>{t("onboarding.title")}</h1>
      <p className="hint">{t("onboarding.body")}</p>
      {/* BR-84: nome e cognome separati (documenti ufficiali, ordinamenti) */}
      <label className="field">
        <span>{t("common.firstName")}</span>
        <input value={firstName} onChange={(e) => setFirstName(e.target.value)} autoComplete="given-name" />
      </label>
      <label className="field">
        <span>{t("common.lastName")}</span>
        <input value={lastName} onChange={(e) => setLastName(e.target.value)} autoComplete="family-name" />
      </label>
      <label className="field">
        <span>{t("onboarding.stableName")}</span>
        <input value={stableName} onChange={(e) => setStableName(e.target.value)} />
      </label>
      {error && <div className="error-inline">{error}</div>}
      <button
        className="btn primary"
        disabled={busy || !firstName || !lastName || !stableName}
        onClick={async () => {
          setBusy(true);
          setError(null);
          try {
            // Modello identità: se una scuderia ha già creato il profilo con
            // questa email, il claim lo collega — mai un duplicato.
            try {
              const { claimable } = await client.profile.claimStatus.query();
              if (claimable) await client.profile.claimAccept.mutate();
              else await client.profile.create.mutate({ firstName, lastName });
            } catch {
              /* profilo già collegato */
            }
            await client.roster.createStable.mutate({ name: stableName });
            await onDone();
          } catch (err) {
            setError(errorMessage(err));
          } finally {
            setBusy(false);
          }
        }}
      >
        {t("onboarding.create")}
      </button>
    </div>
  );
}
