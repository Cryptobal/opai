-- CreateEnum
CREATE TYPE "chat"."ChatParticipantType" AS ENUM ('ADMIN', 'CONTACT');

-- AlterTable
ALTER TABLE "chat"."channel_participants"
  ALTER COLUMN "participant_type" TYPE "chat"."ChatParticipantType"
  USING "participant_type"::"chat"."ChatParticipantType";

-- Also drop the redundant index (if it was already created in the DB)
DROP INDEX IF EXISTS "chat"."idx_chat_channel_participants_channel";
