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
    console.log(`[mail] a ${message.to}: ${message.subject}`);
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
