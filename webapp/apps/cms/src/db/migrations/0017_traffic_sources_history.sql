-- Sources (traffic_source_daily) start empty, while page views per post go
-- back to the Umami website's creation. Forgetting the last imported day makes
-- the next import read every day again (traffic/import.ts), which fills both
-- from the same reads; until then the traffic API answers "no data yet".
UPDATE "traffic_state" SET "imported_through" = NULL;
