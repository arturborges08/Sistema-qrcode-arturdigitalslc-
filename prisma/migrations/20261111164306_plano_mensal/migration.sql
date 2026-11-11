-- CreateEnum
CREATE TYPE "PaymentStatus" AS ENUM ('PENDING', 'PAID');

-- AlterTable
ALTER TABLE "admin_users" ADD COLUMN     "paid_until" TIMESTAMPTZ(3),
ADD COLUMN     "self_signup" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "payments" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "amount_cents" INTEGER NOT NULL,
    "status" "PaymentStatus" NOT NULL DEFAULT 'PENDING',
    "checkout_url" VARCHAR(2048),
    "transaction_nsu" VARCHAR(128),
    "invoice_slug" VARCHAR(128),
    "capture_method" VARCHAR(32),
    "paid_amount_cents" INTEGER,
    "paid_at" TIMESTAMPTZ(3),
    "period_end" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "payments_transaction_nsu_key" ON "payments"("transaction_nsu");

-- CreateIndex
CREATE INDEX "payments_user_id_created_at_idx" ON "payments"("user_id", "created_at");

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "admin_users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
