import { useEffect, useState } from "react";
import { PASSWORD_MIN_LENGTH, PasswordInput, errorMessage } from "@penrunner/ui";
import type { Client } from "../lib/api.js";
import { detectLocale, type T } from "../lib/i18n.js";

// Ingresso self-serve (BR-80): registrazione → verifica email → login nello
// stesso schermo, come le altre app. Verifica a doppia via (BR-82): il link
// nell'email arriva qui come ?verify=<token> e si consuma da solo; chi legge
// l'email su un altro dispositivo digita il codice a 6 cifre. ?reset=<token>
// apre la scelta della nuova password (loop del "password dimenticata").

const CLIENT_APP = "stable" as const;

type Mode = "login" | "register" | "verify" | "forgot" | "reset";

export function Auth({
  t,
  client,
  onSession,
}: {
  t: T;
  client: Client;
  onSession: (token: string) => void;
}) {
  const [mode, setMode] = useState<Mode>("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [password2, setPassword2] = useState("");
  const [code, setCode] = useState("");
  const [resetToken, setResetToken] = useState("");
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

  // Link email: si consuma all'apertura, senza chiedere nulla. L'URL si
  // pulisce subito (il token non deve restare nella cronologia).
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const verifyToken = params.get("verify");
    const reset = params.get("reset");
    if (verifyToken || reset) {
      window.history.replaceState(null, "", window.location.pathname);
    }
    if (reset) {
      setResetToken(reset);
      setMode("reset");
      return;
    }
    if (verifyToken) {
      void run(async () => {
        try {
          await client.auth.verifyEmail.mutate({ token: verifyToken });
          setNotice(t("auth.verified"));
          setMode("login");
        } catch (err) {
          // Token scaduto/consumato: si atterra sulla verifica, dove c'è
          // "Invia di nuovo" — mai un vicolo cieco.
          setMode("verify");
          throw err;
        }
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const passwordOk = password.length >= PASSWORD_MIN_LENGTH;
  const passwordsMatch = password === password2;

  const submitVerify = () =>
    run(async () => {
      const value = code.trim();
      // Doppia via: 6 cifre = codice (vale solo in coppia con l'email);
      // qualsiasi altra cosa è il token lungo incollato dall'email.
      if (/^\d{6}$/.test(value)) {
        await client.auth.verifyEmail.mutate({ email, code: value });
      } else {
        await client.auth.verifyEmail.mutate({ token: value });
      }
      setNotice(t("auth.verified"));
      setCode("");
      setMode("login");
    });

  return (
    <main className="page" style={{ maxWidth: 440 }}>
      <div className="card">
        <h1>
          {mode === "login"
            ? t("auth.loginTitle")
            : mode === "register"
              ? t("auth.registerTitle")
              : mode === "verify"
                ? t("auth.verifyTitle")
                : mode === "forgot"
                  ? t("auth.forgotTitle")
                  : t("auth.resetTitle")}
        </h1>
        <p className="hint">
          {mode === "verify"
            ? t("auth.verifyBody")
            : mode === "forgot"
              ? t("auth.forgotBody")
              : mode === "reset"
                ? t("auth.resetBody")
                : t("auth.welcome")}
        </p>

        {mode !== "reset" && (
          <label className="field">
            <span>{t("auth.email")}</span>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
            />
          </label>
        )}

        {(mode === "login" || mode === "register") && (
          <label className="field">
            <span>{t("auth.password")}</span>
            <PasswordInput
              value={password}
              onChange={setPassword}
              autoComplete={mode === "login" ? "current-password" : "new-password"}
              showLabel={t("auth.showPassword")}
              hideLabel={t("auth.hidePassword")}
            />
            {mode === "register" && (
              <span className="hint">
                {t("auth.passwordHint", { n: PASSWORD_MIN_LENGTH })}
              </span>
            )}
          </label>
        )}

        {mode === "reset" && (
          <label className="field">
            <span>{t("auth.newPassword")}</span>
            <PasswordInput
              value={password}
              onChange={setPassword}
              autoComplete="new-password"
              showLabel={t("auth.showPassword")}
              hideLabel={t("auth.hidePassword")}
            />
            <span className="hint">
              {t("auth.passwordHint", { n: PASSWORD_MIN_LENGTH })}
            </span>
          </label>
        )}

        {(mode === "register" || mode === "reset") && (
          <label className="field">
            <span>{t("auth.passwordConfirm")}</span>
            <PasswordInput
              value={password2}
              onChange={setPassword2}
              autoComplete="new-password"
              showLabel={t("auth.showPassword")}
              hideLabel={t("auth.hidePassword")}
            />
            {password2 !== "" && !passwordsMatch && (
              <span className="hint" style={{ color: "var(--danger, #B91C1C)" }}>
                {t("auth.passwordMismatch")}
              </span>
            )}
          </label>
        )}

        {mode === "verify" && (
          <label className="field">
            <span>{t("auth.verifyToken")}</span>
            <input
              value={code}
              onChange={(e) => setCode(e.target.value)}
              inputMode="numeric"
              autoComplete="one-time-code"
            />
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
              disabled={busy || !email || !passwordOk || !passwordsMatch}
              onClick={() =>
                run(async () => {
                  await client.auth.register.mutate({
                    email,
                    password,
                    client: CLIENT_APP,
                    locale: detectLocale(),
                  });
                  setPassword("");
                  setPassword2("");
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
              disabled={busy || !code || (/^\d+$/.test(code.trim()) && !email)}
              onClick={submitVerify}
            >
              {t("auth.verify")}
            </button>
          )}
          {mode === "forgot" && (
            <button
              className="btn primary"
              disabled={busy || !email}
              onClick={() =>
                run(async () => {
                  await client.auth.requestPasswordReset.mutate({
                    email,
                    client: CLIENT_APP,
                    locale: detectLocale(),
                  });
                  setNotice(t("auth.forgotSent"));
                })
              }
            >
              {t("auth.forgotSend")}
            </button>
          )}
          {mode === "reset" && (
            <button
              className="btn primary"
              disabled={busy || !passwordOk || !passwordsMatch}
              onClick={() =>
                run(async () => {
                  await client.auth.resetPassword.mutate({
                    token: resetToken,
                    newPassword: password,
                  });
                  setNotice(t("auth.resetDone"));
                  setPassword("");
                  setPassword2("");
                  setMode("login");
                })
              }
            >
              {t("auth.resetDo")}
            </button>
          )}
        </div>

        <p style={{ marginTop: 16, marginBottom: 0 }}>
          {mode === "login" && (
            <>
              <a href="#" onClick={(e) => { e.preventDefault(); setMode("register"); setError(null); setNotice(null); }}>
                {t("auth.needAccount")}
              </a>
              {" · "}
              <a href="#" onClick={(e) => { e.preventDefault(); setMode("forgot"); setError(null); setNotice(null); }}>
                {t("auth.forgot")}
              </a>
            </>
          )}
          {mode === "verify" && (
            <>
              <a
                href="#"
                onClick={(e) => {
                  e.preventDefault();
                  if (!email || busy) return;
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
              <a href="#" onClick={(e) => { e.preventDefault(); setMode("login"); setError(null); setNotice(null); }}>
                {t("auth.haveAccount")}
              </a>
            </>
          )}
          {(mode === "register" || mode === "forgot" || mode === "reset") && (
            <a href="#" onClick={(e) => { e.preventDefault(); setMode("login"); setError(null); setNotice(null); }}>
              {t("auth.haveAccount")}
            </a>
          )}
        </p>
      </div>
    </main>
  );
}
