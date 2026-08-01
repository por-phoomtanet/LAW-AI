-- Phase 6 — กลับไปใช้ text-embedding-3-large (3072 มิติ) หลังทดสอบคุณภาพเทียบกับ small
--
-- เหตุผลที่กลับมา large ทั้งที่แพงกว่า 6.5 เท่า ($0.69 → $4.52): วัดจริงบน sample 514 passages
-- (PDPA 114 + noise 400) แล้วพบว่า small ตอบคำถามหลักของ Phase นี้ไม่ได้
--   คำถาม "PDPA" เดี่ยวๆ        → small หา พ.ร.บ.คุ้มครองข้อมูลฯ เจอ (vector อันดับ 1-5) ✅
--   คำถาม "กฎหมาย pdpa"        → small ได้แค่อันดับ 4 ใน vector (dist 0.677 ตามหลัง 0.568)
--                                 แรงไม่พอสู้คะแนน full-text ใน RRF → ไม่ติด top 10 เลย ❌
--                                 large ติดอันดับ 3 ในผลลัพธ์สุดท้าย ✅
-- สรุป: small "รู้จัก" PDPA แต่พอเติมคำกว้างๆ อย่าง "กฎหมาย" เข้าไป embedding ถูกเจือจน
-- เอกสารที่ไม่เกี่ยวขึ้นนำ — large ทนต่อการเจือจางนี้ได้ดีกว่า และคำถามจริงของผู้ใช้
-- ก็มักมีคำกว้างๆ ปนแบบนี้ ไม่ได้พิมพ์แต่ keyword เดี่ยวๆ
--
-- ⚠️ ต้องล้าง embedding เดิม (1536 มิติจาก small) ทิ้งทั้งหมด — คนละ vector space กับ 3072
-- ตอนนี้มีแค่ 514 แถวจากการทดสอบ ยังไม่ได้ backfill เต็ม จึงไม่เสียหาย
--
-- ที่ 3072 มิติ **halfvec เป็นทางเลือกเดียวที่ index ได้** — HNSW ของ pgvector รองรับแค่
-- 2000 มิติสำหรับชนิด vector (พิสูจน์แล้ว: ERROR: column cannot have more than 2000
-- dimensions for hnsw index) ต่างจากตอน 1536 ที่จะใช้ vector ธรรมดาก็ได้
ALTER TABLE "Passage" DROP COLUMN "embedding";
ALTER TABLE "Passage" ADD COLUMN "embedding" halfvec(3072);

CREATE INDEX "Passage_embedding_hnsw_idx"
  ON "Passage" USING hnsw ("embedding" halfvec_cosine_ops);
