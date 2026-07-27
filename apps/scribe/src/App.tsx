import { useCallback, useEffect, useState } from "react";
import type { ScribeStore } from "@penrunner/core";
import { StatusBar } from "./components/StatusBar.js";
import { Enter } from "./screens/Enter.js";
import { RunList } from "./screens/RunList.js";
import { Scoring } from "./screens/Scoring.js";
import { Signing } from "./screens/Signing.js";
import { detectLocale, translator, type Locale } from "./lib/i18n.js";
import {
  loadBundle,
  loadSession,
  openStore,
  syncNow,
} from "./lib/scribe.js";
import type { ScoringBundle, Session } from "./lib/types.js";

type Screen =
  | { name: "enter" }
  | { name: "runlist" }
  | { name: "scoring"; runId: string }
  | { name: "signing"; blockCardIds: string[] };

export function App() {
  const [locale, setLocale] = useState<Locale>(detectLocale());
  const t = translator(locale);
  const [session, setSession] = useState<Session | null>(null);
  const [bundle, setBundle] = useState<ScoringBundle | null>(null);
  const [store, setStore] = useState<ScribeStore | null>(null);
  const [judgeId, setJudgeId] = useState<string | null>(null);
  const [classId, setClassId] = useState<string | null>(null);
  const [screen, setScreen] = useState<Screen>({ name: "enter" });
  const [online, setOnline] = useState(navigator.onLine);
  const [queue, setQueue] = useState({ cards: 0, events: 0 });
  const [tick, setTick] = useState(0); // forza il refresh dopo una mutazione

  const refresh = useCallback(() => setTick((n) => n + 1), []);

  useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    return () => {
      window.removeEventListener("online", on);
      window.removeEventListener("offline", off);
    };
  }, []);

  // ripresa: se c'è già una sessione salvata, rientra (recovery)
  useEffect(() => {
    void (async () => {
      const s = await loadSession();
      if (s) {
        setSession(s);
        const b = await loadBundle(s);
        if (b) setBundle(b);
      }
    })();
  }, []);

  useEffect(() => {
    if (store) setQueue(store.queuedCounts);
  }, [store, tick]);

  // sync quando torna la rete e periodicamente
  useEffect(() => {
    if (!session || !store || !online) return;
    let alive = true;
    const flush = () =>
      syncNow(session, store)
        .then(() => alive && refresh())
        .catch(() => undefined);
    void flush();
    const id = setInterval(flush, 8000);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, [session, store, online, tick, refresh]);

  const onReady = useCallback(
    async (s: Session, b: ScoringBundle, jId: string, cId: string) => {
      setSession(s);
      setBundle(b);
      setJudgeId(jId);
      setClassId(cId);
      const st = await openStore(s.eventId, jId);
      setStore(st);
      setScreen({ name: "runlist" });
    },
    [],
  );

  return (
    <div className="app">
      {screen.name !== "enter" && (
        <StatusBar
          t={t}
          locale={locale}
          onLocale={(l) => {
            setLocale(l);
            localStorage.setItem("penrunner_locale", l);
          }}
          online={online}
          queue={queue}
        />
      )}
      {screen.name === "enter" && <Enter t={t} onReady={onReady} />}
      {screen.name === "runlist" && store && bundle && classId && judgeId && (
        <RunList
          t={t}
          locale={locale}
          bundle={bundle}
          store={store}
          classId={classId}
          judgeId={judgeId}
          tick={tick}
          onScore={(runId) => setScreen({ name: "scoring", runId })}
          onSign={(blockCardIds) => setScreen({ name: "signing", blockCardIds })}
        />
      )}
      {screen.name === "scoring" && store && bundle && session && judgeId && (
        <Scoring
          t={t}
          locale={locale}
          bundle={bundle}
          store={store}
          session={session}
          judgeId={judgeId}
          runId={screen.runId}
          onMutate={refresh}
          onDone={() => {
            refresh();
            setScreen({ name: "runlist" });
          }}
        />
      )}
      {screen.name === "signing" && store && bundle && classId && judgeId && (
        <Signing
          t={t}
          bundle={bundle}
          store={store}
          classId={classId}
          judgeId={judgeId}
          blockCardIds={screen.blockCardIds}
          onMutate={refresh}
          onDone={() => {
            refresh();
            setScreen({ name: "runlist" });
          }}
        />
      )}
    </div>
  );
}
