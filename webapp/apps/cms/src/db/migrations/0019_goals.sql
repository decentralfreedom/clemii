ALTER TYPE "public"."audit_action" ADD VALUE 'goal.proposed';--> statement-breakpoint
ALTER TYPE "public"."audit_action" ADD VALUE 'goal.created';--> statement-breakpoint
ALTER TYPE "public"."audit_action" ADD VALUE 'goal.approved';--> statement-breakpoint
ALTER TYPE "public"."audit_action" ADD VALUE 'goal.archived';--> statement-breakpoint
ALTER TYPE "public"."audit_action" ADD VALUE 'goal.checked_in';--> statement-breakpoint
CREATE TABLE "goal_key_results" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"objective_id" uuid NOT NULL,
	"position" integer NOT NULL,
	"title" text NOT NULL,
	"kind" text NOT NULL,
	"metric" text,
	"scope" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"target" double precision NOT NULL,
	"baseline" double precision,
	"manual_value" double precision,
	"manual_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "goal_objectives" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"quarter" text NOT NULL,
	"title" text NOT NULL,
	"status" text NOT NULL,
	"created_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"approved_by" text,
	"approved_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "goal_key_results" ADD CONSTRAINT "goal_key_results_objective_id_goal_objectives_id_fk" FOREIGN KEY ("objective_id") REFERENCES "public"."goal_objectives"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "goal_objectives_quarter" ON "goal_objectives" USING btree ("quarter","status");