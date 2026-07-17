import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  pgEnum,
  pgTable,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { persons } from "./anagrafiche.js";
import { baseColumns } from "./base.js";

// ---------------------------------------------------------------------------
// Identità di accesso e autorizzazione. Principio: account ≠ anagrafica.
// `users` è l'identità con cui si entra; `persons` resta l'anagrafica, che può
// esistere senza account (profilo creato da una scuderia, rivendicabile).
// Rider/owner/referente NON sono ruoli memorizzati: sono fatti dei dati
// (entries.rider_id, horses.owner_id, stables.referent_id).
// ---------------------------------------------------------------------------

export const authTokenPurpose = pgEnum("auth_token_purpose", [
  "email_verification",
  "password_reset",
]);

export const vettingStatus = pgEnum("vetting_status", [
  "in_verifica",
  "verificata",
  "respinta",
]);

export const organizationRole = pgEnum("organization_role", [
  "titolare",
  "segreteria",
]);

// Ruoli operativi assegnati nel contesto di un evento (matrice della spec).
export const eventRole = pgEnum("event_role", [
  "giudice",
  "scribe",
  "segreteria",
]);

export const users = pgTable(
  "users",
  {
    ...baseColumns,
    email: text("email").notNull(),
    passwordHash: text("password_hash").notNull(),
    // Il claim si conclude solo dopo la verifica dell'email: prima di allora
    // person_id resta null (nessun profilo collegato o creato).
    personId: uuid("person_id").references(() => persons.id, {
      onDelete: "restrict",
    }),
    emailVerifiedAt: timestamp("email_verified_at", { withTimezone: true }),
    // BR-70: staff PenRunner, fuori dalla matrice pubblica. Proprietà
    // dell'account, non dell'anagrafica. Nessun bypass sulle capacità di gara.
    platformAdmin: boolean("platform_admin").notNull().default(false),
    suspendedAt: timestamp("suspended_at", { withTimezone: true }),
    suspendedReason: text("suspended_reason"),
  },
  (t) => [
    uniqueIndex("users_email_unique").on(sql`lower(${t.email})`),
    uniqueIndex("users_person_unique")
      .on(t.personId)
      .where(sql`${t.personId} is not null`),
  ],
);

export const authTokens = pgTable(
  "auth_tokens",
  {
    ...baseColumns,
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    purpose: authTokenPurpose("purpose").notNull(),
    tokenHash: text("token_hash").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    consumedAt: timestamp("consumed_at", { withTimezone: true }),
  },
  (t) => [uniqueIndex("auth_tokens_hash_unique").on(t.tokenHash)],
);

// Il club organizzatore. Il vetting (decisione ratificata: organizzatori
// verificati manualmente in MVP) vive qui: è il club a essere verificato,
// le persone ne ereditano le capacità tramite la membership.
export const organizations = pgTable(
  "organizations",
  {
    ...baseColumns,
    name: text("name").notNull(),
    affiliationCode: text("affiliation_code"), // affiliazione IRHA/FISE dichiarata
    contactEmail: text("contact_email"),
    contactPhone: text("contact_phone"),
    logoUrl: text("logo_url"),
    iban: text("iban"),
    vettingStatus: vettingStatus("vetting_status")
      .notNull()
      .default("in_verifica"),
    vettingNote: text("vetting_note"),
    verifiedAt: timestamp("verified_at", { withTimezone: true }),
    verifiedBy: uuid("verified_by").references(() => users.id, {
      onDelete: "set null",
    }),
  },
  (t) => [
    // La spec impone il rifiuto motivato, mai lasciato in sospeso.
    check(
      "organizations_rejection_motivated",
      sql`${t.vettingStatus} <> 'respinta' or ${t.vettingNote} is not null`,
    ),
  ],
);

export const organizationMembers = pgTable(
  "organization_members",
  {
    ...baseColumns,
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    personId: uuid("person_id")
      .notNull()
      .references(() => persons.id, { onDelete: "restrict" }),
    role: organizationRole("role").notNull(),
  },
  (t) => [
    unique("organization_members_org_person").on(t.organizationId, t.personId),
  ],
);

