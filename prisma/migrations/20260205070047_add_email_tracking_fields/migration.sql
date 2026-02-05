-- AlterTable
ALTER TABLE "Presentation" ADD COLUMN     "ccEmails" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "clickCount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "deliveredAt" TIMESTAMP(3),
ADD COLUMN     "firstOpenedAt" TIMESTAMP(3),
ADD COLUMN     "lastClickedAt" TIMESTAMP(3),
ADD COLUMN     "lastOpenedAt" TIMESTAMP(3),
ADD COLUMN     "openCount" INTEGER NOT NULL DEFAULT 0;
