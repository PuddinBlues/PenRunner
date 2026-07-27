import { useEffect, useMemo, useState } from "react";
import { makeClient } from "./lib/api.js";
import {
  detectLocale,
  translator,
  type Locale,
} from "./lib/i18n.js";
import { Auth } from "./screens/Auth.js";
import { ClassDetail } from "./screens/ClassDetail.js";
import { EventDetail } from "./screens/EventDetail.js";
import { EventsList } from "./screens/EventsList.js";
import { EventWizard } from "./screens/EventWizard.js";

// ---------------------------------------------------------------------------
// Shell: sessione (localStorage), locale persistito (BR-62), routing hash
// (#/, #/new, #/event/:id, #/event/:id/class/:classId) — refresh e link
// condivisibili senza server di routing.
// ---------------------------------------------------------------------------

const SESSION_KEY = "penrunner_organizer_session";

type Route =
  | { name: "events" }
  | { name: "wizard" }
  | { name: "event"; eventId: string }
  | { name: "class"; eventId: string; classId: string };

function parseHash(hash: string): Route {
  const parts = hash.replace(/^#\/?/, "").split("/").filter(Boolean);
  if (parts[0] === "new") return { name: "wizard" };
  if (parts[0] === "event" && parts[1]) {
    if (parts[2] === "class" && parts[3]) {
      return { name: "class", eventId: parts[1], classId: parts[3] };
    }
    return { name: "event", eventId: parts[1] };
  }
  return { name: "events" };
}

export function navigate(path: string) {
  window.location.hash = path;
}

export function App() {
  const [locale, setLocale] = useState<Locale>(() => detectLocale());
  const [session, setSession] = useState<string | null>(
    () => localStorage.getItem(SESSION_KEY),
  );
  const [route, setRoute] = useState<Route>(() => parseHash(window.location.hash));

  useEffect(() => {
    const onHash = () => setRoute(parseHash(window.location.hash));
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  const t = useMemo(() => translator(locale), [locale]);
  const client = useMemo(() => makeClient(session), [session]);

  const saveLocale = (l: Locale) => {
    localStorage.setItem("penrunner_locale", l);
    setLocale(l);
  };
  const saveSession = (token: string | null) => {
    if (token) localStorage.setItem(SESSION_KEY, token);
    else localStorage.removeItem(SESSION_KEY);
    setSession(token);
  };

  const localeToggle = (
    <button
      className="btn small"
      onClick={() => saveLocale(locale === "it" ? "en" : "it")}
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
        <span className="brand" onClick={() => navigate("/")}>
          {t("app.name")}
        </span>
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
      <main className="page">
        {route.name === "events" && <EventsList t={t} client={client} />}
        {route.name === "wizard" && <EventWizard t={t} client={client} />}
        {route.name === "event" && (
          <EventDetail t={t} client={client} eventId={route.eventId} session={session} />
        )}
        {route.name === "class" && (
          <ClassDetail
            t={t}
            locale={locale}
            client={client}
            eventId={route.eventId}
            classId={route.classId}
            session={session}
          />
        )}
      </main>
    </>
  );
}
