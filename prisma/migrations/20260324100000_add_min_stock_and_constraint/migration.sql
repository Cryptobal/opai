-- Add minimum stock threshold and non-negative constraint
ALTER TABLE "inventory"."stock"
  ADD COLUMN "min_stock" INTEGER NOT NULL DEFAULT 0;

-- Prevent negative stock at database level
ALTER TABLE "inventory"."stock"
  ADD CONSTRAINT "chk_stock_qty_nonnegative" CHECK (quantity >= 0);
