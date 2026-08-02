-- CreateEnum
CREATE TYPE "BlockSignal" AS ENUM ('BLOCKED', 'CHALLENGE');

-- CreateEnum
CREATE TYPE "BlockRuleSource" AS ENUM ('TITLE', 'TEXT', 'HTML', 'PATH', 'SCRIPT_CONTENT', 'SELECTOR');

-- AlterTable
ALTER TABLE "source_agencies"
ADD COLUMN     "block_handling_min_ready_body_length" INTEGER,
ADD COLUMN     "block_handling_wait_timeout_ms" INTEGER;

-- CreateTable
CREATE TABLE "block_rules" (
    "id" TEXT NOT NULL,
    "source_agency_id" TEXT NOT NULL,
    "label" TEXT,
    "signal" "BlockSignal" NOT NULL,
    "source" "BlockRuleSource" NOT NULL,
    "pattern" TEXT NOT NULL,
    "is_regex" BOOLEAN NOT NULL DEFAULT false,
    "regex_flags" TEXT,
    "position" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "block_rules_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "block_rules_source_agency_id_idx" ON "block_rules"("source_agency_id");

-- AddForeignKey
ALTER TABLE "block_rules" ADD CONSTRAINT "block_rules_source_agency_id_fkey" FOREIGN KEY ("source_agency_id") REFERENCES "source_agencies"("id") ON DELETE CASCADE ON UPDATE CASCADE;
