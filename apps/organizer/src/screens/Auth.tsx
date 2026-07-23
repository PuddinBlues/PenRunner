import { useState } from "react";
import type { Client } from "../lib/api.js";
import type { T } from "../lib/i18n.js";
import { errorMessage } from "../components/Ui.js";

// Ingresso self-serve (BR-80): registrazione → verifica email → login, tutto
// nello stesso schermo. In sviluppo il codice di verifica arriva dal mailer
// dev (log dell'API); in produzione via email vera.

export function Auth({
  t,
  client,
  onSession,
}: {
  t: T;
  client: Client;
  onSession: (token: string) => void;
}) {
  const [mode, setMode] = useState<"login" | "register" | "verify">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [token, setToken] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try {
      await fn();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="page" style={{ maxWidth: 440 }}>
      <div className="card">
        <h1>
          {mode === "login"
            ? t("auth.loginTitle")
            : mode === "register"
              ? t("auth.registerTitle")
              : t("auth.verifyTitle")}
        </h1>
        <p className="hint">
          {mode === "verify" ? t("auth.verifyBody") : t("auth.welcome")}
        </p>

        {mode !== "verify" && (
          <>
            <label className="field">
              <span>{t("auth.email")}</span>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="email"
              />
            </label>
            <label className="field">
              <span>{t("auth.password")}</span>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete={mode === "login" ? "current-password" : "new-password"}
              />
            </label>
          </>
        )}

        {mode === "verify" && (
          <label className="field">
            <span>{t("auth.verifyToken")}</span>
            <input value={token} onChange={(e) => setToken(e.target.value)} />
          </label>
        )}

        {error && <div className="error-inline">{error}</div>}
        {notice && <div className="ok-inline">{notice}</div>}

        <div className="row" style={{ marginTop: 16 }}>
          {mode === "login" && (
            <button
              className="btn primary"
              disabled={busy || !email || !password}
              onClick={() =>
                run(async () => {
                  const { sessionToken } = await client.auth.login.mutate({
                    email,
                    password,
                  });
                  onSession(sessionToken);
                })
              }
            >
              {t("auth.login")}
            </button>
          )}
          {mode === "register" && (
            <button
              className="btn primary"
              disabled={busy || !email || !password}
              onClick={() =>
                run(async () => {
                  await client.auth.register.mutate({ email, password });
                  setMode("verify");
                })
              }
            >
              {t("auth.register")}
            </button>
          )}
          {mode === "verify" && (
            <button
              className="btn primary"
              disabled={busy || !token}
              onClick={() =>
                run(async () => {
                  await client.auth.verifyEmail.mutate({ token: token.trim() });
                  setNotice(t("auth.verified"));
                  setMode("login");
                })
              }
            >
              {t("auth.verify")}
            </button>
          )}
        </div>

        <p style={{ marginTop: 16, marginBottom: 0 }}>
          {mode === "login" ? (
            <a href="#" onClick={(e) => { e.preventDefault(); setMode("register"); setError(null); }}>
              {t("auth.needAccount")}
            </a>
          ) : (
            <a href="#" onClick={(e) => { e.preventDefault(); setMode("login"); setError(null); }}>
              {t("auth.haveAccount")}
            </a>
          )}
        </p>
      </div>
    </main>
  );
}
