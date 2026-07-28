import { sql } from "drizzle-orm";
import {
  boolean,
  date,
  pgTable,
  text,
  unique,
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
    // BR-84: nome strutturato. firstName può essere vuoto SOLO per i profili
    // migrati dal backfill a token singolo (sempre flaggati in revisione);
    // i form richiedono entrambi. La resa è DERIVATA (displayName /
    // officialName), mai memorizzata: full_name non esiste più.
    firstName: text("first_name").notNull(),
    lastName: text("last_name").notNull(),
    // true dove lo split euristico del backfill era incerto (1 o ≥3 token):
    // badge "Controlla il nome" nel roster, si spegne al primo salvataggio.
    nameNeedsReview: boolean("name_needs_review").notNull().default(false),
    email: text("email"), // chiave di identità quando presente (claim account)
    membershipIrha: text("membership_irha"),
    membershipFise: text("membership_fise"),
    category: personCategory("category"), // qualifica sintetica del profilo
    locale: locale("locale").notNull().default("it"), // BR-62
    // Serve alla valutazione dei limiti d'età (BR-15); se manca, l'iscrizione
    // a una classe con limite produce un avviso, mai un blocco (BR-18).
    birthDate: date("birth_date"),
  },
  (t) => [
    uniqueIndex("persons_email_unique")
      .on(sql`lower(${t.email})`)
      .where(sql`${t.email} is not null`),
  ],
);

// Roster cavalieri: membership molti-a-molti (un cavaliere indipendente può
// stare nei roster di più scuderie). L'appartenenza esclusiva non esiste;
// "stabled at" resta invece 1-N sul cavallo (sta in un posto alla volta).
export const stableMembers = pgTable(
  "stable_members",
  {
    ...baseColumns,
    stableId: uuid("stable_id")
      .notNull()
      .references(() => stables.id, { onDelete: "cascade" }),
    personId: uuid("person_id")
      .notNull()
      .references(() => persons.id, { onDelete: "cascade" }),
  },
  (t) => [unique("stable_members_stable_person").on(t.stableId, t.personId)],
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
