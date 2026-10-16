-- CreateEnum
CREATE TYPE "group_visibility" AS ENUM ('private', 'listed');

-- CreateEnum
CREATE TYPE "progress_visibility" AS ENUM ('own', 'all');

-- CreateEnum
CREATE TYPE "group_status" AS ENUM ('active', 'archived');

-- CreateEnum
CREATE TYPE "group_role" AS ENUM ('leader', 'moderator', 'member');

-- CreateEnum
CREATE TYPE "membership_status" AS ENUM ('active', 'left', 'removed', 'banned');

-- CreateTable
CREATE TABLE "groups" (
    "id" UUID NOT NULL,
    "owner_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "visibility" "group_visibility" NOT NULL DEFAULT 'private',
    "invite_requires_approval" BOOLEAN NOT NULL DEFAULT false,
    "progress_visibility" "progress_visibility" NOT NULL DEFAULT 'own',
    "feed_enabled" BOOLEAN NOT NULL DEFAULT true,
    "language_label" TEXT,
    "status" "group_status" NOT NULL DEFAULT 'active',
    "storage_quota_bytes" BIGINT,
    "storage_used_bytes" BIGINT NOT NULL DEFAULT 0,
    "member_cap" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "groups_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "memberships" (
    "id" UUID NOT NULL,
    "group_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "role" "group_role" NOT NULL DEFAULT 'member',
    "status" "membership_status" NOT NULL DEFAULT 'active',
    "joined_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "access_expires_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "memberships_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "groups_slug_key" ON "groups"("slug");

-- CreateIndex
CREATE INDEX "groups_owner_id_idx" ON "groups"("owner_id");

-- CreateIndex
CREATE INDEX "memberships_user_id_status_idx" ON "memberships"("user_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "memberships_group_id_user_id_key" ON "memberships"("group_id", "user_id");

-- AddForeignKey
ALTER TABLE "groups" ADD CONSTRAINT "groups_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "groups"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
