-- Spec B (invite + consent). Fully additive: two new enums, two new tables,
-- four new nullable columns on existing tables (users.phone_e164,
-- users.phone_verified_at, contractors.email, contractors.phone_verified_at).
-- No existing row changes meaning, so this is safe to apply to a live
-- database ahead of the code deploy. Deliberately does NOT add a
-- `contractors.whatsapp_opt_in_at` column — that dispatcher-set-timestamp
-- design is superseded by consent_records, which captures PERSON-driven,
-- per-channel opt-in instead of proxy consent.

-- CreateEnum
CREATE TYPE "InviteKind" AS ENUM ('ACCOUNT', 'CONSENT_ONLY');

-- CreateEnum
CREATE TYPE "ConsentChannel" AS ENUM ('WHATSAPP', 'SMS', 'EMAIL');

-- AlterTable
ALTER TABLE "users" ADD COLUMN "phone_e164" TEXT;
ALTER TABLE "users" ADD COLUMN "phone_verified_at" TIMESTAMPTZ;

-- AlterTable
ALTER TABLE "contractors" ADD COLUMN "email" TEXT;
ALTER TABLE "contractors" ADD COLUMN "phone_verified_at" TIMESTAMPTZ;

-- CreateTable
CREATE TABLE "invite_tokens" (
    "id" UUID NOT NULL,
    "kind" "InviteKind" NOT NULL,
    "user_id" UUID,
    "contractor_id" UUID,
    "token_hash" TEXT NOT NULL,
    "expires_at" TIMESTAMPTZ NOT NULL,
    "consumed_at" TIMESTAMPTZ,
    "revoked_at" TIMESTAMPTZ,
    "created_by_user_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "invite_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "consent_records" (
    "id" UUID NOT NULL,
    "user_id" UUID,
    "contractor_id" UUID,
    "channel" "ConsentChannel" NOT NULL,
    "phone_e164" TEXT NOT NULL,
    "consent_text" TEXT NOT NULL,
    "policy_version" TEXT NOT NULL,
    "locale" "Locale" NOT NULL,
    "ip_address" TEXT,
    "user_agent" TEXT,
    "granted_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revoked_at" TIMESTAMPTZ,
    "revoked_reason" TEXT,

    CONSTRAINT "consent_records_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_phone_e164_key" ON "users"("phone_e164");

-- CreateIndex
CREATE UNIQUE INDEX "invite_tokens_token_hash_key" ON "invite_tokens"("token_hash");

-- CreateIndex
CREATE INDEX "invite_tokens_user_id_idx" ON "invite_tokens"("user_id");
CREATE INDEX "invite_tokens_contractor_id_idx" ON "invite_tokens"("contractor_id");

-- CreateIndex
CREATE INDEX "consent_records_user_id_revoked_at_idx" ON "consent_records"("user_id", "revoked_at");
CREATE INDEX "consent_records_contractor_id_revoked_at_idx" ON "consent_records"("contractor_id", "revoked_at");

-- AddForeignKey
ALTER TABLE "invite_tokens" ADD CONSTRAINT "invite_tokens_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "invite_tokens" ADD CONSTRAINT "invite_tokens_contractor_id_fkey" FOREIGN KEY ("contractor_id") REFERENCES "contractors"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "invite_tokens" ADD CONSTRAINT "invite_tokens_created_by_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "consent_records" ADD CONSTRAINT "consent_records_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "consent_records" ADD CONSTRAINT "consent_records_contractor_id_fkey" FOREIGN KEY ("contractor_id") REFERENCES "contractors"("id") ON DELETE CASCADE ON UPDATE CASCADE;
