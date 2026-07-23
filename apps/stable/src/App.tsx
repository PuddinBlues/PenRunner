import { useCallback, useEffect, useMemo, useState } from "react";
import { errorMessage } from "@penrunner/ui";
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

// ---------------------------------------------------------------------------
// Shell mobile-first: bottom-nav a tre aree (Iscrizioni · Iscrivi · Roster),
// sessione in localStorage, locale persistito (BR-62). Il gate d'ingresso:
// senza sessione → Auth; senza scuderia → Onboarding (BR-80).
// ---------------------------------------------------------------------------

const SESSION_KEY = "penrunner_stable_session";

type Tab = "entries" | "enroll" | "roster";

export function App() {
  const [locale, setLocale] = useState<Locale>(() => detectLocale());
  const [session, setSession] = useState<string | null>(
    () => localStorage.getItem(SESSION_KEY),
  );
  const [tab, setTab] = useState<Tab>("entries");
  const [stableId, setStableId] = useState<string | null | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);

  const t = useMemo(() => translator(locale), [locale]);
  const client = useMemo(() => makeClient(session), [session]);

  const saveSession = (token: string | null) => {
    if (token) localStorage.setItem(SESSION_KEY, token);
    else localStorage.removeItem(SESSION_KEY);
    setSession(token);
    setStableId(undefined);
  };

  // La scuderia del referente: prima di cui si è referenti (MVP: una).
  const loadStable = useCallback(async () => {
    if (!session) return;
    try {
      const me = await client.roster.myStables.query();
      setStableId(me[0]?.stableId ?? null);
    } catch (err) {
      setError(errorMessage(err));
    }
  }, [client, session]);

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

  if (!session) {
    return (
      <>
        <header className="topbar">
          <span className="brand">{t("app.name")}</span>
          <span className="spacer" />
          {localeToggle}
        </header>
        <Auth t={t} client={client} onSession={saveSession} />
      </>
    );
  }

  return (
    <>
      <header className="topbar">
        <span className="brand">{t("app.name")}</span>
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
        {error && <div className="banner danger">{t("app.error", { msg: error })}</div>}
        {stableId === undefined ? (
          <p className="muted">{t("app.loading")}</p>
        ) : stableId === null ? (
          <Onboarding t={t} client={client} onDone={loadStable} />
        ) : tab === "entries" ? (
          <MyEntries t={t} client={client} stableId={stableId} />
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
    </>
  );
}
