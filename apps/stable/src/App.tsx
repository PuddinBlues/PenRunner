import { useCallback, useEffect, useMemo, useState } from "react";
import { VersionStamp, errorMessage } from "@penrunner/ui";
import { UpdatePrompt } from "./components/UpdatePrompt.js";
import { makeClient } from "./lib/api.js";
import {
  detectLocale,
  persistLocale,
  translator,
  type Locale,
} from "./lib/i18n.js";
import { Auth } from "./screens/Auth.js";
import { Enroll } from "./screens/Enroll.js";
import { MyEntries } from "./screens/MyEntries.js";
import { Onboarding } from "./screens/Onboarding.js";
import { Roster } from "./screens/Roster.js";
import { VerifyGate } from "./screens/VerifyGate.js";

// ---------------------------------------------------------------------------
// Shell mobile-first: bottom-nav a tre aree (Iscrizioni · Iscrivi · Roster),
// sessione in localStorage, locale persistito (BR-62). Gate a tre stadi:
// senza sessione → Auth; sessione morta → pulizia e ritorno al login;
// loggato ma NON verificato → VerifyGate (mai un vicolo cieco); poi
// senza scuderia → Onboarding (BR-80).
// ---------------------------------------------------------------------------

const SESSION_KEY = "penrunner_stable_session";

type Tab = "entries" | "enroll" | "roster";

type Me = { email: string; emailVerified: boolean };

export function App() {
  const [locale, setLocale] = useState<Locale>(() => detectLocale());
  const [session, setSession] = useState<string | null>(
    () => localStorage.getItem(SESSION_KEY),
  );
  const [tab, setTab] = useState<Tab>("entries");
  const [me, setMe] = useState<Me | undefined>(undefined);
  const [stableId, setStableId] = useState<string | null | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);

  const t = useMemo(() => translator(locale), [locale]);
  const client = useMemo(() => makeClient(session), [session]);

  const saveSession = (token: string | null) => {
    if (token) localStorage.setItem(SESSION_KEY, token);
    else localStorage.removeItem(SESSION_KEY);
    setSession(token);
    setMe(undefined);
    setStableId(undefined);
    setError(null);
  };

  // Stadio 1 del gate: chi sono? Sessione morta/revocata → pulizia graziosa
  // e ritorno al login (niente toast grezzo sul Loading).
  const loadMe = useCallback(async () => {
    if (!session) return;
    try {
      setMe(await client.auth.me.query());
    } catch (err) {
      if (errorMessage(err) === "UNAUTHORIZED") {
        localStorage.removeItem(SESSION_KEY);
        setSession(null);
        setMe(undefined);
      } else {
        setError(errorMessage(err));
      }
    }
  }, [client, session]);

  useEffect(() => {
    void loadMe();
  }, [loadMe]);

  // La scuderia del referente: prima di cui si è referenti (MVP: una).
  // Parte solo OLTRE il gate: mai un FORBIDDEN "Email non verificata" qui.
  const loadStable = useCallback(async () => {
    if (!session || !me?.emailVerified) return;
    try {
      const mine = await client.roster.myStables.query();
      setStableId(mine[0]?.stableId ?? null);
    } catch (err) {
      setError(errorMessage(err));
    }
  }, [client, session, me]);

  useEffect(() => {
    void loadStable();
  }, [loadStable]);

  const localeToggle = (
    <button
      className="btn small"
      onClick={() => {
        const next = locale === "it" ? "en" : "it";
        persistLocale(next);
        setLocale(next);
      }}
    >
      {locale === "it" ? "EN" : "IT"}
    </button>
  );

  // BR-83: banner aggiornamento + stamp di versione, su OGNI schermata.
  const updateUi = (
    <>
      <UpdatePrompt t={t} />
      <VersionStamp version={__APP_VERSION__} />
    </>
  );

  if (!session) {
    return (
      <>
        <header className="topbar">
          <span className="brand">{t("app.name")}</span>
          <span className="spacer" />
          {localeToggle}
        </header>
        <Auth t={t} client={client} onSession={saveSession} />
        {updateUi}
      </>
    );
  }

  // Stadi 1-2 del gate: identità in carico, poi verifica email (interstitial:
  // codice + resend + esci — mai un vicolo cieco, reperto staging).
  if (me === undefined || !me.emailVerified) {
    return (
      <>
        <header className="topbar">
          <span className="brand">{t("app.name")}</span>
          <span className="spacer" />
          {localeToggle}
        </header>
        {error && (
          <div className="banner danger">
            {t("app.error", { msg: error })}{" "}
            <button className="btn small" onClick={() => { setError(null); void loadMe(); }}>
              {t("app.retry")}
            </button>
          </div>
        )}
        {me === undefined ? (
          <main className="page">
            <p className="muted">{t("app.loading")}</p>
          </main>
        ) : (
          <VerifyGate
            t={t}
            client={client}
            email={me.email}
            onVerified={() => { setMe(undefined); void loadMe(); }}
            onLogout={() => {
              void client.auth.logout.mutate().catch(() => {});
              saveSession(null);
            }}
          />
        )}
        {updateUi}
      </>
    );
  }

  return (
    <>
      <header className="topbar">
        <span className="brand">{t("app.name")}</span>
        {/* fase c: da desktop la nav sta in alto, la bottom-nav sparisce */}
        {stableId && (
          <nav className="topnav-desktop">
            {(
              [
                ["entries", "nav.entries"],
                ["enroll", "nav.enroll"],
                ["roster", "nav.roster"],
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
          </nav>
        )}
        <span className="spacer" />
        {localeToggle}
        <button
          className="btn small"
          onClick={() => {
            void client.auth.logout.mutate().catch(() => {});
            saveSession(null);
          }}
        >
          {t("app.logout")}
        </button>
      </header>
      <main className="page with-bottomnav">
        {error && (
          <div className="banner danger">
            {t("app.error", { msg: error })}{" "}
            <button className="btn small" onClick={() => { setError(null); void loadMe(); void loadStable(); }}>
              {t("app.retry")}
            </button>
          </div>
        )}
        {stableId === undefined ? (
          <p className="muted">{t("app.loading")}</p>
        ) : stableId === null ? (
          <Onboarding t={t} client={client} onDone={loadStable} />
        ) : tab === "entries" ? (
          <MyEntries t={t} client={client} stableId={stableId} onGoRoster={() => setTab("roster")} />
        ) : tab === "enroll" ? (
          <Enroll
            t={t}
            client={client}
            stableId={stableId}
            onDone={() => setTab("entries")}
            onNeedRoster={() => setTab("roster")}
          />
        ) : (
          <Roster t={t} client={client} stableId={stableId} />
        )}
      </main>
      {stableId && (
        <nav className="bottomnav">
          {(
            [
              ["entries", "nav.entries"],
              ["enroll", "nav.enroll"],
              ["roster", "nav.roster"],
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
        </nav>
      )}
      {updateUi}
    </>
  );
}
