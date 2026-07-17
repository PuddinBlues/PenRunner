import { schema, type Db } from "@penrunner/db";

// BR-71: ogni azione amministrativa lascia una riga immutabile. La stessa
// struttura (attore, azione, prima/dopo) traccerà le correzioni score
// BR-40/41 allo step scoring.
export interface AuditEntry {
  actorUserId: string | null;
  action: string; // es. "organization.vetting.approve"
  entityType: string;
  entityId?: string;
  before?: unknown;
  after?: unknown;
  note?: string;
}

type DbOrTx = Db | Parameters<Parameters<Db["transaction"]>[0]>[0];

export async function recordAudit(db: DbOrTx, entry: AuditEntry) {
  await db.insert(schema.auditLog).values({
    actorUserId: entry.actorUserId,
    action: entry.action,
    entityType: entry.entityType,
    entityId: entry.entityId ?? null,
    before: entry.before ?? null,
    after: entry.after ?? null,
    note: entry.note ?? null,
  });
}
