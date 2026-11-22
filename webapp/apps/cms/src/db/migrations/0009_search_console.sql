CREATE TABLE "search_console_state" (
	"id" smallint PRIMARY KEY DEFAULT 1 NOT NULL,
	"attempted_at" timestamp with time zone,
	"imported_at" timestamp with time zone,
	"imported_through" date,
	CONSTRAINT "search_console_state_single_row" CHECK ("search_console_state"."id" = 1)
);
--> statement-breakpoint
CREATE TABLE "search_daily" (
	"post_id" uuid NOT NULL,
	"date" date NOT NULL,
	"impressions" integer NOT NULL,
	"clicks" integer NOT NULL,
	"position" double precision NOT NULL,
	CONSTRAINT "search_daily_post_id_date_pk" PRIMARY KEY("post_id","date")
);
--> statement-breakpoint
ALTER TABLE "search_daily" ADD CONSTRAINT "search_daily_post_id_posts_id_fk" FOREIGN KEY ("post_id") REFERENCES "public"."posts"("id") ON DELETE cascade ON UPDATE no action;