import { api } from "../../../../../lib/api";
import { t, type Locale } from "../../../../../lib/i18n";

export const dynamic = "force-dynamic";

// Pagina pattern pubblica: SOLO passi testuali da patterns.json — i diagrammi
// arriveranno come asset (mai generati programmaticamente, mai tavole NRHA).
export default async function PatternPage({
  params,
}: {
  params: Promise<{ locale: Locale; classId: string }>;
}) {
  const { locale, classId } = await params;
  const tr = t(locale);
  const data = await api.live.classPattern.query({ classId });
  const gaitKey = `pattern.gait.${data.pattern.entryGait}` as const;

  return (
    <div>
      <h1 style={{ fontSize: 20 }}>
        {tr("pattern.title")} {data.pattern.code} · {data.className}
      </h1>
      <p style={{ color: "var(--slate-500)", fontSize: 14 }}>
        {tr("pattern.entry")}: <b>{tr(gaitKey)}</b>
        {data.pattern.entryStart ? ` — ${data.pattern.entryStart}` : ""}
      </p>
      {data.trotInImposed && (
        <p
          style={{
            background: "#FFF7ED",
            border: "0.5px solid rgba(180,83,9,0.3)",
            color: "#9A3412",
            borderRadius: 8,
            padding: "10px 14px",
            fontSize: 13,
          }}
        >
          {tr("pattern.trotInImposed")}
        </p>
      )}
      <h2 style={{ fontSize: 15 }}>{tr("pattern.steps")}</h2>
      <ol style={{ display: "grid", gap: 8, paddingLeft: 22 }}>
        {data.maneuvers.map((m) => (
          <li key={m.position} style={{ fontSize: 14.5, lineHeight: 1.5 }}>
            {locale === "en" && m.labelEn ? m.labelEn : m.labelIt}
          </li>
        ))}
      </ol>
    </div>
  );
}
