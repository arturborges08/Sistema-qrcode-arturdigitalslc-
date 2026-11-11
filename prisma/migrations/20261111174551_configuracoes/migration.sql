-- CreateTable
CREATE TABLE "app_settings" (
    "key" VARCHAR(64) NOT NULL,
    "value" VARCHAR(512) NOT NULL,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "app_settings_pkey" PRIMARY KEY ("key")
);
