"use client";

import Link from "next/link";
import { t, type Locale } from "../lib/i18n";
import { formatEta, formatScore, useEventLive } from "./useEventLive";

// ---------------------------------------------------------------------------
// Vista live condivisa: la pagina evento (registro scuro, spettacolo) e la
// scoreboard kiosk consumano la STESSA fonte (live.eventLive) — cambia solo
// la presentazione (variant).
// ---------------------------------------------------------------------------

interface RankRow {
  entryId: string;
  drawNumber: number | null;
  horseName: string;
  riderName: string;
  position: number | null;
  sharedPosition: boolean;
  total: number | null;
  outcome: string;
  state: string;
  provisional: boolean;
  label: string | null;
}

interface LivePayload {
  event: {
    id: string;
    name: string;
    venue: string;
    status: string;
    themePrimary: string | null;
    sponsorName: string | null;
    sponsorImageUrl: string | null;
  };
  focus: {
    className: string;
    goComplete: boolean;
    official: boolean;
    firstPlaceTie: boolean;
    inField: { drawNumber: number | null; horseName: string; riderName: string } | null;
    previous:
      | ({ total: number | null; provisional?: boolean } & {
          drawNumber: number | null;
          horseName: string;
          riderName: string;
        })
      | null;
    nextUp: Array<{
      drawNumber: number | null;
      horseName: string;
      riderName: string;
      etaMs: number | null;
      mode: string;
    }>;
    leader: RankRow | null;
    ranking: RankRow[];
    excluded: RankRow[];
    nextClassStartList: {
      className: string;
      entries: Array<{
        drawNumber: number | null;
        horseName: string;
        riderName: string;
        etaMs: number | null;
      }>;
    } | null;
  } | null;
}

export function LiveEvent({
  eventId,
  locale,
  variant,
}: {
  eventId: string;
  locale: Locale;
  variant: "event" | "scoreboard";
}) {
  const tr = t(locale);
  const data = useEventLive<LivePayload>(eventId, "live.eventLive", { eventId });
  if (!data) return null;
  const { event, focus } = data;
  const big = variant === "scoreboard";

  return (
    <div className="dark" style={{ borderRadius: big ? 0 : 12, padding: big ? 32 : 20, minHeight: big ? "100vh" : undefined }}>
      <div style={{ display: "flex", alignItems: "baseline", gap: 12 }}>
        <h1 style={{ fontSize: big ? 34 : 20, margin: 0 }}>{event.name}</h1>
        {event.status === "in_corso" && (
          <span style={{ color: "var(--live)", fontWeight: 700, display: "flex", gap: 8, alignItems: "center", fontSize: big ? 18 : 13 }}>
            <span className="livedot" /> {tr("event.live")}
          </span>
        )}
        {event.sponsorName && (
          <span style={{ marginLeft: "auto", color: "var(--slate-400)", fontSize: big ? 16 : 12 }}>
            {event.sponsorImageUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={event.sponsorImageUrl} alt={event.sponsorName} style={{ height: big ? 40 : 22 }} />
            ) : (
              event.sponsorName
            )}
          </span>
        )}
      </div>

      {!focus && <p style={{ color: "var(--slate-400)" }}>{tr("event.notStarted")}</p>}

      {focus && !focus.goComplete && (
        <div style={{ display: "grid", gridTemplateColumns: big ? "1fr 1fr 1fr" : "1fr", gap: 16, marginTop: 18 }}>
          <Panel title={tr("event.inField")} big={big} accent>
            {focus.inField ? (
              <Binomio {...focus.inField} big={big} />
            ) : (
              <span style={{ color: "var(--slate-500)" }}>—</span>
            )}
          </Panel>
          <Panel title={tr("event.previous")} big={big}>
            {focus.previous ? (
              <div>
                <Binomio {...focus.previous} big={big} />
                <div
                  className="num"
                  style={{
                    fontSize: big ? 96 : 40,
                    fontWeight: 800,
                    lineHeight: 1,
                    color:
                      (focus.previous.total ?? 0) >= 70
                        ? "var(--accent-500)"
                        : "var(--amber)",
                  }}
                >
                  {formatScore(focus.previous.total)}
                </div>
                {focus.previous.provisional !== false && (
                  <span style={{ fontSize: big ? 14 : 11, color: "var(--slate-400)" }}>
                    {tr("event.rankingProvisional")}
                  </span>
                )}
              </div>
            ) : (
              <span style={{ color: "var(--slate-500)" }}>—</span>
            )}
          </Panel>
          <Panel title={tr("event.nextUp")} big={big}>
            {focus.nextUp.map((n) => (
              <div key={`${n.drawNumber}`} style={{ display: "flex", gap: 10, alignItems: "baseline", marginBottom: 6 }}>
                <Draw n={n.drawNumber} />
                <span style={{ flex: 1 }}>{n.horseName}</span>
                <span className="num" style={{ color: "var(--slate-400)", fontSize: big ? 15 : 12 }}>
                  {formatEta(n.etaMs, locale, tr("startlist.etaSchedule"))}
                </span>
              </div>
            ))}
            {focus.leader && (
              <div style={{ marginTop: 10, fontSize: big ? 16 : 12, color: "var(--slate-400)" }}>
                {tr("event.leader")}:{" "}
                <b className="num" style={{ color: "#fff" }}>
                  {formatScore(focus.leader.total)}
                </b>{" "}
                {focus.leader.horseName}
              </div>
            )}
          </Panel>
        </div>
      )}

      {focus && (
        <div style={{ marginTop: 22 }}>
          <div style={{ display: "flex", gap: 10, alignItems: "baseline" }}>
            <h2 style={{ fontSize: big ? 24 : 16, margin: 0 }}>
              {focus.goComplete ? `${tr("event.goComplete")} · ` : ""}
              {focus.className} —{" "}
              {focus.official ? tr("event.rankingOfficial") : tr("event.rankingProvisional")}
            </h2>
          </div>
          {focus.firstPlaceTie && (
            <div style={{ color: "var(--amber)", fontSize: big ? 15 : 12, marginTop: 4 }}>
              {tr("event.firstPlaceTie")}
            </div>
          )}
          <table style={{ width: "100%", borderCollapse: "collapse", marginTop: 10, fontSize: big ? 20 : 14 }}>
            <tbody>
              {focus.ranking.map((r) => (
                <tr key={r.entryId} style={{ borderTop: "0.5px solid rgba(255,255,255,0.12)" }}>
                  <td className="num" style={{ padding: "6px 8px", width: 40, color: "var(--slate-400)" }}>
                    {r.position ?? "·"}
                  </td>
                  <td style={{ padding: "6px 8px" }}>
                    {r.horseName}
                    <span style={{ color: "var(--slate-400)" }}> · {r.riderName}</span>
                  </td>
                  <td className="num" style={{ padding: "6px 8px", textAlign: "right", fontWeight: 700 }}>
                    {r.label ?? (r.outcome === "score_0" ? "0" : formatScore(r.total))}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {focus.excluded.length > 0 && (
            <div style={{ marginTop: 8, color: "var(--slate-500)", fontSize: big ? 15 : 12 }}>
              {tr("event.excluded")}: {focus.excluded.map((r) => r.horseName).join(", ")}
            </div>
          )}
          {focus.goComplete && focus.nextClassStartList && (
            <div style={{ marginTop: 18 }}>
              <h3 style={{ fontSize: big ? 20 : 14, margin: "0 0 8px" }}>
                {tr("event.nextClass")}: {focus.nextClassStartList.className}
              </h3>
              {focus.nextClassStartList.entries.map((e) => (
                <div key={`${e.drawNumber}`} style={{ display: "flex", gap: 10, marginBottom: 4, fontSize: big ? 18 : 13 }}>
                  <Draw n={e.drawNumber} />
                  <span style={{ flex: 1 }}>
                    {e.horseName} <span style={{ color: "var(--slate-400)" }}>· {e.riderName}</span>
                  </span>
                  <span className="num" style={{ color: "var(--slate-400)" }}>
                    {formatEta(e.etaMs, locale, tr("startlist.etaSchedule"))}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {variant === "event" && (
        <div style={{ marginTop: 16, fontSize: 12 }}>
          <Link href={`/scoreboard/${event.id}`} style={{ color: "var(--slate-400)" }}>
            Scoreboard →
          </Link>
        </div>
      )}
    </div>
  );
}

function Panel({
  title,
  children,
  big,
  accent,
}: {
  title: string;
  children: React.ReactNode;
  big: boolean;
  accent?: boolean;
}) {
  return (
    <section
      style={{
        border: `0.5px solid ${accent ? "var(--accent-500)" : "rgba(255,255,255,0.15)"}`,
        borderRadius: 10,
        padding: big ? 20 : 14,
      }}
    >
      <div
        style={{
          fontSize: big ? 14 : 10.5,
          textTransform: "uppercase",
          letterSpacing: "0.6px",
          color: "var(--slate-400)",
          marginBottom: 8,
        }}
      >
        {title}
      </div>
      {children}
    </section>
  );
}

function Binomio({
  drawNumber,
  horseName,
  riderName,
  big,
}: {
  drawNumber: number | null;
  horseName: string;
  riderName: string;
  big?: boolean;
}) {
  return (
    <div style={{ display: "flex", gap: 10, alignItems: "baseline" }}>
      <Draw n={drawNumber} />
      <div>
        <div style={{ fontWeight: 700, fontSize: big ? 26 : 15 }}>{horseName}</div>
        <div style={{ color: "var(--slate-400)", fontSize: big ? 16 : 12 }}>{riderName}</div>
      </div>
    </div>
  );
}

function Draw({ n }: { n: number | null }) {
  return (
    <span
      className="num"
      style={{
        background: "rgba(255,255,255,0.12)",
        borderRadius: 6,
        padding: "1px 7px",
        fontWeight: 700,
      }}
    >
      {n ?? "—"}
    </span>
  );
}
