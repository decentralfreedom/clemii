ALTER TYPE "public"."audit_action" ADD VALUE 'link.created';--> statement-breakpoint
ALTER TYPE "public"."audit_action" ADD VALUE 'link.archived';--> statement-breakpoint
CREATE TABLE "tracked_links" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"path" text NOT NULL,
	"post_id" uuid,
	"shared_on" text NOT NULL,
	"source" text NOT NULL,
	"medium" text NOT NULL,
	"campaign" text NOT NULL,
	"content" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" text NOT NULL,
	"archived_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "tracked_links" ADD CONSTRAINT "tracked_links_post_id_posts_id_fk" FOREIGN KEY ("post_id") REFERENCES "public"."posts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "tracked_links_tags" ON "tracked_links" USING btree ("path","source","medium","campaign","content");