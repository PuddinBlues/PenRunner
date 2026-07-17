CREATE TYPE "public"."championship" AS ENUM('debuttanti', 'italiano', 'assoluto', 'facoltative');--> statement-breakpoint
CREATE TYPE "public"."entry_gait" AS ENUM('walk_in', 'trot_in', 'lope_in');--> statement-breakpoint
CREATE TYPE "public"."entry_status" AS ENUM('bozza', 'confermata', 'check_in', 'in_campo', 'completata', 'ritirata', 'assente');--> statement-breakpoint
CREATE TYPE "public"."event_status" AS ENUM('bozza', 'annunciato', 'iscrizioni_aperte', 'iscrizioni_chiuse', 'in_corso', 'concluso');--> statement-breakpoint
CREATE TYPE "public"."event_tier" AS ENUM('regionale', 'nazionale', 'internazionale', 'premium');--> statement-breakpoint
CREATE TYPE "public"."horse_ownership" AS ENUM('di_proprieta', 'non_di_proprieta', 'non_di_proprieta_o_di_proprieta_per_np', 'non_di_proprieta_per_pro_di_proprieta_per_np', 'libera');--> statement-breakpoint
CREATE TYPE "public"."locale" AS ENUM('it', 'en');--> statement-breakpoint
CREATE TYPE "public"."maneuver_type" AS ENUM('rundown', 'rollback', 'stop', 'backup', 'spin', 'circles', 'lead_change', 'figure_8', 'hesitate');--> statement-breakpoint
CREATE TYPE "public"."person_category" AS ENUM('open', 'non_pro', 'youth', 'rookie');--> statement-breakpoint
CREATE TYPE "public"."run_status" AS ENUM('attesa', 'in_inserimento', 'in_attesa_firma', 'validata', 'pubblicata');--> statement-breakpoint
CREATE TYPE "public"."score_card_special" AS ENUM('score_0', 'no_score');--> statement-breakpoint
CREATE TYPE "public"."score_card_status" AS ENUM('in_compilazione', 'firmata', 'sincronizzata', 'validata');--> statement-breakpoint
CREATE TABLE "categories" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"code" text NOT NULL,
	"season" integer NOT NULL,
	"name" text NOT NULL,
	"championship" "championship" NOT NULL,
	"fise_license" text,
	"membership" text,
	"tecnico_federale_required" boolean DEFAULT false NOT NULL,
	"tecnico_note" text,
	"horse_ownership" "horse_ownership" NOT NULL,
	"horse_notes" text,
	"rider_age" jsonb,
	"earnings_cap" jsonb,
	"horse_earnings_cap" jsonb,
	"nrha_final" boolean,
	"restricted" text,
	"notes" text,
	CONSTRAINT "categories_code_season" UNIQUE("code","season")
);
--> statement-breakpoint
CREATE TABLE "pattern_maneuvers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"pattern_id" uuid NOT NULL,
	"position" integer NOT NULL,
	"types" "maneuver_type"[] NOT NULL,
	"label_it" text NOT NULL,
	"label_en" text,
	CONSTRAINT "pattern_maneuvers_pattern_position" UNIQUE("pattern_id","position"),
	CONSTRAINT "pattern_maneuvers_position_min" CHECK ("pattern_maneuvers"."position" >= 1),
	CONSTRAINT "pattern_maneuvers_types_not_empty" CHECK (cardinality("pattern_maneuvers"."types") >= 1)
);
--> statement-breakpoint
CREATE TABLE "patterns" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"code" text NOT NULL,
	"season" integer NOT NULL,
	"name" text NOT NULL,
	"entry_gait" "entry_gait" NOT NULL,
	"trot_in_mandatable" boolean DEFAULT false NOT NULL,
	"entry_start" text,
	"entry_note" text,
	"restricted_to" text[],
	CONSTRAINT "patterns_code_season" UNIQUE("code","season")
);
--> statement-breakpoint
CREATE TABLE "horses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"name" text NOT NULL,
	"microchip" text NOT NULL,
	"ueln" text,
	"competition_license" text,
	"owner_id" uuid NOT NULL,
	"stable_id" uuid
);
--> statement-breakpoint
CREATE TABLE "persons" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"full_name" text NOT NULL,
	"email" text,
	"membership_irha" text,
	"membership_fise" text,
	"category" "person_category",
	"locale" "locale" DEFAULT 'it' NOT NULL,
	"stable_id" uuid
);
--> statement-breakpoint
CREATE TABLE "stables" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"name" text NOT NULL,
	"referent_id" uuid
);
--> statement-breakpoint
CREATE TABLE "classes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"event_id" uuid NOT NULL,
	"category_id" uuid NOT NULL,
	"name" text NOT NULL,
	"pattern_id" uuid NOT NULL,
	"entry_fee" numeric(8, 2) DEFAULT '0' NOT NULL,
	"added_money" numeric(10, 2) DEFAULT '0' NOT NULL,
	"judges_count" integer DEFAULT 1 NOT NULL,
	"trot_in_imposed" boolean DEFAULT false NOT NULL,
	CONSTRAINT "classes_judges_min" CHECK ("classes"."judges_count" >= 1),
	CONSTRAINT "classes_money_non_negative" CHECK ("classes"."entry_fee" >= 0 and "classes"."added_money" >= 0)
);
--> statement-breakpoint
CREATE TABLE "events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"name" text NOT NULL,
	"venue" text NOT NULL,
	"start_date" date NOT NULL,
	"end_date" date NOT NULL,
	"tier" "event_tier" DEFAULT 'regionale' NOT NULL,
	"theme_primary" text,
	"theme_secondary" text,
	"hero_image" text,
	"fee_per_horse" numeric(8, 2) DEFAULT '15' NOT NULL,
	"status" "event_status" DEFAULT 'bozza' NOT NULL,
	"slot_duration_s" integer DEFAULT 270 NOT NULL,
	"drag_every_n_runs" integer DEFAULT 5 NOT NULL,
	"drag_duration_s" integer DEFAULT 420 NOT NULL,
	"self_scratch_enabled" boolean DEFAULT true NOT NULL,
	CONSTRAINT "events_dates_coherent" CHECK ("events"."end_date" >= "events"."start_date"),
	CONSTRAINT "events_fee_non_negative" CHECK ("events"."fee_per_horse" >= 0),
	CONSTRAINT "events_eta_positive" CHECK ("events"."slot_duration_s" > 0 and "events"."drag_every_n_runs" > 0 and "events"."drag_duration_s" >= 0)
);
--> statement-breakpoint
CREATE TABLE "entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"class_id" uuid NOT NULL,
	"horse_id" uuid NOT NULL,
	"rider_id" uuid NOT NULL,
	"draw_number" integer,
	"status" "entry_status" DEFAULT 'bozza' NOT NULL,
	CONSTRAINT "entries_class_horse" UNIQUE("class_id","horse_id"),
	CONSTRAINT "entries_draw_min" CHECK ("entries"."draw_number" is null or "entries"."draw_number" >= 1)
);
--> statement-breakpoint
CREATE TABLE "maneuver_scores" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"score_card_id" uuid NOT NULL,
	"maneuver_id" uuid NOT NULL,
	"quality" numeric(2, 1) DEFAULT '0' NOT NULL,
	"penalty" numeric(4, 1) DEFAULT '0' NOT NULL,
	CONSTRAINT "maneuver_scores_card_maneuver" UNIQUE("score_card_id","maneuver_id"),
	CONSTRAINT "maneuver_scores_quality_range" CHECK ("maneuver_scores"."quality" between -1.5 and 1.5 and mod("maneuver_scores"."quality" * 2, 1) = 0),
	CONSTRAINT "maneuver_scores_penalty_non_negative" CHECK ("maneuver_scores"."penalty" >= 0)
);
--> statement-breakpoint
CREATE TABLE "runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"entry_id" uuid NOT NULL,
	"go_round" integer DEFAULT 1 NOT NULL,
	"status" "run_status" DEFAULT 'attesa' NOT NULL,
	CONSTRAINT "runs_entry_go_round" UNIQUE("entry_id","go_round"),
	CONSTRAINT "runs_go_round_min" CHECK ("runs"."go_round" >= 1)
);
--> statement-breakpoint
CREATE TABLE "score_cards" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"run_id" uuid NOT NULL,
	"judge_id" uuid NOT NULL,
	"run_penalty" numeric(4, 1) DEFAULT '0' NOT NULL,
	"special" "score_card_special",
	"status" "score_card_status" DEFAULT 'in_compilazione' NOT NULL,
	"signed_at" timestamp with time zone,
	CONSTRAINT "score_cards_run_judge" UNIQUE("run_id","judge_id"),
	CONSTRAINT "score_cards_run_penalty_non_negative" CHECK ("score_cards"."run_penalty" >= 0),
	CONSTRAINT "score_cards_signed_has_timestamp" CHECK ("score_cards"."status" = 'in_compilazione' or "score_cards"."signed_at" is not null)
);
--> statement-breakpoint
ALTER TABLE "pattern_maneuvers" ADD CONSTRAINT "pattern_maneuvers_pattern_id_patterns_id_fk" FOREIGN KEY ("pattern_id") REFERENCES "public"."patterns"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "horses" ADD CONSTRAINT "horses_owner_id_persons_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."persons"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "horses" ADD CONSTRAINT "horses_stable_id_stables_id_fk" FOREIGN KEY ("stable_id") REFERENCES "public"."stables"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "persons" ADD CONSTRAINT "persons_stable_id_stables_id_fk" FOREIGN KEY ("stable_id") REFERENCES "public"."stables"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stables" ADD CONSTRAINT "stables_referent_id_persons_id_fk" FOREIGN KEY ("referent_id") REFERENCES "public"."persons"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "classes" ADD CONSTRAINT "classes_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "classes" ADD CONSTRAINT "classes_category_id_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "classes" ADD CONSTRAINT "classes_pattern_id_patterns_id_fk" FOREIGN KEY ("pattern_id") REFERENCES "public"."patterns"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "entries" ADD CONSTRAINT "entries_class_id_classes_id_fk" FOREIGN KEY ("class_id") REFERENCES "public"."classes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "entries" ADD CONSTRAINT "entries_horse_id_horses_id_fk" FOREIGN KEY ("horse_id") REFERENCES "public"."horses"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "entries" ADD CONSTRAINT "entries_rider_id_persons_id_fk" FOREIGN KEY ("rider_id") REFERENCES "public"."persons"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "maneuver_scores" ADD CONSTRAINT "maneuver_scores_score_card_id_score_cards_id_fk" FOREIGN KEY ("score_card_id") REFERENCES "public"."score_cards"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "maneuver_scores" ADD CONSTRAINT "maneuver_scores_maneuver_id_pattern_maneuvers_id_fk" FOREIGN KEY ("maneuver_id") REFERENCES "public"."pattern_maneuvers"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "runs" ADD CONSTRAINT "runs_entry_id_entries_id_fk" FOREIGN KEY ("entry_id") REFERENCES "public"."entries"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "score_cards" ADD CONSTRAINT "score_cards_run_id_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "score_cards" ADD CONSTRAINT "score_cards_judge_id_persons_id_fk" FOREIGN KEY ("judge_id") REFERENCES "public"."persons"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "horses_microchip_unique" ON "horses" USING btree ("microchip");--> statement-breakpoint
CREATE UNIQUE INDEX "persons_email_unique" ON "persons" USING btree (lower("email")) WHERE "persons"."email" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "entries_class_draw_unique" ON "entries" USING btree ("class_id","draw_number") WHERE "entries"."draw_number" is not null;