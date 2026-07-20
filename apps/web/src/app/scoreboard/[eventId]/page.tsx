import Link from "next/link";
import { LiveEvent } from "../../../components/LiveEvent";
import { t } from "../../../lib/i18n";

export const dynamic = "force-dynamic";

// Scoreboard kiosk (MVP): landscape 16:9 su qualsiasi TV con browser,
// registro scuro, auto-aggiornante, zero interazione. In portrait la route
// rimanda alla pagina evento — l'esperienza mobile del pubblico.
export default async function ScoreboardPage({
  params,
}: {
  params: Promise<{ eventId: string }>;
}) {
  const { eventId } = await params;
  const tr = t("it"); // gergo di gara inglese comunque (BR-61)
  return (
    <div className="dark" style={{ minHeight: "100vh" }}>
      <div className="kiosk-only">
        <LiveEvent eventId={eventId} locale="it" variant="scoreboard" />
      </div>
      <div
        className="portrait-guard"
        style={{
          minHeight: "100vh",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: 16,
          padding: 30,
          textAlign: "center",
        }}
      >
        <p style={{ color: "var(--slate-400)" }}>{tr("scoreboard.portrait")}</p>
        <Link
          href={`/it/eventi/${eventId}`}
          style={{
            background: "var(--accent)",
            color: "#fff",
            padding: "12px 22px",
            borderRadius: 8,
            textDecoration: "none",
            fontWeight: 600,
          }}
        >
          {tr("scoreboard.open")}
        </Link>
      </div>
    </div>
  );
}
