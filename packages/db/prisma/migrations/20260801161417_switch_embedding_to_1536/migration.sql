-- Phase 6 — เปลี่ยนโมเดล embedding: text-embedding-3-large (3072) → text-embedding-3-small (1536)
--
-- ทำไมเปลี่ยน: small ถูกกว่า 6.5 เท่า ($0.02 vs $0.13 ต่อ 1M token) → backfill เต็มคลัง
-- จาก ~$4.52 เหลือ ~$0.70 และ 1536 มิติยังอยู่ใต้ลิมิต 2000 มิติของ HNSW แบบ `vector`
-- ด้วย (จึงไม่จำเป็นต้องใช้ halfvec แล้วก็ได้) — แต่คงใช้ halfvec ต่อเพราะกินพื้นที่ครึ่งเดียว
-- (2 ไบต์/มิติ): 93k passages × 1536 มิติ = ~286MB แทน ~571MB ของ vector โดยคุณภาพ recall
-- ต่างกันน้อยมาก และไม่ต้องแก้โค้ดฝั่ง query ที่ cast ::halfvec ไว้แล้ว
--
-- ⚠️ ต้องล้าง embedding เดิมทิ้งทั้งหมด — เวกเตอร์ 3072 มิติจาก large ใช้กับ 1536 ไม่ได้
-- (คนละ vector space กันโดยสิ้นเชิง ไม่ใช่แค่เรื่องความยาว) ตอนนี้มีแค่ 534 แถวที่ embed
-- ไปแล้วตอนทดสอบ ยังไม่ได้ backfill เต็ม จึงไม่เสียหายอะไร
--
-- DROP + ADD COLUMN แทน ALTER TYPE เพราะยังไงข้อมูลเดิมก็ใช้ต่อไม่ได้ (ไม่มี USING clause
-- ที่แปลง 3072 → 1536 ได้อย่างมีความหมาย) และ DROP COLUMN จะลบ index ที่ผูกอยู่ให้เอง
ALTER TABLE "Passage" DROP COLUMN "embedding";
ALTER TABLE "Passage" ADD COLUMN "embedding" halfvec(1536);

CREATE INDEX "Passage_embedding_hnsw_idx"
  ON "Passage" USING hnsw ("embedding" halfvec_cosine_ops);
