CREATE TYPE "public"."draw_status" AS ENUM('nessuno', 'generato', 'pubblicato');--> statement-breakpoint
ALTER TABLE "classes" ADD COLUMN "draw_status" "draw_status" DEFAULT 'nessuno' NOT NULL;--> statement-breakpoint
ALTER TABLE "events" ADD COLUMN "draw_surgery_enabled" boolean DEFAULT false NOT NULL;