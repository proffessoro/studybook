-- CreateTable
CREATE TABLE "categories" (
    "id" UUID NOT NULL,
    "key" TEXT NOT NULL,
    "name_fr" TEXT NOT NULL,
    "name_en" TEXT NOT NULL,
    "sort" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "group_categories" (
    "group_id" UUID NOT NULL,
    "category_id" UUID NOT NULL,

    CONSTRAINT "group_categories_pkey" PRIMARY KEY ("group_id","category_id")
);

-- CreateTable
CREATE TABLE "group_tags" (
    "group_id" UUID NOT NULL,
    "tag" TEXT NOT NULL,

    CONSTRAINT "group_tags_pkey" PRIMARY KEY ("group_id","tag")
);

-- CreateIndex
CREATE UNIQUE INDEX "categories_key_key" ON "categories"("key");

-- CreateIndex
CREATE INDEX "group_categories_category_id_idx" ON "group_categories"("category_id");

-- CreateIndex
CREATE INDEX "group_tags_tag_idx" ON "group_tags"("tag");

-- CreateIndex
CREATE INDEX "groups_visibility_status_idx" ON "groups"("visibility", "status");

-- AddForeignKey
ALTER TABLE "group_categories" ADD CONSTRAINT "group_categories_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "groups"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "group_categories" ADD CONSTRAINT "group_categories_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "categories"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "group_tags" ADD CONSTRAINT "group_tags_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "groups"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Starter categories (GRP-04). The instance admin can change them.
INSERT INTO "categories" ("id", "key", "name_fr", "name_en", "sort", "updated_at") VALUES
  (gen_random_uuid(), 'languages', 'Langues', 'Languages', 10, CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'tech', 'Tech', 'Tech', 20, CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'business', 'Business', 'Business', 30, CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'faith', 'Foi', 'Faith', 40, CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'health', 'Santé', 'Health', 50, CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'exam-prep', 'Préparation aux examens', 'Exam prep', 60, CURRENT_TIMESTAMP);
