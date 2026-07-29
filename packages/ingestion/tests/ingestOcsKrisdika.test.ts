import { describe, test, expect, afterAll } from "bun:test";
import { prisma } from "@law-ai/db";
import { ingestRecord } from "../src/ingestOcsKrisdika";
import type { RawLawRecord } from "../src/sources/ocsKrisdika";

// ไม่ต้อง mock อะไรเลย — เวอร์ชันตัดทอนนี้ไม่มี embedding/OpenAI call และไม่มี
// soc-ratchakitcha fallback (ตัดออกตาม CLAUDE.md § Phase 4) เป็น integration test
// ตรงกับ Postgres จริงล้วนๆ (Dev Standard #7 อนุญาตเพราะไม่มี external paid API เกี่ยวข้อง)
function makeFixture(overrides: Partial<RawLawRecord> = {}): RawLawRecord {
  return {
    filename: "test.json",
    law_code: "TEST-001",
    timeline_code: "TEST-001-00",
    category: null,
    title: "พระราชบัญญัติทดสอบ พ.ศ. 2500",
    is_latest: true,
    publish_date: "2000-01-01",
    year: "2000",
    month: "01",
    reference_url: "https://example.com/test",
    raw_enc_id: "test-enc-id",
    sections: [
      { sectionId: 1, sectionTypeId: 1, contentNo: 1, content: "พระราชบัญญัติทดสอบ พ.ศ. 2500" },
      { sectionId: 2, sectionTypeId: 8, contentNo: 1, content: "หมวด ๑ บททั่วไป" },
      { sectionId: 3, sectionTypeId: 4, contentNo: 1, content: "มาตรา ๑ ทดสอบมาตราหนึ่ง" },
      { sectionId: 4, sectionTypeId: 4, contentNo: 1, content: "มาตรา ๒ ทดสอบมาตราสอง" },
    ],
    ...overrides,
  };
}

async function cleanupLawCode(lawCode: string) {
  const doc = await prisma.document.findUnique({ where: { lawCode } });
  if (doc) {
    await prisma.passage.deleteMany({
      where: { version: { documentId: doc.id } },
    });
    await prisma.documentVersion.deleteMany({ where: { documentId: doc.id } });
    await prisma.document.delete({ where: { id: doc.id } });
  }
}

const TEST_LAW_CODE = `TEST-ingest-${Date.now()}`;

describe("ingestRecord (Phase 4.2)", () => {
  afterAll(async () => {
    await cleanupLawCode(TEST_LAW_CODE);
  });

  test("ingest ฉบับใหม่ → Document+DocumentVersion+Passage ตรงจำนวน + hierarchy ผูกถูก", async () => {
    const outcome = await ingestRecord(
      makeFixture({ law_code: TEST_LAW_CODE, timeline_code: `${TEST_LAW_CODE}-00` }),
    );

    expect(outcome).not.toBeNull();
    expect(outcome?.passagesUpserted).toBe(4); // title + หมวด 1 + มาตรา 1 + มาตรา 2
    expect(outcome?.passagesSkippedUnchanged).toBe(0);

    const document = await prisma.document.findUniqueOrThrow({
      where: { lawCode: TEST_LAW_CODE },
    });
    expect(document.docType).toBe("พระราชบัญญัติ");

    const version = await prisma.documentVersion.findFirstOrThrow({
      where: { documentId: document.id },
    });
    const passages = await prisma.passage.findMany({
      where: { versionId: version.id },
      orderBy: { ordinal: "asc" },
    });
    const chapter = passages.find((p) => p.sectionType === "chapter");
    const sections = passages.filter((p) => p.sectionType === "section");
    expect(chapter).toBeDefined();
    expect(sections).toHaveLength(2);
    // มาตรา 1/2 ต้องผูกเป็นลูกของหมวด 1 (parentId = chapter.id) ไม่ใช่ null
    expect(sections.every((s) => s.parentId === chapter?.id)).toBe(true);
    expect(sections.map((s) => s.sectionNumber)).toEqual(["1", "2"]);
  });

  test("ingest record ซ้ำโดยเนื้อหาไม่เปลี่ยน → dedupe เห็น contentHash ตรงเดิมครบทุก passage", async () => {
    const outcome = await ingestRecord(
      makeFixture({ law_code: TEST_LAW_CODE, timeline_code: `${TEST_LAW_CODE}-00` }),
    );
    expect(outcome?.passagesSkippedUnchanged).toBe(4);
  });

  test("เพิ่มเวอร์ชันใหม่ → เวอร์ชันเก่าใน document เดียวกันถูกตั้ง isLatest=false อัตโนมัติ", async () => {
    await ingestRecord(
      makeFixture({
        law_code: TEST_LAW_CODE,
        timeline_code: `${TEST_LAW_CODE}-01`,
        sections: [
          { sectionId: 1, sectionTypeId: 1, contentNo: 1, content: "พระราชบัญญัติทดสอบ (แก้ไข)" },
          { sectionId: 2, sectionTypeId: 4, contentNo: 1, content: "มาตรา ๑ แก้ไขแล้ว" },
        ],
      }),
    );

    const document = await prisma.document.findUniqueOrThrow({
      where: { lawCode: TEST_LAW_CODE },
    });
    const versions = await prisma.documentVersion.findMany({
      where: { documentId: document.id },
      orderBy: { versionLabel: "asc" },
    });

    expect(versions.length).toBe(2);
    const latestVersions = versions.filter((v) => v.isLatest);
    expect(latestVersions.length).toBe(1); // ต้องมี isLatest=true แค่ 1 เวอร์ชันเท่านั้น
    expect(latestVersions[0].versionLabel).toBe(`${TEST_LAW_CODE}-01`);
  });

  test("real-world bug: raw source ประกาศ is_latest:true พร้อมกันทุก record → ต้องเหลือ isLatest=true แค่ตัวเดียวเสมอ ไม่ว่าจะประมวลผลลำดับไหน", async () => {
    const lawCode = `${TEST_LAW_CODE}-multitrue`;

    // จำลอง 3 record ของกฎหมายเดียวกัน "ทุกตัว" ประกาศ is_latest:true แต่ประมวลผล
    // "สลับลำดับ" กับเลข suffix โดยตั้งใจ (-02 ก่อน, -00, แล้วค่อย -01) — พิสูจน์ว่า
    // timeline_code suffix ตัดสินผลลัพธ์จริง ไม่ใช่ "ลำดับไฟล์"
    for (const suffix of ["02", "00", "01"]) {
      await ingestRecord(
        makeFixture({
          law_code: lawCode,
          timeline_code: `${lawCode}-${suffix}`,
          is_latest: true,
          sections: [{ sectionId: 1, sectionTypeId: 1, contentNo: 1, content: `ทดสอบ ${suffix}` }],
        }),
      );
    }

    const document = await prisma.document.findUniqueOrThrow({ where: { lawCode } });
    const versions = await prisma.documentVersion.findMany({ where: { documentId: document.id } });

    expect(versions.length).toBe(3);
    const latestVersions = versions.filter((v) => v.isLatest);
    expect(latestVersions.length).toBe(1);
    // -02 ต้องชนะเพราะมี suffix สูงสุด แม้ถูกประมวลผล "ก่อน" -00/-01 ก็ตาม
    expect(latestVersions[0].versionLabel).toBe(`${lawCode}-02`);

    await cleanupLawCode(lawCode);
  });

  test("sections ว่างเปล่า (ทั้งหมดเป็นช่องว่าง) → ยังคง insert ได้ปกติ ไม่ throw", async () => {
    const lawCode = `${TEST_LAW_CODE}-blankcontent`;

    const outcome = await ingestRecord(
      makeFixture({
        law_code: lawCode,
        timeline_code: `${lawCode}-00`,
        sections: [
          { sectionId: 1, sectionTypeId: 1, contentNo: 1, content: "พระราชบัญญัติทดสอบว่างเปล่า" },
          { sectionId: 2, sectionTypeId: 4, contentNo: 1, content: "   " },
          { sectionId: 3, sectionTypeId: 4, contentNo: 1, content: "มาตรา ๒ เนื้อหาปกติ" },
        ],
      }),
    );

    expect(outcome?.passagesUpserted).toBe(3);
    await cleanupLawCode(lawCode);
  });

  test("record ที่ sections ว่างเปล่าทั้งหมด (array ว่าง) → คืน null (skip, ไม่ throw)", async () => {
    const outcome = await ingestRecord(
      makeFixture({ law_code: "TEST-empty-sections", sections: [] }),
    );
    expect(outcome).toBeNull();
  });
});
