import { sql } from "drizzle-orm";
import {
  pgTable,
  text,
  uniqueIndex,
  uuid,
  type AnyPgColumn,
} from "drizzle-orm/pg-core";
import { baseColumns } from "./base.js";
import { locale, personCategory } from "./enums.js";

// ---------------------------------------------------------------------------
// Anagrafiche: chi e cosa partecipa. Modello identità della spec: il cavallo
// si deduplica sul microchip, la persona su email + tesseramenti. "Primo
// creatore, gli altri collegano".
// ---------------------------------------------------------------------------

export const stables = pgTable("stables", {
  ...baseColumns,
  name: text("name").notNull(),
  referentId: uuid("referent_id").references((): AnyPgColumn => persons.id, {
    onDelete: "set null",
  }),
});

export const persons = pgTable(
  "persons",
  {
    ...baseColumns,
    fullName: text("full_name").notNull(),
    email: text("email"), // chiave di identità quando presente (claim account)
    membershipIrha: text("membership_irha"),
    membershipFise: text("membership_fise"),
    category: personCategory("category"), // qualifica sintetica del profilo
    locale: locale("locale").notNull().default("it"), // BR-62
    // Scuderia principale (1-N come da data model). La relazione molti-a-molti
    // per cavalieri multi-scuderia (edge della spec) arriverà con l'iscrizione
    // massiva, quando servirà davvero.
    stableId: uuid("stable_id").references(() => stables.id, {
      onDelete: "set null",
    }),
  },
  (t) => [
    uniqueIndex("persons_email_unique")
      .on(sql`lower(${t.email})`)
      .where(sql`${t.email} is not null`),
  ],
);

export const horses = pgTable(
  "horses",
  {
    ...baseColumns,
    name: text("name").notNull(), // nome di gara
    // Chiave naturale di deduplicazione, verificata fisicamente al check-in.
    microchip: text("microchip").notNull(),
    ueln: text("ueln"),
    competitionLicense: text("competition_license"),
    ownerId: uuid("owner_id")
      .notNull()
      .references(() => persons.id, { onDelete: "restrict" }),
    stableId: uuid("stable_id").references(() => stables.id, {
      onDelete: "set null",
    }),
  },
  (t) => [uniqueIndex("horses_microchip_unique").on(t.microchip)],
);
