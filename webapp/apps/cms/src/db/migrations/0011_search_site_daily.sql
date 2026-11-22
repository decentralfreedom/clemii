CREATE TABLE "search_site_daily" (
	"date" date PRIMARY KEY NOT NULL,
	"impressions" integer NOT NULL,
	"clicks" integer NOT NULL,
	"position" double precision NOT NULL
);
