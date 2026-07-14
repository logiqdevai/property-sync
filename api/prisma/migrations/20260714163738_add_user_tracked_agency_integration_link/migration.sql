-- CreateTable
CREATE TABLE "user_tracked_agency_integration_links" (
    "id" TEXT NOT NULL,
    "user_tracked_agency_id" TEXT NOT NULL,
    "user_integration_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "user_tracked_agency_integration_links_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "user_tracked_agency_integration_links_user_tracked_agency_id_key" ON "user_tracked_agency_integration_links"("user_tracked_agency_id");

-- CreateIndex
CREATE UNIQUE INDEX "user_tracked_agency_integration_links_user_integration_id_key" ON "user_tracked_agency_integration_links"("user_integration_id");

-- AddForeignKey
ALTER TABLE "user_tracked_agency_integration_links" ADD CONSTRAINT "user_tracked_agency_integration_links_user_tracked_agency_id_fkey" FOREIGN KEY ("user_tracked_agency_id") REFERENCES "user_tracked_agencies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_tracked_agency_integration_links" ADD CONSTRAINT "user_tracked_agency_integration_links_user_integration_id_fkey" FOREIGN KEY ("user_integration_id") REFERENCES "user_integrations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
