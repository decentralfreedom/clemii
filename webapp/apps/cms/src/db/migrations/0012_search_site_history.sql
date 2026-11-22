-- The site's numbers (search_site_daily) start empty. Forgetting the first day
-- of the history makes the next import read all of it again (search/import.ts),
-- which fills the site's days from the start; until then every range is clamped
-- to the last imported day, so nothing is shown that is not there.
UPDATE "search_console_state" SET "imported_from" = NULL;
