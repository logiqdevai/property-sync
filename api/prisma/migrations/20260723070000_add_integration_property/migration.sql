-- CreateTable
CREATE TABLE "integration_properties" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "user_integration_settings_id" TEXT NOT NULL,
    "property_id" TEXT NOT NULL,
    "images" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "integration_properties_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "integration_properties_user_id_idx" ON "integration_properties"("user_id");

-- CreateIndex
CREATE INDEX "integration_properties_property_id_idx" ON "integration_properties"("property_id");

-- CreateIndex
CREATE INDEX "integration_properties_user_integration_settings_id_idx" ON "integration_properties"("user_integration_settings_id");

-- CreateIndex
CREATE UNIQUE INDEX "integration_properties_user_id_user_integration_settings_id_property_id_key" ON "integration_properties"("user_id", "user_integration_settings_id", "property_id");

-- AddForeignKey
ALTER TABLE "integration_properties" ADD CONSTRAINT "integration_properties_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "integration_properties" ADD CONSTRAINT "integration_properties_user_integration_settings_id_fkey" FOREIGN KEY ("user_integration_settings_id") REFERENCES "user_integration_settings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "integration_properties" ADD CONSTRAINT "integration_properties_property_id_fkey" FOREIGN KEY ("property_id") REFERENCES "properties"("id") ON DELETE CASCADE ON UPDATE CASCADE;
