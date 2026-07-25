// L'SMTP reale si deciderà con le notifiche MVP; l'interfaccia isola la scelta.
export interface MailMessage {
  to: string;
  subject: string;
  body: string;
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
 * Mailer di produzione: SMTP generico via nodemailer — con Resend:
 * SMTP_HOST=smtp.resend.com, SMTP_USER=resend, SMTP_PASS=<api key>.
 * Provider-neutro: cambiare fornitore è solo un cambio di env.
 */
export class SmtpMailer implements Mailer {
  private readonly transportPromise: Promise<
    import("nodemailer").Transporter
  >;

  constructor(
    private readonly from: string,
    opts: { host: string; port: number; user: string; pass: string },
  ) {
    this.transportPromise = import("nodemailer").then((nodemailer) =>
      nodemailer.createTransport({
        host: opts.host,
        port: opts.port,
        secure: opts.port === 465,
        auth: { user: opts.user, pass: opts.pass },
      }),
    );
  }

  async send(message: MailMessage): Promise<void> {
    const transport = await this.transportPromise;
    await transport.sendMail({
      from: this.from,
      to: message.to,
      subject: message.subject,
      text: message.body,
    });
  }
}

/**
 * Selezione da env: MAILER=dev (default) | smtp. In smtp servono
 * SMTP_HOST/SMTP_USER/SMTP_PASS/MAIL_FROM (SMTP_PORT default 465):
 * meglio fallire all'avvio che scoprire in gara che le email non partono.
 */
export function makeMailer(env: NodeJS.ProcessEnv = process.env): Mailer {
  const mode = env.MAILER ?? "dev";
  if (mode === "dev") return new DevMailer();
  if (mode !== "smtp") {
    throw new Error(`MAILER sconosciuto: "${mode}" (valori: dev, smtp)`);
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
