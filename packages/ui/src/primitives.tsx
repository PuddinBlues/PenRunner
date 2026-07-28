import { useState, type ReactNode } from "react";

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

/**
 * Campo password con occhio mostra/nascondi. Le etichette (aria-label del
 * toggle) arrivano come props: nessun accoppiamento con l'i18n delle app.
 */
export function PasswordInput({
  value,
  onChange,
  autoComplete,
  showLabel,
  hideLabel,
}: {
  value: string;
  onChange: (value: string) => void;
  autoComplete?: string | undefined;
  showLabel: string;
  hideLabel: string;
}) {
  const [visible, setVisible] = useState(false);
  return (
    <span style={{ position: "relative", display: "block" }}>
      <input
        type={visible ? "text" : "password"}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        autoComplete={autoComplete}
        style={{ width: "100%", paddingRight: 40, boxSizing: "border-box" }}
      />
      <button
        type="button"
        aria-label={visible ? hideLabel : showLabel}
        title={visible ? hideLabel : showLabel}
        onClick={() => setVisible((v) => !v)}
        style={{
          position: "absolute",
          right: 4,
          top: "50%",
          transform: "translateY(-50%)",
          border: "none",
          background: "transparent",
          padding: 6,
          cursor: "pointer",
          color: "#64748B",
          display: "inline-flex",
        }}
      >
        {visible ? (
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M17.94 17.94A10.5 10.5 0 0 1 12 20c-7 0-10-8-10-8a17.6 17.6 0 0 1 4.06-5.94" />
            <path d="M9.9 4.24A9.8 9.8 0 0 1 12 4c7 0 10 8 10 8a17.7 17.7 0 0 1-2.16 3.19" />
            <line x1="2" y1="2" x2="22" y2="22" />
            <path d="M14.12 14.12A3 3 0 1 1 9.88 9.88" />
          </svg>
        ) : (
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M2 12s3-8 10-8 10 8 10 8-3 8-10 8-10-8-10-8Z" />
            <circle cx="12" cy="12" r="3" />
          </svg>
        )}
      </button>
    </span>
  );
}

