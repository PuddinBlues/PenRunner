import { useEffect, useState } from "react";
import { navigate } from "../App.js";
import { ClassesManager } from "../components/ClassesManager.js";
import { EventForm } from "../components/EventForm.js";
import { SettingsPanel } from "../components/SettingsPanel.js";
import { Banner, errorMessage } from "../components/Ui.js";
import type { Client } from "../lib/api.js";
import type { T } from "../lib/i18n.js";

type EventDetail = Awaited<ReturnType<Client["events"]["get"]["query"]>>;

/**
 * Wizard in tre passi (BR-80: guidato, ogni passo dice cosa succede dopo).
 * Il passo 1 crea l'evento in BOZZA — anche con organizzazione in verifica.
 */
export function EventWizard({ t, client }: { t: T; client: Client }) {
  const [step, setStep] = useState(1);
  const [eventId, setEventId] = useState<string | null>(null);
  const [event, setEvent] = useState<EventDetail | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (eventId && step === 3) {
      client.events.get
        .query({ eventId })
        .then(setEvent)
        .catch((err) => setError(errorMessage(err)));
    }
  }, [client, eventId, step]);

  return (
    <>
      <h1>{t("wizard.title")}</h1>
      <div className="steps">
        {[1, 2, 3].map((n) => (
          <span
            key={n}
            className={`step ${step === n ? "active" : ""} ${step > n ? "done" : ""}`}
          >
            {t(n === 1 ? "wizard.step1" : n === 2 ? "wizard.step2" : "wizard.step3")}
          </span>
        ))}
      </div>
      {error && <Banner tone="danger">{t("app.error", { msg: error })}</Banner>}

      {step === 1 && (
        <div className="card" style={{ maxWidth: 640 }}>
          <EventForm
            t={t}
            submitLabel={t("wizard.next")}
            onSubmit={async (values) => {
              // Serve l'organizzazione dell'utente (titolare).
              const orgs = await client.org.mine.query();
              const org = orgs.find((o) => o.role === "titolare") ?? orgs[0];
              if (!org) throw new Error(t("org.createBody"));
              const created = await client.events.create.mutate({
                organizationId: org.organizationId,
                name: values.name,
                venue: values.venue,
                startDate: values.startDate,
                endDate: values.endDate,
                tier: values.tier,
                feePerHorse: values.feePerHorse,
                selfScratchEnabled: values.selfScratchEnabled,
              });
              setEventId(created.eventId);
              setStep(2);
            }}
          />
        </div>
      )}

      {step === 2 && eventId && (
        <div className="card">
          <h2>{t("classes.title")}</h2>
          <p className="hint">{t("wizard.eventCreated")}</p>
          <ClassesManager t={t} client={client} eventId={eventId} />
          <div style={{ marginTop: 16 }}>
            <button className="btn primary" onClick={() => setStep(3)}>
              {t("wizard.next")}
            </button>
          </div>
        </div>
      )}

      {step === 3 && eventId && (
        <>
          {event ? (
            <SettingsPanel
              t={t}
              client={client}
              event={event}
              onSaved={async () => {
                setEvent(await client.events.get.query({ eventId }));
              }}
            />
          ) : (
            <p className="muted">{t("app.loading")}</p>
          )}
          <button
            className="btn primary"
            onClick={() => navigate(`/event/${eventId}`)}
          >
            {t("wizard.done")}
          </button>
        </>
      )}
    </>
  );
}
