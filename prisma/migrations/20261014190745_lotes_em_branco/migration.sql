-- AlterTable
ALTER TABLE "plates" ADD COLUMN     "batch_name" VARCHAR(80),
ALTER COLUMN "business_name" DROP NOT NULL,
ALTER COLUMN "destination_url" DROP NOT NULL;

-- CreateIndex
CREATE INDEX "plates_batch_name_idx" ON "plates"("batch_name");
