CREATE TABLE "search_queries" (
	"post_id" uuid NOT NULL,
	"date" date NOT NULL,
	"query" text NOT NULL,
	"impressions" integer NOT NULL,
	"clicks" integer NOT NULL,
	"position" double precision NOT NULL,
	CONSTRAINT "search_queries_post_id_date_query_pk" PRIMARY KEY("post_id","date","query")
);
--> statement-breakpoint
ALTER TABLE "search_console_state" ADD COLUMN "imported_from" date;--> statement-breakpoint
ALTER TABLE "search_queries" ADD CONSTRAINT "search_queries_post_id_posts_id_fk" FOREIGN KEY ("post_id") REFERENCES "public"."posts"("id") ON DELETE cascade ON UPDATE no action;