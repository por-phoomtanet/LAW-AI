-- AlterTable
ALTER TABLE "Conversation" ADD COLUMN     "mode" TEXT NOT NULL DEFAULT 'general';

-- Full-text search สำหรับ Phase 5 retrieval (แชทกฎหมาย) — ไม่ผ่าน Prisma schema syntax
-- เพราะ generated column/GIN index ไม่มี native support ใน Prisma (เหมือน pattern เดิม
-- ของ HNSW vector index ใน migration 20260727154012_add_vector_hnsw_index)
--
-- "simple" config ไม่ใช่ "thai"/"english" เพราะ Postgres ไม่มี Thai text search config
-- ในตัว — "simple" ยัง tokenize คำที่คั่นด้วยช่องว่าง/เครื่องหมายวรรคตอนได้ปกติ
ALTER TABLE "Passage" ADD COLUMN "searchVector" tsvector
  GENERATED ALWAYS AS (to_tsvector('simple', content)) STORED;

CREATE INDEX "Passage_searchVector_idx" ON "Passage" USING GIN ("searchVector");

-- pg_trgm เสริมสำหรับคำไทยที่ติดกันไม่มีช่องว่างคั่น (tsvector ตัดคำด้วยช่องว่างอย่างเดียว
-- ไม่พอสำหรับภาษาไทยที่เขียนติดกัน)
CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE INDEX "Passage_content_trgm_idx" ON "Passage" USING GIN (content gin_trgm_ops);
