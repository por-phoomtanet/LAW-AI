-- Phase 6 — semantic search embedding บน Passage
--
-- ⚠️ ทำไมเป็น halfvec ไม่ใช่ vector: pgvector's HNSW index รองรับสูงสุด 2000 มิติสำหรับชนิด
-- `vector` แต่ text-embedding-3-large = 3072 มิติ — พิสูจน์จริงกับ Postgres ตัวนี้แล้ว:
--   CREATE INDEX ... USING hnsw (emb vector_cosine_ops)  -- vector(3072)
--   ERROR: column cannot have more than 2000 dimensions for hnsw index
-- `halfvec` (half-precision, 2 ไบต์/มิติ แทน 4) รองรับ HNSW ถึง 4000 มิติ และกินพื้นที่
-- ครึ่งเดียว โดยคุณภาพ recall ต่างจาก full precision น้อยมากในทางปฏิบัติ
-- ต้องการ pgvector >= 0.7.0 (container ปัจจุบัน: 0.8.5 — ตรวจแล้ว)
--
-- ทางเลือกที่ไม่ได้เลือก: ส่ง dimensions: 2000 เข้า OpenAI API เพื่อย่อ embedding
-- (text-embedding-3 รองรับ Matryoshka truncation) — เสียข้อมูลมากกว่าโดยได้ index เท่ากัน
--
-- nullable โดยตั้งใจ: passage ที่ยังไม่ถูก backfill ต้องเป็น NULL ได้ ไม่งั้น embed
-- ทีละ batch ไม่ได้ (93k แถวต้องทยอยทำ + resume ได้ถ้าสคริปต์ตายกลางทาง)
ALTER TABLE "Passage" ADD COLUMN "embedding" halfvec(3072);

-- cosine distance (<=>) ให้ตรงกับ similarity search ใน § AI/RAG Architecture
-- สร้าง index ตอนคอลัมน์ยังว่างจึงเสร็จทันที — HNSW จะค่อยๆ โตตอน backfill (insert
-- แบบ incremental ช้ากว่า bulk build แต่ที่นี่ latency ของ OpenAI API ครอบงำอยู่แล้ว
-- ไม่ใช่คอขวดจริง) NULL ไม่ถูก index จึงไม่เปลืองพื้นที่ก่อน backfill
CREATE INDEX "Passage_embedding_hnsw_idx"
  ON "Passage" USING hnsw ("embedding" halfvec_cosine_ops);
