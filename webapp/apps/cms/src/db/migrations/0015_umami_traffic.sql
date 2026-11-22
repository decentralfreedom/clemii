CREATE TABLE "traffic_daily" (
	"post_id" uuid NOT NULL,
	"date" date NOT NULL,
	"pageviews" integer NOT NULL,
	"downloads" integer NOT NULL,
	CONSTRAINT "traffic_daily_post_id_date_pk" PRIMARY KEY("post_id","date")
);
--> statement-breakpoint
CREATE TABLE "traffic_site_daily" (
	"date" date PRIMARY KEY NOT NULL,
	"pageviews" integer NOT NULL,
	"downloads" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "traffic_state" (
	"id" smallint PRIMARY KEY DEFAULT 1 NOT NULL,
	"attempted_at" timestamp with time zone,
	"imported_at" timestamp with time zone,
	"imported_from" date,
	"imported_through" date,
	CONSTRAINT "traffic_state_single_row" CHECK ("traffic_state"."id" = 1)
);
--> statement-breakpoint
ALTER TABLE "traffic_daily" ADD CONSTRAINT "traffic_daily_post_id_posts_id_fk" FOREIGN KEY ("post_id") REFERENCES "public"."posts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "traffic_daily_date" ON "traffic_daily" USING btree ("date");