import { useCallback, useState } from "react";
import { useRegisterSW } from "virtual:pwa-register/react";
import { UpdateBanner, useUpdateChecks } from "@penrunner/ui";
import type { MessageKey } from "../lib/i18n.js";

type T = (key: MessageKey, vars?: Record<string, string | number>) => string;

// BR-83 con la cautela offline-first (BR-81): il copy invita ad aggiornare
// TRA una run e l'altra, mai auto-reload; se la coda di sync non è vuota il
// banner lo dichiara — il lavoro è comunque in IndexedDB (write-ahead) e
// sopravvive all'aggiornamento, che non tocca gli store.

export function UpdatePrompt({ t, pending }: { t: T; pending: number }) {
  const [registration, setRegistration] = useState<
    ServiceWorkerRegistration | undefined
  >(undefined);
  const {
    needRefresh: [needRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisteredSW(_url, r) {
      setRegistration(r);
    },
  });
  const check = useCallback(() => {
    void registration?.update().catch(() => undefined);
  }, [registration]);
  useUpdateChecks(registration ? check : undefined);

  if (!needRefresh) return null;
  return (
    <UpdateBanner
      message={t("update.available")}
      actionLabel={t("update.do")}
      note={pending > 0 ? t("update.pendingNote", { n: pending }) : undefined}
      onUpdate={() => void updateServiceWorker(true)}
    />
  );
}
