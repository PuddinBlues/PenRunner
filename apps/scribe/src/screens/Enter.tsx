import { useEffect, useState } from "react";
import type { MessageKey } from "../lib/i18n.js";
import { acceptInvite, loadBundle, loadSession } from "../lib/scribe.js";
import type { ScoringBundle, Session } from "../lib/types.js";

type T = (key: MessageKey, vars?: Record<string, string | number>) => string;

// Ingresso auto-esplicativo (BR-80): il magic link porta dentro; l'app scarica
// la classe per l'uso offline e spiega da sola cosa fare. Nessun blocco su
// installazione (BR-81): l'hint "Aggiungi a Home" è suggerimento, non gate.
export function Enter({
  t,
  onReady,
}: {
  t: T;
  onReady: (s: Session, b: ScoringBundle, judgeId: string, classId: string) => void;
}) {
  const [phase, setPhase] = useState<"loading" | "pick" | "error">("loading");
  const [session, setSession] = useState<Session | null>(null);
  const [bundle, setBundle] = useState<ScoringBundle | null>(null);
  const [judgeId, setJudgeId] = useState<string | null>(null);
  const [classId, setClassId] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      try {
        const token = new URLSearchParams(location.search).get("token");
        const s = token ? await acceptInvite(token) : await loadSession();
        if (!s) return setPhase("error");
        const b = await loadBundle(s);
        if (!b) return setPhase("error");
        setSession(s);
        setBundle(b);
        if (s.role === "giudice" && b.selfJudgePersonId) setJudgeId(b.selfJudgePersonId);
        if (b.classes.length === 1) setClassId(b.classes[0]!.id);
        setPhase("pick");
        if (token) history.replaceState(null, "", location.pathname);
      } catch {
        setPhase("error");
      }
    })();
  }, []);

  if (phase === "loading")
    return (
      <div className="content">
        <p className="hint">{t("enter.loading")}</p>
      </div>
    );

  if (phase === "error")
    return (
      <div className="content">
        <p className="hint">{t("enter.linkInvalid")}</p>
      </div>
    );

  const judges = bundle!.judges.filter(
    (j) => j.classId === null || j.classId === classId,
  );
  const ready = classId && judgeId;

  return (
    <div className="content">
      <h1 style={{ fontSize: 22 }}>{t("enter.welcome")}</h1>
      <p className="hint" style={{ color: "var(--accent)" }}>
        ✓ {t("enter.ready")}
      </p>

      {bundle!.classes.length > 1 && (
        <section style={{ marginTop: 16 }}>
          <div className="hint" style={{ marginBottom: 8 }}>{t("enter.pickClass")}</div>
          <div style={{ display: "grid", gap: 8 }}>
            {bundle!.classes.map((c) => (
              <button
                key={c.id}
                className={classId === c.id ? "primary" : "ghost"}
                onClick={() => setClassId(c.id)}
              >
                {c.name}
              </button>
            ))}
          </div>
        </section>
      )}

      {session!.role === "scribe" && (
        <section style={{ marginTop: 16 }}>
          <div className="hint" style={{ marginBottom: 8 }}>{t("enter.pickJudge")}</div>
          <div style={{ display: "grid", gap: 8 }}>
            {judges.map((j) => (
              <button
                key={j.personId}
                className={judgeId === j.personId ? "primary" : "ghost"}
                onClick={() => setJudgeId(j.personId)}
              >
                {j.fullName}
              </button>
            ))}
          </div>
        </section>
      )}

      <button
        className="primary"
        style={{ marginTop: 20 }}
        disabled={!ready}
        onClick={() => onReady(session!, bundle!, judgeId!, classId!)}
      >
        {t("runlist.title")} →
      </button>

      <p className="hint" style={{ marginTop: 24, fontSize: 12.5 }}>
        {t("enter.installHint")}
      </p>
    </div>
  );
}
