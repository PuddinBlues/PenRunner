import { sql } from "drizzle-orm";
import {
  check,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { persons } from "./anagrafiche.js";
import { eventRole, users } from "./accounts.js";
import { baseColumns } from "./base.js";
import { classes, events } from "./evento.js";

// Assegnazione event-scoped di giudice/scribe/segreteria. class_id null =
// tutto l'evento. Si DISATTIVA, non si cancella: la sostituzione di un
// giudice non deve toccare le ScoreCard già firmate (che referenziano
// persons e sopravvivono per costruzione).
export const eventRoleAssignments = pgTable(
  "event_role_assignments",
  {
    ...baseColumns,
    eventId: uuid("event_id")
      .notNull()
      .references(() => events.id, { onDelete: "cascade" }),
    personId: uuid("person_id")
      .notNull()
      .references(() => persons.id, { onDelete: "restrict" }),
    role: eventRole("role").notNull(),
    classId: uuid("class_id").references(() => classes.id, {
      onDelete: "cascade",
    }),
    deactivatedAt: timestamp("deactivated_at", { withTimezone: true }),
  },
  (t) => [
    uniqueIndex("event_role_assignments_active_unique")
      .on(
        t.eventId,
        t.personId,
        t.role,
        sql`coalesce(${t.classId}, '00000000-0000-0000-0000-000000000000'::uuid)`,
      )
      .where(sql`${t.deactivatedAt} is null`),
  ],
);

// Invito magic-link per i ruoli operativi: niente account pieno, l'accettazione
// apre una sessione scoped legata all'assegnazione.
export const eventInvites = pgTable(
  "event_invites",
  {
    ...baseColumns,
    assignmentId: uuid("assignment_id")
      .notNull()
      .references(() => eventRoleAssignments.id, { onDelete: "cascade" }),
    email: text("email"),
    tokenHash: text("token_hash").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    acceptedAt: timestamp("accepted_at", { withTimezone: true }),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
  },
  (t) => [uniqueIndex("event_invites_hash_unique").on(t.tokenHash)],
);

// Sessioni server-side (cookie httpOnly, revocabili). Una sessione appartiene
// a uno user (login) oppure a un invito event-scoped, mai a entrambi.
export const sessions = pgTable(
  "sessions",
  {
    ...baseColumns,
    tokenHash: text("token_hash").notNull(),
    userId: uuid("user_id").references(() => users.id, { onDelete: "cascade" }),
    inviteId: uuid("invite_id").references(() => eventInvites.id, {
      onDelete: "cascade",
    }),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
  },
  (t) => [
    uniqueIndex("sessions_hash_unique").on(t.tokenHash),
    check(
      "sessions_exactly_one_principal",
      sql`(${t.userId} is null) <> (${t.inviteId} is null)`,
    ),
  ],
);

// BR-71: nessun potere silenzioso. Struttura riusabile: allo step 5 le
// correzioni score (BR-40/41) passeranno da qui con le stesse colonne.
// L'immutabilità (no UPDATE/DELETE) è imposta da un trigger in migrazione.
export const auditLog = pgTable("audit_log", {
  id: uuid("id").primaryKey().defaultRandom(),
  occurredAt: timestamp("occurred_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  actorUserId: uuid("actor_user_id").references(() => users.id, {
    onDelete: "set null",
  }),
  action: text("action").notNull(), // es. "organization.vetting.approve"
  entityType: text("entity_type").notNull(),
  entityId: uuid("entity_id"),
  before: jsonb("before"),
  after: jsonb("after"),
  note: text("note"),
});
