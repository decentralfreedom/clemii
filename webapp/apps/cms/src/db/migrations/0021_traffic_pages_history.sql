-- Pages (traffic_page_daily) start empty. Forgetting the last imported day
-- makes the next import read every day again (traffic/import.ts), which fills
-- them from the same reads as the rest; until then the traffic API answers
-- "no data yet".
UPDATE "traffic_state" SET "imported_through" = NULL;
