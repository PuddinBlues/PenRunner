// ---------------------------------------------------------------------------
// Template unico delle email transazionali: header fondo notte, azione in
// verde sella, wordmark con SLOT LOGO pronto (env LOGO_URL; finché gli SVG
// non arrivano: wordmark testuale). Layout tabellare con stili inline — i
// client email veri (Outlook incluso) non perdonano — e SEMPRE accompagnato
// dal testo plain (il fallback resta leggibile a HTML spento).
// ---------------------------------------------------------------------------

const BRAND_DARK = "#0B1120";
const BRAND_ACCENT = "#15803D";

export type MailLocale = "it" | "en";

export interface MailContent {
  /** riga di saluto/contesto, già localizzata */
  heading: string;
  /** paragrafi del corpo, già localizzati */
  paragraphs: string[];
  /** bottone d'azione (via principale) */
  cta?: { label: string; url: string };
  /** codice breve da mostrare grande (BR-82, per l'altro dispositivo) */
  code?: string;
  /** righe di fallback testuale (es. "token: X") — SEMPRE anche nel plain */
  fallbackLines?: string[];
}

function esc(s: string): string {
  return s
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

export function renderMail(
  locale: MailLocale,
  content: MailContent,
): { text: string; html: string } {
  const footer =
    locale === "it"
      ? "PenRunner — il reining, in diretta. Email automatica: non rispondere."
      : "PenRunner — reining, live. Automated email: please do not reply.";
  const logo = process.env.LOGO_URL
    ? `<img src="${esc(process.env.LOGO_URL)}" alt="PenRunner" height="28" style="display:block" />`
    : `<span style="font-size:18px;font-weight:700;color:#ffffff;letter-spacing:-0.02em;">PenRunner</span>`;

  const text = [
    content.heading,
    "",
    ...content.paragraphs,
    ...(content.cta ? ["", `${content.cta.label}: ${content.cta.url}`] : []),
    ...(content.code ? ["", `${locale === "it" ? "Codice" : "Code"}: ${content.code}`] : []),
    ...(content.fallbackLines?.length ? ["", ...content.fallbackLines] : []),
    "",
    footer,
  ].join("\n");

  const html = `<!doctype html>
<html><body style="margin:0;padding:0;background:#F1F5F9;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F1F5F9;padding:24px 0;">
<tr><td align="center">
<table role="presentation" width="480" cellpadding="0" cellspacing="0" style="max-width:480px;width:100%;background:#ffffff;border-radius:8px;overflow:hidden;font-family:Inter,Arial,sans-serif;">
  <tr><td style="background:${BRAND_DARK};padding:18px 28px;">${logo}</td></tr>
  <tr><td style="padding:28px;">
    <p style="margin:0 0 12px;font-size:17px;font-weight:700;color:#0F172A;">${esc(content.heading)}</p>
    ${content.paragraphs
      .map(
        (p) =>
          `<p style="margin:0 0 12px;font-size:14px;line-height:1.5;color:#334155;">${esc(p)}</p>`,
      )
      .join("\n    ")}
    ${
      content.cta
        ? `<p style="margin:20px 0;"><a href="${esc(content.cta.url)}" style="background:${BRAND_ACCENT};color:#ffffff;text-decoration:none;font-weight:600;font-size:14px;padding:12px 22px;border-radius:8px;display:inline-block;">${esc(content.cta.label)}</a></p>`
        : ""
    }
    ${
      content.code
        ? `<p style="margin:20px 0;font-size:28px;font-weight:800;letter-spacing:0.25em;color:#0F172A;font-variant-numeric:tabular-nums;">${esc(content.code)}</p>`
        : ""
    }
    ${
      content.fallbackLines?.length
        ? `<p style="margin:16px 0 0;font-size:12px;color:#94A3B8;word-break:break-all;">${content.fallbackLines.map(esc).join("<br/>")}</p>`
        : ""
    }
  </td></tr>
  <tr><td style="padding:16px 28px;border-top:0.5px solid #CBD5E1;font-size:12px;color:#94A3B8;">${esc(footer)}</td></tr>
</table>
</td></tr></table>
</body></html>`;

  return { text, html };
}
