CREATE TABLE "stable_members" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"stable_id" uuid NOT NULL,
	"person_id" uuid NOT NULL,
	CONSTRAINT "stable_members_stable_person" UNIQUE("stable_id","person_id")
);
--> statement-breakpoint
ALTER TABLE "events" DROP CONSTRAINT "events_fee_non_negative";--> statement-breakpoint
ALTER TABLE "persons" ADD COLUMN "birth_date" date;--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN "platform_fee_per_horse" numeric(8, 2) DEFAULT '15' NOT NULL;--> statement-breakpoint
ALTER TABLE "classes" ADD COLUMN "max_entries" integer;--> statement-breakpoint
ALTER TABLE "events" ADD COLUMN "platform_fee_per_horse" numeric(8, 2);--> statement-breakpoint
ALTER TABLE "entries" ADD COLUMN "tecnico_name" text;--> statement-breakpoint
ALTER TABLE "stable_members" ADD CONSTRAINT "stable_members_stable_id_stables_id_fk" FOREIGN KEY ("stable_id") REFERENCES "public"."stables"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stable_members" ADD CONSTRAINT "stable_members_person_id_persons_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."persons"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "classes" ADD CONSTRAINT "classes_max_entries_min" CHECK ("classes"."max_entries" is null or "classes"."max_entries" >= 1);--> statement-breakpoint
ALTER TABLE "events" ADD CONSTRAINT "events_fee_non_negative" CHECK ("events"."fee_per_horse" >= 0 and ("events"."platform_fee_per_horse" is null or "events"."platform_fee_per_horse" >= 0));