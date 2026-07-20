import { api } from "../../../../../lib/api";
import { t, type Locale } from "../../../../../lib/i18n";

export const dynamic = "force-dynamic";

export default async function StartListPage({
  params,
}: {
  params: Promise<{ locale: Locale; classId: string }>;
}) {
  const { locale, classId } = await params;
  const tr = t(locale);
  const [startList, eta] = await Promise.all([
    api.draw.startList.query({ classId }),
    api.live.classEta.query({ classId }),
  ]);
  const etaByEntry = new Map(eta.map((e) => [e.entryId, e]));

  return (
    <div>
      <h1 style={{ fontSize: 20 }}>
        {tr("startlist.title")} · {startList.className}
      </h1>
      <div className="card" style={{ overflow: "hidden" }}>
        {startList.entries.map((e) => {
          const est = etaByEntry.get(e.entryId);
          return (
            <div key={e.entryId}>
              <div
                style={{
                  display: "flex",
                  gap: 12,
                  padding: "10px 14px",
                  alignItems: "baseline",
                  borderTop: "0.5px solid rgba(15,23,42,0.08)",
                  opacity: e.scratched ? 0.45 : 1,
                }}
              >
                <span className="num" style={{ fontWeight: 700, width: 30 }}>
                  {e.drawNumber}
                </span>
                <span style={{ flex: 1 }}>
                  <b>{e.horseName}</b>{" "}
                  <span style={{ color: "var(--slate-500)" }}>· {e.riderName}</span>
                </span>
                {e.scratched ? (
                  <span style={{ fontSize: 12, color: "var(--slate-400)" }}>
                    {tr("startlist.scratched")}
                  </span>
                ) : est ? (
                  <span className="num" style={{ fontSize: 12.5, color: "var(--slate-500)" }}>
                    {est.etaMs !== null
                      ? `~${Math.max(1, Math.round(est.etaMs / 60000))} ${tr("common.minutes")}`
                      : `${est.runsBefore} ${tr("startlist.runsBefore")} (${tr("startlist.etaSchedule")})`}
                  </span>
                ) : null}
              </div>
              {/* marker di drag derivati live (BR-51): trasparenza sul confine */}
              {startList.dragAfter.includes(e.drawNumber!) && (
                <div
                  style={{
                    padding: "4px 14px",
                    fontSize: 11,
                    fontWeight: 600,
                    textTransform: "uppercase",
                    letterSpacing: "0.5px",
                    background: "var(--slate-100)",
                    color: "var(--slate-500)",
                  }}
                >
                  ⛏ {tr("startlist.drag")}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
