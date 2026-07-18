CREATE TYPE "public"."score_card_source" AS ENUM('digital', 'manual_backfill');--> statement-breakpoint
ALTER TABLE "score_cards" DROP CONSTRAINT "score_cards_signed_has_timestamp";--> statement-breakpoint
ALTER TABLE "score_cards" ALTER COLUMN "status" SET DATA TYPE text;--> statement-breakpoint
ALTER TABLE "score_cards" ALTER COLUMN "status" SET DEFAULT 'in_compilazione'::text;--> statement-breakpoint
DROP TYPE "public"."score_card_status";--> statement-breakpoint
CREATE TYPE "public"."score_card_status" AS ENUM('in_compilazione', 'chiusa', 'firmata', 'validata');--> statement-breakpoint
ALTER TABLE "score_cards" ALTER COLUMN "status" SET DEFAULT 'in_compilazione'::"public"."score_card_status";--> statement-breakpoint
ALTER TABLE "score_cards" ALTER COLUMN "status" SET DATA TYPE "public"."score_card_status" USING "status"::"public"."score_card_status";--> statement-breakpoint
ALTER TABLE "runs" ADD COLUMN "started_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "runs" ADD COLUMN "review_held_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "runs" ADD COLUMN "review_note" text;--> statement-breakpoint
ALTER TABLE "score_cards" ADD COLUMN "client_card_id" uuid;--> statement-breakpoint
ALTER TABLE "score_cards" ADD COLUMN "source" "score_card_source" DEFAULT 'digital' NOT NULL;--> statement-breakpoint
ALTER TABLE "score_cards" ADD COLUMN "paper_ref" text;--> statement-breakpoint
ALTER TABLE "score_cards" ADD COLUMN "engine_version" text;--> statement-breakpoint
ALTER TABLE "score_cards" ADD COLUMN "engine_mismatch" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "score_cards" ADD COLUMN "closed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "score_cards" ADD COLUMN "signature_stroke" text;--> statement-breakpoint
ALTER TABLE "score_cards" ADD COLUMN "server_received_at" timestamp with time zone;--> statement-breakpoint
CREATE UNIQUE INDEX "score_cards_client_card_id_unique" ON "score_cards" USING btree ("client_card_id") WHERE "score_cards"."client_card_id" is not null;--> statement-breakpoint
ALTER TABLE "score_cards" ADD CONSTRAINT "score_cards_signature_source" CHECK (("score_cards"."source" = 'digital' and "score_cards"."paper_ref" is null and ("score_cards"."status" in ('in_compilazione', 'chiusa') or "score_cards"."signed_at" is not null))
       or ("score_cards"."source" = 'manual_backfill' and "score_cards"."paper_ref" is not null and "score_cards"."signed_at" is null and "score_cards"."signature_stroke" is null));--> statement-breakpoint
-- righe storiche: una carta oltre la compilazione era stata chiusa di fatto
UPDATE "score_cards" SET "closed_at" = COALESCE("closed_at", "signed_at", now()) WHERE "status" <> 'in_compilazione';--> statement-breakpoint
ALTER TABLE "score_cards" ADD CONSTRAINT "score_cards_closed_has_timestamp" CHECK ("score_cards"."status" = 'in_compilazione' or "score_cards"."closed_at" is not null);