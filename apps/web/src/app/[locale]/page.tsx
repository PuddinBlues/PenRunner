import Link from "next/link";
import { api } from "../../lib/api";
import { t, type Locale } from "../../lib/i18n";

export const dynamic = "force-dynamic";

const TIER_KEY = {
  regionale: "common.tier.regionale",
  nazionale: "common.tier.nazionale",
  internazionale: "common.tier.internazionale",
  premium: "common.tier.premium",
} as const;

export default async function Home({
  params,
}: {
  params: Promise<{ locale: Locale }>;
}) {
  const { locale } = await params;
  const tr = t(locale);
  const events = await api.live.calendar.query();
  return (
    <div>
      <h1 style={{ fontSize: 22 }}>{tr("home.calendar")}</h1>
      {events.length === 0 && (
        <p style={{ color: "var(--slate-500)" }}>{tr("home.noEvents")}</p>
      )}
      <div style={{ display: "grid", gap: 10 }}>
        {events.map((e) => (
          <Link
            key={e.id}
            href={`/${locale}/eventi/${e.id}`}
            className="card"
            style={{
              display: "flex",
              gap: 14,
              alignItems: "center",
              padding: 14,
              textDecoration: "none",
              borderLeft: `4px solid ${e.themePrimary ?? "var(--accent)"}`,
            }}
          >
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 700 }}>{e.name}</div>
              <div style={{ fontSize: 13, color: "var(--slate-500)" }}>
                {e.venue} · <span className="num">{e.startDate}</span>
              </div>
            </div>
            {e.status === "in_corso" && (
              <span
                style={{
                  color: "var(--live)",
                  fontWeight: 700,
                  fontSize: 12,
                  display: "flex",
                  gap: 6,
                  alignItems: "center",
                }}
              >
                <span className="livedot" /> {tr("event.live")}
              </span>
            )}
            <span
              style={{
                fontSize: 11,
                fontWeight: 600,
                textTransform: "uppercase",
                letterSpacing: "0.4px",
                // l'oro è riservato al solo tier premium
                color:
                  e.tier === "premium" ? "var(--gold)" : "var(--slate-400)",
              }}
            >
              {tr(TIER_KEY[e.tier])}
            </span>
          </Link>
        ))}
      </div>
    </div>
  );
}
