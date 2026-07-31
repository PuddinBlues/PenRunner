ALTER TABLE "classes" ADD COLUMN "draw_published_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "classes" ADD COLUMN "draw_republished_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "events" ADD COLUMN "draw_distance_target" integer DEFAULT 10 NOT NULL;--> statement-breakpoint
ALTER TABLE "events" ADD COLUMN "entry_change_cutoff" text DEFAULT '18:00' NOT NULL;--> statement-breakpoint
ALTER TABLE "events" ADD CONSTRAINT "events_draw_distance_min" CHECK ("events"."draw_distance_target" >= 8);