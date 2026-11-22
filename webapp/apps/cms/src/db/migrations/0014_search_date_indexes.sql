CREATE INDEX "search_daily_date" ON "search_daily" USING btree ("date");--> statement-breakpoint
CREATE INDEX "search_queries_date" ON "search_queries" USING btree ("date");