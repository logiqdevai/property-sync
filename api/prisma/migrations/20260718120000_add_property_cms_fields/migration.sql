ALTER TABLE "source_properties" ADD COLUMN "raw_property_type" TEXT,
ADD COLUMN "raw_listing_type" TEXT,
ADD COLUMN "raw_sqm" TEXT,
ADD COLUMN "raw_bedrooms" TEXT,
ADD COLUMN "raw_bathrooms" TEXT;

ALTER TABLE "properties" ADD COLUMN "estateweb_type_id" INTEGER,
ADD COLUMN "estateweb_location_id" INTEGER,
ADD COLUMN "cms_fields" JSONB,
ADD COLUMN "cms_metadata" JSONB,
ADD COLUMN "video_url" TEXT,
ADD COLUMN "distance_airport" TEXT,
ADD COLUMN "distance_port" TEXT,
ADD COLUMN "distance_beach" TEXT,
ADD COLUMN "price_start" DECIMAL(14,2),
ADD COLUMN "price_web" DECIMAL(14,2);

ALTER TABLE "user_properties" ADD COLUMN "estateweb_type_id" INTEGER,
ADD COLUMN "estateweb_location_id" INTEGER,
ADD COLUMN "cms_fields" JSONB,
ADD COLUMN "cms_metadata" JSONB,
ADD COLUMN "video_url" TEXT,
ADD COLUMN "distance_airport" TEXT,
ADD COLUMN "distance_port" TEXT,
ADD COLUMN "distance_beach" TEXT,
ADD COLUMN "price_start" DECIMAL(14,2),
ADD COLUMN "price_web" DECIMAL(14,2);
