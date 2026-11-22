CREATE TYPE "public"."audit_action" AS ENUM('post.created', 'post.edited', 'post.image_uploaded', 'post.scheduled', 'post.published', 'post.unpublished', 'post.approved', 'post.deleted', 'token.created', 'token.revoked', 'device.approved', 'device.denied', 'owner.signed_in');--> statement-breakpoint
CREATE TABLE "audit_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"at" timestamp with time zone DEFAULT now() NOT NULL,
	"action" "audit_action" NOT NULL,
	"actor" text NOT NULL,
	"actor_token_id" uuid,
	"actor_github_user_id" bigint,
	"post_id" uuid,
	"token_id" uuid,
	"revision_id" uuid,
	"subject" text NOT NULL
);
--> statement-breakpoint
CREATE INDEX "audit_log_at" ON "audit_log" USING btree ("at","id");--> statement-breakpoint
CREATE INDEX "audit_log_post_at" ON "audit_log" USING btree ("post_id","at");