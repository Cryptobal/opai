-- AlterEnum
ALTER TYPE "chat"."channel_type" ADD VALUE 'EXTERNAL';

-- AlterTable
ALTER TABLE "chat"."channels" ADD COLUMN "account_id" UUID;

-- CreateTable
CREATE TABLE "chat"."channel_participants" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "channel_id" UUID NOT NULL,
    "participant_type" TEXT NOT NULL,
    "participant_id" TEXT NOT NULL,
    "joined_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "channel_participants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "chat"."channel_archives" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "channel_id" UUID NOT NULL,
    "admin_id" TEXT NOT NULL,
    "archived_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "channel_archives_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "uq_chat_channel_participant" ON "chat"."channel_participants"("channel_id", "participant_type", "participant_id");

-- CreateIndex
CREATE INDEX "idx_chat_channel_participants_participant" ON "chat"."channel_participants"("participant_type", "participant_id");

-- CreateIndex
CREATE INDEX "idx_chat_channel_participants_channel" ON "chat"."channel_participants"("channel_id");

-- CreateIndex
CREATE UNIQUE INDEX "uq_chat_channel_archive" ON "chat"."channel_archives"("channel_id", "admin_id");

-- CreateIndex
CREATE INDEX "idx_chat_channel_archives_admin" ON "chat"."channel_archives"("admin_id");

-- AddForeignKey
ALTER TABLE "chat"."channel_participants" ADD CONSTRAINT "channel_participants_channel_id_fkey" FOREIGN KEY ("channel_id") REFERENCES "chat"."channels"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chat"."channel_archives" ADD CONSTRAINT "channel_archives_channel_id_fkey" FOREIGN KEY ("channel_id") REFERENCES "chat"."channels"("id") ON DELETE CASCADE ON UPDATE CASCADE;
