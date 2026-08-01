import OpenAI from "openai";

// client แยกจาก apps/api/src/clients/embeddingClient.ts โดยตั้งใจ — คนละ process กัน
// (API server vs สคริปต์ ingest/backfill) Dev Standard #1 ห้าม new OpenAI() กระจายหลายที่
// "ในแอปเดียวกัน" ไม่ใช่ห้ามข้าม process — ฝั่งนี้ import จาก apps/api ไม่ได้อยู่แล้ว
// (packages/* ห้ามพึ่ง apps/*) และ packages/core ต้องคง zero-dependency ไว้เพราะ Dockerfile
// พึ่งข้อเท็จจริงนั้นตอน copy stage (ดู CLAUDE.md § Phase 4.3)
//
// ใช้ OpenRouter ตัวเดียวกับ chat (ทดสอบแล้วว่ามี /v1/embeddings จริง — CLAUDE.md เดิมที่ว่า
// "OpenRouter ไม่มี embeddings endpoint" ล้าสมัยแล้ว ดู § AI/RAG ข้อ 2) ต่างจากฝั่ง API ตรงที่
// **ไม่ตั้ง maxRetries: 0** — งาน batch ยาวๆ ไม่มีคนนั่งรอ retry transient error คุ้มกว่า
export const embeddingClient = new OpenAI({
  apiKey: process.env.OPENROUTER_API_KEY,
  baseURL: "https://openrouter.ai/api/v1",
});

// ส่ง model id ตามที่ตั้งใน env ตรงๆ — OpenRouter ใช้ namespace (`openai/...`) เป็นปกติ
export const embeddingModelId = process.env.EMBEDDING_MODEL ?? "openai/text-embedding-3-large";

// OpenAI embeddings จำกัด input ที่ 8,191 token/รายการ — วัดจาก corpus จริงแล้วมี passage
// ยาวสุดถึง 75,285 ตัวอักษร (43 รายการเกิน 8,000 ตัวอักษร จาก 93,634 = 0.05%)
// ถ้าไม่ตัดจะ error ทั้ง batch ไม่ใช่แค่รายการเดียว
//
// ตัดที่ระดับ "ตัวอักษร" ไม่ใช่ token จริง โดยตั้ง 8,000 ตัวอักษรแบบ conservative มาก:
// ต่อให้ tokenizer แย่สุดคือ 1 token/ตัวอักษร ก็ยังได้ 8,000 < 8,191 (ของจริงภาษาไทยราว
// 2-3 ตัวอักษร/token) — ไม่ต้องลาก tokenizer library เข้ามาเพิ่ม dependency เพื่อ 0.05%
const MAX_CHARS_PER_INPUT = 8_000;

// จำกัดทั้งจำนวนรายการและตัวอักษรรวมต่อ request — OpenAI มีลิมิต token รวมต่อ request
// ด้วย ไม่ใช่แค่ต่อรายการ (batch ใหญ่ที่มี passage ยาวๆ หลายอันพร้อมกันจะชนลิมิตนั้น)
const MAX_ITEMS_PER_BATCH = 64;
const MAX_CHARS_PER_BATCH = 200_000;

export function truncateForEmbedding(text: string): string {
  return text.length > MAX_CHARS_PER_INPUT ? text.slice(0, MAX_CHARS_PER_INPUT) : text;
}

// แบ่ง batch ตามทั้ง 2 เกณฑ์ (จำนวน + ตัวอักษรรวม) อันไหนถึงก่อนตัดก่อน
export function planBatches<T>(items: T[], getText: (item: T) => string): T[][] {
  const batches: T[][] = [];
  let current: T[] = [];
  let currentChars = 0;

  for (const item of items) {
    const length = Math.min(getText(item).length, MAX_CHARS_PER_INPUT);
    const wouldExceed =
      current.length >= MAX_ITEMS_PER_BATCH || currentChars + length > MAX_CHARS_PER_BATCH;
    if (current.length > 0 && wouldExceed) {
      batches.push(current);
      current = [];
      currentChars = 0;
    }
    current.push(item);
    currentChars += length;
  }
  if (current.length > 0) batches.push(current);
  return batches;
}

export interface EmbedResult {
  embeddings: number[][];
  promptTokens: number;
}

export async function embedTexts(texts: string[]): Promise<EmbedResult> {
  const response = await embeddingClient.embeddings.create({
    model: embeddingModelId,
    input: texts.map(truncateForEmbedding),
  });
  // API ไม่รับประกันลำดับ — เรียงตาม index ก่อนใช้เสมอ ไม่งั้น embedding สลับ passage กัน
  // แบบเงียบๆ (บั๊กที่หาเจอยากมากเพราะไม่ error แค่ผลลัพธ์ค้นหามั่ว)
  const sorted = [...response.data].sort((a, b) => a.index - b.index);
  return {
    embeddings: sorted.map((item) => item.embedding),
    promptTokens: response.usage?.prompt_tokens ?? 0,
  };
}

// pgvector รับ literal รูปแบบ '[0.1,0.2,...]' — สร้างจาก number ล้วนจึงไม่มีความเสี่ยง
// injection แม้จะต่อ string เอง
export function toVectorLiteral(embedding: number[]): string {
  return `[${embedding.join(",")}]`;
}
