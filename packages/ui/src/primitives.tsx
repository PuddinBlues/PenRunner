import type { ReactNode } from "react";

// ---------------------------------------------------------------------------
// Primitivi condivisi del registro chiaro (estratti alla terza SPA — prima
// erano copie). Nessun accoppiamento con l'i18n delle app: le etichette
// arrivano come props.
// ---------------------------------------------------------------------------

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
 * "sei sicuro?" a vuoto. Da usare solo dove l'effetto non è ovvio dal bottone.
 */
export function Confirm({
  title,
  body,
  confirmLabel,
  cancelLabel,
  onConfirm,
  onCancel,
}: {
  title: string;
  body: ReactNode;
  confirmLabel: string;
  cancelLabel: string;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="modal-backdrop" onClick={onCancel}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2>{title}</h2>
        <div style={{ margin: 0 }}>{body}</div>
        <div className="actions">
          <button className="btn" onClick={onCancel}>
            {cancelLabel}
          </button>
          <button className="btn primary" onClick={onConfirm}>
            {confirmLabel}
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
