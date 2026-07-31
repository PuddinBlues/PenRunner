import { useState } from "react";
import { Badge, errorMessage } from "./Ui.js";
import type { Client } from "../lib/api.js";
import type { T } from "../lib/i18n.js";

type EventDetail = Awaited<ReturnType<Client["events"]["get"]["query"]>>;

/**
 * Quote (BR-02: la quota PenRunner e il margine si VEDONO, non si toccano),
 * cadenza ETA, sponsor, stato chirurgia draw (BR-43, read-only).
 */
export function SettingsPanel({
  t,
  client,
  event,
  onSaved,
}: {
  t: T;
  client: Client;
  event: EventDetail;
  onSaved: () => Promise<void>;
}) {
  const [slot, setSlot] = useState(String(event.slotDurationS));
  const [dragEvery, setDragEvery] = useState(String(event.dragEveryNRuns));
  const [dragDuration, setDragDuration] = useState(String(event.dragDurationS));
  // BR-91: distanza draw (min 8). BR-90: cut-off self-serve ("HH:MM").
  const [drawDistance, setDrawDistance] = useState(
    String(event.drawDistanceTarget),
  );
  const [cutoff, setCutoff] = useState(event.entryChangeCutoff);
  const [sponsorName, setSponsorName] = useState(event.sponsorName ?? "");
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  return (
    <div className="grid2">
      <div className="card">
        <h2>{t("fees.title")}</h2>
        <p className="hint">{t("fees.explain")}</p>
        <table className="tbl">
          <tbody>
            <tr>
              <td>{t("fees.perHorse")}</td>
              <td className="num" style={{ textAlign: "right" }}>
                {Number(event.feePerHorse).toFixed(2)} €
              </td>
            </tr>
            <tr>
              <td>
                {t("fees.platform")} <Badge>{t("fees.readonly")}</Badge>
              </td>
              <td className="num" style={{ textAlign: "right" }}>
                {event.effectivePlatformFeePerHorse.toFixed(2)} €
              </td>
            </tr>
            <tr>
              <td>
                <strong>{t("fees.margin")}</strong>
              </td>
              <td className="num" style={{ textAlign: "right" }}>
                <strong>{event.organizerMarginPerHorse.toFixed(2)} €</strong>
              </td>
            </tr>
          </tbody>
        </table>
        <p className="hint" style={{ marginTop: 12, marginBottom: 0 }}>
          {event.drawSurgeryEnabled
            ? t("settings.drawSurgeryOn")
            : t("settings.drawSurgeryOff")}
        </p>
      </div>

      <div className="card">
        <h2>{t("settings.title")}</h2>
        <p className="hint">{t("settings.eta")}</p>
        <div className="row" style={{ marginBottom: 12 }}>
          <label className="field">
            <span>{t("settings.slot")}</span>
            <input
              className="num"
              type="number"
              min="1"
              value={slot}
              onChange={(e) => setSlot(e.target.value)}
            />
          </label>
          <label className="field">
            <span>{t("settings.dragEvery")}</span>
            <input
              className="num"
              type="number"
              min="1"
              value={dragEvery}
              onChange={(e) => setDragEvery(e.target.value)}
            />
          </label>
          <label className="field">
            <span>{t("settings.dragDuration")}</span>
            <input
              className="num"
              type="number"
              min="0"
              value={dragDuration}
              onChange={(e) => setDragDuration(e.target.value)}
            />
          </label>
        </div>
        <p className="hint">{t("settings.drawRules")}</p>
        <div className="row" style={{ marginBottom: 12 }}>
          <label className="field">
            <span>{t("settings.drawDistance")}</span>
            <input
              className="num"
              type="number"
              min="8"
              max="50"
              value={drawDistance}
              onChange={(e) => setDrawDistance(e.target.value)}
            />
          </label>
          <label className="field">
            <span>{t("settings.cutoff")}</span>
            <input
              type="time"
              value={cutoff}
              onChange={(e) => setCutoff(e.target.value)}
            />
          </label>
        </div>
        <p className="hint">{t("settings.sponsor")}</p>
        <label className="field">
          <span>{t("settings.sponsorName")}</span>
          <input
            value={sponsorName}
            onChange={(e) => setSponsorName(e.target.value)}
          />
        </label>
        {error && <div className="error-inline">{error}</div>}
        {saved && <div className="ok-inline">{t("event.saved")}</div>}
        <button
          className="btn primary"
          onClick={async () => {
            setError(null);
            setSaved(false);
            try {
              await client.events.update.mutate({
                eventId: event.id,
                slotDurationS: Number(slot),
                dragEveryNRuns: Number(dragEvery),
                dragDurationS: Number(dragDuration),
                drawDistanceTarget: Number(drawDistance),
                entryChangeCutoff: cutoff,
                sponsorName: sponsorName || null,
              });
              setSaved(true);
              await onSaved();
            } catch (err) {
              setError(errorMessage(err));
            }
          }}
        >
          {t("event.save")}
        </button>
      </div>
    </div>
  );
}
