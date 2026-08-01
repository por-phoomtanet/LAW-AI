import OpenAI from "openai";
import { env } from "../utils/env";

// เรียก embeddings ผ่าน OpenRouter ด้วย OPENROUTER_API_KEY ตัวเดียวกับ chat
//
// ⚠️ เปลี่ยนตอน Phase 6: CLAUDE.md เดิม (เขียนไว้ตั้งแต่ Phase 1) ระบุว่า "OpenRouter ไม่มี
// embeddings endpoint" จึงต้องมี OPENAI_API_KEY แยก — ทดสอบจริงแล้วพบว่า**ข้อมูลนั้นล้าสมัย**
// ปัจจุบัน POST https://openrouter.ai/api/v1/embeddings ใช้งานได้จริง คืน 3072 มิติสำหรับ
// text-embedding-3-large, รองรับ batch (input เป็น array), และคืน usage ที่มี "cost" จริง
// มาให้ด้วย (ละเอียดกว่าของ OpenAI ที่ให้แค่ token) — ตัด OPENAI_API_KEY ออกทั้งระบบ
//
// ไม่ตัด prefix "openai/" อีกต่อไป — OpenRouter ใช้ model id แบบ namespace (`openai/...`)
// เป็นปกติ และรับทั้งสองแบบ การส่งตามที่ตั้งใน env ตรงๆ ทำให้สลับไป embedding model ของ
// provider อื่นบน OpenRouter ได้โดยไม่ต้องแก้โค้ด
//
// client ตัวนี้ใช้ embed "คำถามของผู้ใช้" ตอน retrieval = มีคนนั่งรออยู่หน้าจอ จึงต้อง fail
// fast: default ของ SDK คือ retry 2 ครั้งพร้อม backoff ทำให้คำขอที่จะล้มเหลวอยู่แล้วกินเวลา
// ~5 วินาทีก่อนยอมแพ้ (เจอจริงตอนรันเทส Phase 6 — timeout ทุกเคส) ถ้า embed ไม่ได้
// retrievalService จะข้าม vector search แล้วใช้ full-text/trigram ต่อทันที
// (สคริปต์ backfill ใน packages/ingestion มี client แยกที่ยังใช้ retry ตาม default —
// งาน batch ยาวๆ ไม่มีคนรอ การ retry transient error คุ้มกว่า)
export const embeddingClient = new OpenAI({
  apiKey: env.OPENROUTER_API_KEY,
  baseURL: "https://openrouter.ai/api/v1",
  maxRetries: 0,
  timeout: 5_000,
});

export const embeddingModelId = env.EMBEDDING_MODEL;
