-- BR-84: nome strutturato su persons. full_name viene ELIMINATA (la resa è
-- derivata: displayName/officialName). Backfill euristico: split al PRIMO
-- spazio (nome = primo token, resto = cognome — le particelle "De/Di/Della"
-- restano nel cognome); 1 o >=3 token → name_needs_review = true (badge
-- "Controlla il nome" nel roster, si spegne al primo salvataggio).
ALTER TABLE "persons" ADD COLUMN "first_name" text;--> statement-breakpoint
ALTER TABLE "persons" ADD COLUMN "last_name" text;--> statement-breakpoint
ALTER TABLE "persons" ADD COLUMN "name_needs_review" boolean DEFAULT false NOT NULL;--> statement-breakpoint
UPDATE "persons" SET
  "first_name" = CASE
    WHEN position(' ' in btrim("full_name")) = 0 THEN ''
    ELSE split_part(btrim("full_name"), ' ', 1)
  END,
  "last_name" = CASE
    WHEN position(' ' in btrim("full_name")) = 0 THEN btrim("full_name")
    ELSE btrim(substring(btrim("full_name") from position(' ' in btrim("full_name")) + 1))
  END,
  "name_needs_review" = (array_length(regexp_split_to_array(btrim("full_name"), '\s+'), 1) IS DISTINCT FROM 2);--> statement-breakpoint
ALTER TABLE "persons" ALTER COLUMN "first_name" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "persons" ALTER COLUMN "last_name" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "persons" DROP COLUMN "full_name";