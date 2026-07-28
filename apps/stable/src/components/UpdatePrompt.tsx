import { useCallback, useState } from "react";
import { useRegisterSW } from "virtual:pwa-register/react";
import { UpdateBanner, useUpdateChecks } from "@penrunner/ui";
import type { T } from "../lib/i18n.js";

// BR-83: registrazione esplicita del service worker in modalità "prompt".
// Check al ritorno in primo piano e ogni 60'; banner + tap, mai auto-reload.

export function UpdatePrompt({ t }: { t: T }) {
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
      onUpdate={() => void updateServiceWorker(true)}
    />
  );
}
