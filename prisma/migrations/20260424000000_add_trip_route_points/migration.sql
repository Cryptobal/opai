-- Add route_points column to finance_trips for GPS trajectory tracking
ALTER TABLE "finance"."finance_trips" ADD COLUMN "route_points" JSONB;
