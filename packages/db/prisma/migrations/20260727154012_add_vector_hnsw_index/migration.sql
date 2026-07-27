-- pgvector ANN index — Prisma schema syntax ยังไม่รองรับ vector index type โดยตรง
-- ใช้ HNSW + cosine distance ให้ตรงกับ similarity search ใน § AI/RAG Architecture (cosine similarity)
CREATE INDEX IF NOT EXISTS "DocumentChunk_embedding_hnsw_idx"
  ON "DocumentChunk" USING hnsw ("embedding" vector_cosine_ops);
