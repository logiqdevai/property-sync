-- CreateEnum
CREATE TYPE "ActivityOutcome" AS ENUM ('SUCCESS', 'FAILURE');

-- CreateEnum
CREATE TYPE "ActivityChangeOperation" AS ENUM ('CREATE', 'UPDATE', 'DELETE', 'ACTION');

-- CreateTable
CREATE TABLE "activity_logs" (
    "id" TEXT NOT NULL,
    "request_id" TEXT,
    "action" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "method" TEXT NOT NULL,
    "route" TEXT NOT NULL,
    "path" TEXT NOT NULL,
    "status_code" INTEGER,
    "outcome" "ActivityOutcome" NOT NULL,
    "error_message" TEXT,
    "duration_ms" INTEGER,
    "actor_id" TEXT,
    "actor_email" TEXT,
    "actor_role" TEXT,
    "effective_user_id" TEXT,
    "is_impersonated" BOOLEAN NOT NULL DEFAULT false,
    "ip" TEXT,
    "user_agent" TEXT,
    "client_route" TEXT,
    "client_session_id" TEXT,
    "request_body" JSONB,
    "request_query" JSONB,
    "job_log_id" TEXT,
    "affected_count" INTEGER NOT NULL DEFAULT 0,
    "snapshots_truncated" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "activity_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "activity_log_changes" (
    "id" TEXT NOT NULL,
    "activity_log_id" TEXT NOT NULL,
    "entity_type" TEXT NOT NULL,
    "entity_id" TEXT NOT NULL,
    "operation" "ActivityChangeOperation" NOT NULL,
    "before" JSONB,
    "after" JSONB,
    "changes" JSONB NOT NULL DEFAULT '[]',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "activity_log_changes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "activity_logs_created_at_idx" ON "activity_logs"("created_at" DESC);

-- CreateIndex
CREATE INDEX "activity_logs_actor_id_created_at_idx" ON "activity_logs"("actor_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "activity_logs_effective_user_id_created_at_idx" ON "activity_logs"("effective_user_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "activity_logs_action_created_at_idx" ON "activity_logs"("action", "created_at" DESC);

-- CreateIndex
CREATE INDEX "activity_logs_category_created_at_idx" ON "activity_logs"("category", "created_at" DESC);

-- CreateIndex
CREATE INDEX "activity_logs_outcome_created_at_idx" ON "activity_logs"("outcome", "created_at" DESC);

-- CreateIndex
CREATE INDEX "activity_log_changes_activity_log_id_idx" ON "activity_log_changes"("activity_log_id");

-- CreateIndex
CREATE INDEX "activity_log_changes_entity_type_entity_id_created_at_idx" ON "activity_log_changes"("entity_type", "entity_id", "created_at" DESC);

-- AddForeignKey
ALTER TABLE "activity_log_changes" ADD CONSTRAINT "activity_log_changes_activity_log_id_fkey" FOREIGN KEY ("activity_log_id") REFERENCES "activity_logs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

