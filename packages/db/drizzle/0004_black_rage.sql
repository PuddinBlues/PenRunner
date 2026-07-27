-- Migrazione dati: le appartenenze 1-N esistenti diventano membership M2M,
-- poi la colonna denormalizzata sparisce (una sola fonte di verità).
INSERT INTO "stable_members" ("stable_id", "person_id")
SELECT "stable_id", "id" FROM "persons" WHERE "stable_id" IS NOT NULL
ON CONFLICT DO NOTHING;--> statement-breakpoint
ALTER TABLE "persons" DROP CONSTRAINT "persons_stable_id_stables_id_fk";
--> statement-breakpoint
ALTER TABLE "persons" DROP COLUMN "stable_id";
