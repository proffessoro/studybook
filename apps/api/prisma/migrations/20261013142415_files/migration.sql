-- CreateEnum
CREATE TYPE "file_kind" AS ENUM ('pdf', 'audio', 'video', 'image');

-- CreateEnum
CREATE TYPE "file_status" AS ENUM ('reserved', 'ready');

-- CreateTable
CREATE TABLE "files" (
    "id" UUID NOT NULL,
    "group_id" UUID NOT NULL,
    "uploader_id" UUID NOT NULL,
    "kind" "file_kind" NOT NULL,
    "mime" TEXT NOT NULL,
    "filename" TEXT NOT NULL,
    "size_bytes" BIGINT NOT NULL,
    "storage_key" TEXT NOT NULL,
    "status" "file_status" NOT NULL DEFAULT 'reserved',
    "reserved_until" TIMESTAMP(3),
    "processing_status" TEXT NOT NULL DEFAULT 'ready',
    "variants" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "files_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "files_storage_key_key" ON "files"("storage_key");

-- CreateIndex
CREATE INDEX "files_group_id_idx" ON "files"("group_id");

-- CreateIndex
CREATE INDEX "files_status_reserved_until_idx" ON "files"("status", "reserved_until");

-- AddForeignKey
ALTER TABLE "files" ADD CONSTRAINT "files_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "groups"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "files" ADD CONSTRAINT "files_uploader_id_fkey" FOREIGN KEY ("uploader_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
