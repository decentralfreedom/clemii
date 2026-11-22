CREATE TABLE "traffic_source_daily" (
	"date" date NOT NULL,
	"path" text NOT NULL,
	"post_id" uuid,
	"page_type" text NOT NULL,
	"channel" text NOT NULL,
	"source" text NOT NULL,
	"medium" text NOT NULL,
	"campaign" text NOT NULL,
	"content" text NOT NULL,
	"pageviews" integer NOT NULL,
	"downloads" integer NOT NULL,
	CONSTRAINT "traffic_source_daily_date_path_channel_source_medium_campaign_content_pk" PRIMARY KEY("date","path","channel","source","medium","campaign","content")
);
--> statement-breakpoint
ALTER TABLE "traffic_source_daily" ADD CONSTRAINT "traffic_source_daily_post_id_posts_id_fk" FOREIGN KEY ("post_id") REFERENCES "public"."posts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "traffic_source_daily_post" ON "traffic_source_daily" USING btree ("post_id","date");