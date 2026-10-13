-- CreateTable
CREATE TABLE "user_property_clients" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "user_property_id" TEXT,
    "user_tracked_agency_id" TEXT,
    "source_agency_id" TEXT,
    "property_id" TEXT NOT NULL,
    "internal_id" TEXT,
    "property_title" TEXT NOT NULL,
    "source_url" TEXT,
    "name" TEXT NOT NULL,
    "phone" TEXT,
    "email" TEXT,
    "notes" TEXT,
    "shown_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "delisted_at" TIMESTAMP(3),
    "delisted_ack_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "user_property_clients_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "user_property_clients_user_id_idx" ON "user_property_clients"("user_id");

-- CreateIndex
CREATE INDEX "user_property_clients_user_property_id_idx" ON "user_property_clients"("user_property_id");

-- CreateIndex
CREATE INDEX "user_property_clients_user_id_source_agency_id_property_id_idx" ON "user_property_clients"("user_id", "source_agency_id", "property_id");

-- AddForeignKey
ALTER TABLE "user_property_clients" ADD CONSTRAINT "user_property_clients_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_property_clients" ADD CONSTRAINT "user_property_clients_user_property_id_fkey" FOREIGN KEY ("user_property_id") REFERENCES "user_properties"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_property_clients" ADD CONSTRAINT "user_property_clients_user_tracked_agency_id_fkey" FOREIGN KEY ("user_tracked_agency_id") REFERENCES "user_tracked_agencies"("id") ON DELETE SET NULL ON UPDATE CASCADE;
