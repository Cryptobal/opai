-- AddColumn: estado de conciliación bancaria del DTE, independiente de
-- payment_status. NULL = no conciliada. Una factura puede estar PAID
-- (marca manual via bulk-mark-paid) y reconciled_at = NULL hasta que
-- aparezca un movimiento bancario asociado.
ALTER TABLE "finance"."finance_dtes"
ADD COLUMN IF NOT EXISTS "reconciled_at" TIMESTAMPTZ(6);
