import { useState } from "react";
import { errorMessage } from "./Ui.js";
import type { Client } from "../lib/api.js";
import type { MessageKey, T } from "../lib/i18n.js";

const TIERS = ["regionale", "nazionale", "internazionale", "premium"] as const;

export interface EventFormValues {
  name: string;
  venue: string;
  startDate: string;
  endDate: string;
  tier: (typeof TIERS)[number];
  feePerHorse: string;
  selfScratchEnabled: boolean;
}

/** Form dati evento, condiviso tra wizard (crea) e impostazioni (aggiorna). */
export function EventForm({
  t,
  initial,
  feeLocked,
  submitLabel,
  onSubmit,
}: {
  t: T;
  initial?: Partial<EventFormValues>;
  /** BR-03: a iscrizioni aperte la quota al cavaliere non si tocca più. */
  feeLocked?: boolean;
  submitLabel: string;
  onSubmit: (values: EventFormValues) => Promise<void>;
}) {
  const [values, setValues] = useState<EventFormValues>({
    name: initial?.name ?? "",
    venue: initial?.venue ?? "",
    startDate: initial?.startDate ?? "",
    endDate: initial?.endDate ?? "",
    tier: initial?.tier ?? "regionale",
    feePerHorse: initial?.feePerHorse ?? "15",
    selfScratchEnabled: initial?.selfScratchEnabled ?? true,
  });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const set = <K extends keyof EventFormValues>(k: K, v: EventFormValues[K]) =>
    setValues((prev) => ({ ...prev, [k]: v }));

  const valid =
    values.name && values.venue && values.startDate && values.endDate;

  return (
    <div>
      <label className="field">
        <span>{t("event.name")}</span>
        <input value={values.name} onChange={(e) => set("name", e.target.value)} />
      </label>
      <label className="field">
        <span>{t("event.venue")}</span>
        <input value={values.venue} onChange={(e) => set("venue", e.target.value)} />
      </label>
      <div className="row" style={{ marginBottom: 12 }}>
        <label className="field">
          <span>{t("event.startDate")}</span>
          <input
            type="date"
            value={values.startDate}
            onChange={(e) => set("startDate", e.target.value)}
          />
        </label>
        <label className="field">
          <span>{t("event.endDate")}</span>
          <input
            type="date"
            value={values.endDate}
            onChange={(e) => set("endDate", e.target.value)}
          />
        </label>
        <label className="field">
          <span>{t("event.tier")}</span>
          <select
            value={values.tier}
            onChange={(e) => set("tier", e.target.value as EventFormValues["tier"])}
          >
            {TIERS.map((tier) => (
              <option key={tier} value={tier}>
                {t(`tier.${tier}` as MessageKey)}
              </option>
            ))}
          </select>
        </label>
      </div>
      <label className="field" style={{ maxWidth: 320 }}>
        <span>
          {t("event.feePerHorse")}
          {feeLocked ? ` — ${t("event.feeLocked")}` : ""}
        </span>
        <input
          className="num"
          type="number"
          min="0"
          step="0.5"
          disabled={feeLocked}
          value={values.feePerHorse}
          onChange={(e) => set("feePerHorse", e.target.value)}
        />
      </label>
      <label className="field" style={{ display: "flex", gap: 8, alignItems: "center" }}>
        <input
          type="checkbox"
          style={{ width: "auto" }}
          checked={values.selfScratchEnabled}
          onChange={(e) => set("selfScratchEnabled", e.target.checked)}
        />
        <span style={{ margin: 0 }}>{t("event.selfScratch")}</span>
      </label>
      {error && <div className="error-inline">{error}</div>}
      <button
        className="btn primary"
        disabled={busy || !valid}
        onClick={async () => {
          setBusy(true);
          setError(null);
          try {
            await onSubmit(values);
          } catch (err) {
            setError(errorMessage(err));
          } finally {
            setBusy(false);
          }
        }}
      >
        {submitLabel}
      </button>
    </div>
  );
}

export type EventsClient = Client;
