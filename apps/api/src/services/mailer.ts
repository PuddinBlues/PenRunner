// L'SMTP reale si deciderà con le notifiche MVP; l'interfaccia isola la scelta.
export interface MailMessage {
  to: string;
  subject: string;
  /** testo plain: SEMPRE presente (fallback leggibile a HTML spento) */
  body: string;
  /** variante HTML brandizzata (services/mailtemplate.ts) */
  html?: string;
}

export interface Mailer {
  send(message: MailMessage): Promise<void>;
}

/** Mailer di sviluppo: logga e trattiene i messaggi (usato anche dai test). */
export class DevMailer implements Mailer {
  readonly sent: MailMessage[] = [];

  async send(message: MailMessage): Promise<void> {
    this.sent.push(message);
    // In sviluppo il corpo VA a video: contiene il token (verifica email,
    // inviti) e senza non si completa il flusso self-serve dal browser.
    console.log(`[mail] a ${message.to}: ${message.subject}\n${message.body}`);
  }

  lastTo(to: string): MailMessage | undefined {
    return [...this.sent].reverse().find((m) => m.to === to);
  }
}

/** Estrae il token da un corpo email di sviluppo (riga "token: <valore>"). */
export function extractToken(message: MailMessage): string {
  const match = message.body.match(/token: (\S+)/);
  if (!match) throw new Error("Nessun token nel messaggio");
  return match[1]!;
}

/**
 * Mailer SMTP generico via nodemailer (provider-neutro). Timeout stretti:
 * il collaudo staging ha trovato l'egress SMTP bloccato dall'host (Railway)
 * — il sintomo era un hang di oltre 2 minuti sulla register. Mai più: si
 * fallisce in ~10 s con un errore che dice dove guardare.
 */
export class SmtpMailer implements Mailer {
  private readonly transportPromise: Promise<
    import("nodemailer").Transporter
  >;

  constructor(
    private readonly from: string,
    private readonly opts: { host: string; port: number; user: string; pass: string },
  ) {
    this.transportPromise = import("nodemailer").then((nodemailer) =>
      nodemailer.createTransport({
        host: opts.host,
        port: opts.port,
        secure: opts.port === 465,
        auth: { user: opts.user, pass: opts.pass },
        connectionTimeout: 10_000,
        greetingTimeout: 10_000,
        socketTimeout: 10_000,
      }),
    );
  }

  async send(message: MailMessage): Promise<void> {
    const transport = await this.transportPromise;
    try {
      await transport.sendMail({
        from: this.from,
        to: message.to,
        subject: message.subject,
        text: message.body,
        ...(message.html ? { html: message.html } : {}),
      });
    } catch (err) {
      throw new Error(
        `Invio SMTP fallito verso ${this.opts.host}:${this.opts.port} — ` +
          "verifica le SMTP_* e che l'host di deploy consenta l'egress SMTP " +
          "(alcuni PaaS bloccano 465/587: in quel caso usa MAILER=resend, API HTTP). " +
          `Causa: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }
}

/**
 * Mailer via API HTTP di Resend (porta 443: mai bloccata dai PaaS).
 * Fetch nativo, zero dipendenze; timeout 10 s.
 */
export class ResendMailer implements Mailer {
  constructor(
    private readonly from: string,
    private readonly apiKey: string,
  ) {}

  async send(message: MailMessage): Promise<void> {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        authorization: `Bearer ${this.apiKey}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        from: this.from,
        to: message.to,
        subject: message.subject,
        text: message.body,
        ...(message.html ? { html: message.html } : {}),
      }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      throw new Error(
        `Resend API ${res.status}: invio a ${message.to} fallito — ` +
          `verifica RESEND_API_KEY e il dominio verificato di MAIL_FROM. ${detail}`.trim(),
      );
    }
  }
}

/**
 * Selezione da env: MAILER=dev (default) | resend | smtp. Le env mancanti
 * fanno fallire l'AVVIO con l'elenco esplicito: meglio che scoprire in gara
 * che le email non partono.
 */
export function makeMailer(env: NodeJS.ProcessEnv = process.env): Mailer {
  const mode = env.MAILER ?? "dev";
  if (mode === "dev") return new DevMailer();
  if (mode === "resend") {
    const missing = ["RESEND_API_KEY", "MAIL_FROM"].filter((k) => !env[k]);
    if (missing.length > 0) {
      throw new Error(`MAILER=resend: mancano ${missing.join(", ")}`);
    }
    return new ResendMailer(env.MAIL_FROM!, env.RESEND_API_KEY!);
  }
  if (mode !== "smtp") {
    throw new Error(`MAILER sconosciuto: "${mode}" (valori: dev, resend, smtp)`);
  }
  const missing = ["SMTP_HOST", "SMTP_USER", "SMTP_PASS", "MAIL_FROM"].filter(
    (k) => !env[k],
  );
  if (missing.length > 0) {
    throw new Error(`MAILER=smtp: mancano ${missing.join(", ")}`);
  }
  return new SmtpMailer(env.MAIL_FROM!, {
    host: env.SMTP_HOST!,
    port: Number(env.SMTP_PORT ?? 465),
    user: env.SMTP_USER!,
    pass: env.SMTP_PASS!,
  });
}
