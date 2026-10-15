-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('OWNER', 'CLIENT');

-- AlterTable
ALTER TABLE "admin_users" ADD COLUMN     "active" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "name" VARCHAR(120),
ADD COLUMN     "role" "UserRole" NOT NULL DEFAULT 'OWNER';

-- AlterTable
ALTER TABLE "destination_changes" ADD COLUMN     "changed_by_id" UUID;

-- AlterTable
ALTER TABLE "plates" ADD COLUMN     "client_id" UUID;

-- CreateIndex
CREATE INDEX "admin_users_role_idx" ON "admin_users"("role");

-- CreateIndex
CREATE INDEX "plates_client_id_idx" ON "plates"("client_id");

-- AddForeignKey
ALTER TABLE "plates" ADD CONSTRAINT "plates_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "admin_users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "destination_changes" ADD CONSTRAINT "destination_changes_changed_by_id_fkey" FOREIGN KEY ("changed_by_id") REFERENCES "admin_users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
