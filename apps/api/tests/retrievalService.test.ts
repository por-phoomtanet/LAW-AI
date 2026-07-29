import { describe, expect, test } from "bun:test";
import { retrievalService } from "../src/services/rag/retrievalService";

// integration test ตรงกับ Postgres จริง (ข้อมูล ingest ไว้แล้วจาก Phase 4.2) — ไม่มี external
// paid API เกี่ยวข้องเลย (ไม่เรียก OpenRouter/OpenAI) จึงไม่ต้อง mock ตาม Dev Standard #7
describe("retrievalService (Phase 5.4)", () => {
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
