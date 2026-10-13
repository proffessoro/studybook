-- CreateTable
CREATE TABLE "instance_settings" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "default_storage_quota_bytes" BIGINT,
    "default_member_cap" INTEGER,
    "upload_limits" JSONB NOT NULL DEFAULT '{}',
    "media_processing" TEXT NOT NULL DEFAULT 'images',
    "catalogue_enabled" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "instance_settings_pkey" PRIMARY KEY ("id")
);
