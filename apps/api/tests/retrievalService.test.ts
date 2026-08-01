import { describe, expect, test, beforeAll, mock } from "bun:test";

// ตั้งแต่ Phase 6 retrieve() embed คำถามผ่าน OpenAI ก่อนทำ vector search — ต้อง mock ตาม
// Dev Standard #7 (ห้ามเรียก API จริงใน test) mock.module ต้องมาก่อน import ของจริง จึงใช้
// dynamic import ใน beforeAll แทน static top-level import (pattern เดียวกับ chatCompletion.test.ts)
//
// ให้ embed โยน error เพื่อทดสอบ "graceful degradation" โดยเฉพาะ: vector search ต้องถูกข้าม
// แล้วผลลัพธ์ยังต้องมาจาก full-text/trigram ได้ครบเหมือนเดิม (เป็นเส้นทางที่จะเกิดจริงตอน
// OpenAI ล่ม/quota หมด — สำคัญกว่าการ mock ให้สำเร็จเพราะคุณภาพ vector จริงทดสอบด้วย mock ไม่ได้อยู่ดี)
mock.module("../src/clients/embeddingClient", () => ({
  embeddingClient: {
    embeddings: {
      create: async () => {
        throw new Error("mocked: ไม่เรียก OpenAI จริงใน test");
      },
    },
  },
  embeddingModelId: "text-embedding-3-large",
}));

let retrievalService: typeof import("../src/services/rag/retrievalService").retrievalService;

describe("retrievalService (Phase 5.4)", () => {
  beforeAll(async () => {
    ({ retrievalService } = await import("../src/services/rag/retrievalService"));
  });

  test("full-text query returns relevant passages ranked by ts_rank", async () => {
    const result = await retrievalService.retrieve("สถาบัน");

    expect(result.passages.length).toBeGreaterThan(0);
    expect(result.passages[0].index).toBe(1);
    expect(result.passages.every((p) => p.content.length > 0)).toBe(true);
    expect(result.contextBlock).toContain("[1]");
  });

  test("exact-match fast path surfaces the requested มาตรา number first", async () => {
    const result = await retrievalService.retrieve("มาตรา 7 พูดว่าอย่างไร");

    expect(result.passages.length).toBeGreaterThan(0);
    expect(result.passages[0].citationLabel).toContain("มาตรา 7");
  });

  test("no matches → empty passages, no throw", async () => {
    const result = await retrievalService.retrieve("zzzqqqxxxไม่มีทางเจอคำนี้แน่นอน123456789");

    expect(result.passages).toEqual([]);
    expect(result.contextBlock).toBe("");
  });

  test("context block format includes numbered citation labels", async () => {
    const result = await retrievalService.retrieve("สถาบัน");
    if (result.passages.length > 0) {
      expect(result.contextBlock).toContain(`[1] ${result.passages[0].citationLabel}`);
    }
  });
});
