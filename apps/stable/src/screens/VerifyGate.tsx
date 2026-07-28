import { useEffect, useState } from "react";
import { errorMessage } from "@penrunner/ui";
import type { Client } from "../lib/api.js";
import { detectLocale, type T } from "../lib/i18n.js";

// Interstitial per la sessione loggata-NON-verificata (reperto staging: senza
// questa schermata l'utente restava su un Loading infinito con un errore
// grezzo, e la verifica era raggiungibile solo dalla schermata post-signup).
// Gestisce anche ?verify=<token>: il link dell'email funziona pure da loggati.

const CLIENT_APP = "stable" as const;

export function VerifyGate({
  t,
  client,
  email,
  onVerified,
  onLogout,
}: {
  t: T;
  client: Client;
  email: string;
  onVerified: () => void;
  onLogout: () => void;
}) {
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      await fn();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  // Link email aperto da loggati: si consuma qui, URL pulito subito.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const verifyToken = params.get("verify");
    if (!verifyToken) return;
    window.history.replaceState(null, "", window.location.pathname);
    void run(async () => {
      await client.auth.verifyEmail.mutate({ token: verifyToken });
      onVerified();
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <main className="page" style={{ maxWidth: 440 }}>
      <div className="card">
        <h1>{t("auth.verifyTitle")}</h1>
        <p className="hint">{t("auth.gateBody", { email })}</p>

        <label className="field">
          <span>{t("auth.verifyToken")}</span>
          <input
            value={code}
            onChange={(e) => setCode(e.target.value)}
            inputMode="numeric"
            autoComplete="one-time-code"
          />
        </label>

        {error && <div className="error-inline">{error}</div>}
        {notice && <div className="ok-inline">{notice}</div>}

        <div className="row" style={{ marginTop: 16 }}>
          <button
            className="btn primary"
            disabled={busy || !code}
            onClick={() =>
              run(async () => {
                const value = code.trim();
                if (/^\d{6}$/.test(value)) {
                  await client.auth.verifyEmail.mutate({ email, code: value });
                } else {
                  await client.auth.verifyEmail.mutate({ token: value });
                }
                onVerified();
              })
            }
          >
            {t("auth.verify")}
          </button>
        </div>

        <p style={{ marginTop: 16, marginBottom: 0 }}>
          <a
            href="#"
            onClick={(e) => {
              e.preventDefault();
              if (busy) return;
              void run(async () => {
                await client.auth.resendVerification.mutate({
                  email,
                  client: CLIENT_APP,
                  locale: detectLocale(),
                });
                setNotice(t("auth.resent"));
              });
            }}
          >
            {t("auth.resend")}
          </a>
          {" · "}
          <a href="#" onClick={(e) => { e.preventDefault(); onLogout(); }}>
            {t("app.logout")}
          </a>
        </p>
      </div>
    </main>
  );
}
