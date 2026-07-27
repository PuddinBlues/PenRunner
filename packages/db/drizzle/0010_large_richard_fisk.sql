ALTER TABLE "runs" ADD COLUMN "review_position" integer;--> statement-breakpoint
ALTER TABLE "runs" ADD COLUMN "review_source" text;--> statement-breakpoint
ALTER TABLE "runs" ADD CONSTRAINT "runs_review_source_valid" CHECK ("runs"."review_source" is null or "runs"."review_source" in ('giudice', 'sistema'));