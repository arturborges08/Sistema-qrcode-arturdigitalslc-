-- CreateTable
CREATE TABLE "admin_users" (
    "id" UUID NOT NULL,
    "email" VARCHAR(254) NOT NULL,
    "password_hash" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "admin_users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sessions" (
    "id" UUID NOT NULL,
    "token_hash" CHAR(64) NOT NULL,
    "csrf_token" VARCHAR(64) NOT NULL,
    "admin_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "plates" (
    "id" UUID NOT NULL,
    "code" VARCHAR(32) NOT NULL,
    "business_name" VARCHAR(120) NOT NULL,
    "internal_name" VARCHAR(120) NOT NULL,
    "destination_url" VARCHAR(2048) NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "notes" VARCHAR(2000),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "plates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "destination_changes" (
    "id" UUID NOT NULL,
    "plate_id" UUID NOT NULL,
    "previous_url" VARCHAR(2048),
    "new_url" VARCHAR(2048) NOT NULL,
    "changed_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "destination_changes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "admin_users_email_key" ON "admin_users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "sessions_token_hash_key" ON "sessions"("token_hash");

-- CreateIndex
CREATE INDEX "sessions_admin_id_idx" ON "sessions"("admin_id");

-- CreateIndex
CREATE INDEX "sessions_expires_at_idx" ON "sessions"("expires_at");

-- CreateIndex
CREATE UNIQUE INDEX "plates_code_key" ON "plates"("code");

-- CreateIndex
CREATE INDEX "plates_created_at_idx" ON "plates"("created_at");

-- CreateIndex
CREATE INDEX "plates_active_idx" ON "plates"("active");

-- CreateIndex
CREATE INDEX "destination_changes_plate_id_changed_at_idx" ON "destination_changes"("plate_id", "changed_at");

-- AddForeignKey
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_admin_id_fkey" FOREIGN KEY ("admin_id") REFERENCES "admin_users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "destination_changes" ADD CONSTRAINT "destination_changes_plate_id_fkey" FOREIGN KEY ("plate_id") REFERENCES "plates"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Regras de integridade adicionais (não expressáveis no schema Prisma)

-- O destino precisa ser http:// ou https://
ALTER TABLE "plates" ADD CONSTRAINT "plates_destination_url_scheme_chk"
  CHECK ("destination_url" ~* '^https?://');
ALTER TABLE "destination_changes" ADD CONSTRAINT "destination_changes_new_url_scheme_chk"
  CHECK ("new_url" ~* '^https?://');

-- O código público precisa ter só caracteres alfanuméricos
ALTER TABLE "plates" ADD CONSTRAINT "plates_code_format_chk"
  CHECK ("code" ~ '^[A-Za-z0-9]{4,32}$');

-- O código público é permanente: o banco recusa qualquer alteração
CREATE OR REPLACE FUNCTION prevent_plate_code_update() RETURNS trigger AS $$
BEGIN
  IF NEW."code" IS DISTINCT FROM OLD."code" THEN
    RAISE EXCEPTION 'O identificador permanente da plaquinha não pode ser alterado';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "plates_code_immutable"
  BEFORE UPDATE ON "plates"
  FOR EACH ROW EXECUTE FUNCTION prevent_plate_code_update();
