CREATE TABLE "traffic_page_daily" (
	"date" date NOT NULL,
	"path" text NOT NULL,
	"post_id" uuid,
	"page_type" text NOT NULL,
	"pageviews" integer NOT NULL,
	"downloads" integer NOT NULL,
	CONSTRAINT "traffic_page_daily_date_path_pk" PRIMARY KEY("date","path")
);
--> statement-breakpoint
ALTER TABLE "traffic_page_daily" ADD CONSTRAINT "traffic_page_daily_post_id_posts_id_fk" FOREIGN KEY ("post_id") REFERENCES "public"."posts"("id") ON DELETE set null ON UPDATE no action;