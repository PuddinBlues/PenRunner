import type { ReactNode } from "react";
import type { T } from "../lib/i18n.js";

export function Badge({
  tone,
  children,
}: {
  tone?: "green" | "warn" | "danger" | "info" | undefined;
  children: ReactNode;
}) {
  return <span className={`badge ${tone ?? ""}`}>{children}</span>;
}

export function Banner({
  tone,
  children,
}: {
  tone: "warn" | "info" | "danger";
  children: ReactNode;
}) {
  return <div className={`banner ${tone}`}>{children}</div>;
}

/**
 * Conferma informativa (non cerimoniale): spiega l'effetto, non chiede
 * "sei sicuro?" a vuoto. Usata solo dove l'effetto non è ovvio dal bottone.
 */
export function Confirm({
  t,
  title,
  body,
  onConfirm,
  onCancel,
}: {
  t: T;
  title: string;
  body: string;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="modal-backdrop" onClick={onCancel}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2>{title}</h2>
        <p style={{ margin: 0 }}>{body}</p>
        <div className="actions">
          <button className="btn" onClick={onCancel}>
            {t("common.cancel")}
          </button>
          <button className="btn primary" onClick={onConfirm}>
            {t("common.confirm")}
          </button>
        </div>
      </div>
    </div>
  );
}

/** Stato vuoto che indica il passo successivo (BR-80). */
export function Empty({ children }: { children: ReactNode }) {
  return <div className="empty">{children}</div>;
}

export function errorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  return String(err);
}
