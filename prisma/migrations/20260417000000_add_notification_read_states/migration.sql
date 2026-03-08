-- CreateTable
CREATE TABLE "crm"."notification_read_states" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "notification_id" UUID NOT NULL,
    "user_id" TEXT NOT NULL,
    "read_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "seen_at" TIMESTAMPTZ(6),

    CONSTRAINT "notification_read_states_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "uq_notification_read_state_notif_user" ON "crm"."notification_read_states"("notification_id", "user_id");

-- CreateIndex
CREATE INDEX "idx_notification_read_state_user" ON "crm"."notification_read_states"("user_id");

-- CreateIndex
CREATE INDEX "idx_notification_read_state_notif" ON "crm"."notification_read_states"("notification_id");

-- AddForeignKey
ALTER TABLE "crm"."notification_read_states" ADD CONSTRAINT "notification_read_states_notification_id_fkey" FOREIGN KEY ("notification_id") REFERENCES "crm"."notifications"("id") ON DELETE CASCADE ON UPDATE CASCADE;
