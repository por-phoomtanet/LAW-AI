import crypto from "crypto";
import { prisma } from "@law-ai/db";
import { deriveDocType } from "@law-ai/core";
import { parseLawRecord, type RawLawRecord } from "./sources/ocsKrisdika";

const HF_BASE =
  "https://huggingface.co/datasets/open-law-data-thailand/ocs-krisdika/resolve/main/data";

function sha256(text: string): string {
  return crypto.createHash("sha256").update(text).digest("hex");
}

// timeline_code มีรูปแบบ "{lawCode}-{NN}" — เลขท้ายคือลำดับเวอร์ชัน ใช้แทน record.is_latest
// ที่พิสูจน์แล้วว่าเชื่อไม่ได้ (ทุกเวอร์ชันของกฎหมายที่มีหลายเวอร์ชันใน dataset ประกาศ
// "is_latest": true พร้อมกันหมด เป็น bug เชิงระบบของ dataset ไม่ใช่ edge case เฉพาะจุด)
// ไม่มี match → 0 (versionLabel ที่ไม่มี suffix ตัวเลขทั้งหมดจะเสมอกันที่ 0 ยอมรับได้)
function extractVersionSuffix(versionLabel: string): number {
  const match = versionLabel.match(/-(\d+)$/);
  return match ? parseInt(match[1], 10) : 0;
}

export interface IngestResult {
  documents: number;
  versions: number;
  passagesUpserted: number;
  passagesSkippedNoSections: number;
  passagesSkippedUnchanged: number;
  // 1 record ล้มเหลวไม่ควรทำให้ record อื่นในเดือนเดียวกันพลอยไม่ถูก ingest ไปด้วย —
  // เก็บ error ไว้รายงานแทนการ throw ทิ้งทั้ง batch
  errors: { lawCode: string; timelineCode: string; message: string }[];
}

async function downloadMonth(year: string, month: string): Promise<RawLawRecord[]> {
  const url = `${HF_BASE}/${year}/${year}-${month}.jsonl`;
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`ดาวน์โหลดไม่สำเร็จ: ${url} (HTTP ${response.status})`);
  }
  const text = await response.text();
  if (!text.trim()) return [];
  return text
    .trim()
    .split("\n")
    .map((line) => JSON.parse(line) as RawLawRecord);
}

// ingest 1 record (= 1 เวอร์ชันของกฎหมาย 1 ฉบับ) เข้า Document/DocumentVersion/Passage
// คืนค่า null ถ้า sections ว่าง (~24.6% ของ ocs-krisdika — ประกาศ/ระเบียบเกือบทั้งหมด) —
// scope รอบนี้ไม่ทำ soc-ratchakitcha OCR fallback (ดู CLAUDE.md § Phase 4) แค่ skip พร้อม log
export async function ingestRecord(record: RawLawRecord): Promise<{
  versions: 1;
  passagesUpserted: number;
  passagesSkippedUnchanged: number;
} | null> {
  if (!record.sections?.length) {
    return null;
  }
  const parsedPassages = parseLawRecord(record);

  const docType = deriveDocType(record.title);

  // upsert Document ด้วย lawCode — กลุ่มทุกเวอร์ชันของกฎหมายฉบับเดียวกันเข้าด้วยกัน
  const document = await prisma.document.upsert({
    where: { lawCode: record.law_code },
    create: { lawCode: record.law_code, title: record.title, docType },
    update: { title: record.title, docType },
  });

  const versionContentHash = sha256(JSON.stringify(parsedPassages));
  // isLatest ที่ตั้งตรงนี้เป็นแค่ค่าเริ่มต้นชั่วคราว — คำนวณจริงจาก timeline_code suffix
  // ทันทีหลัง upsert ข้างล่าง (ไม่เชื่อ record.is_latest ตรงๆ — ดูหมายเหตุที่ extractVersionSuffix)
  const version = await prisma.documentVersion.upsert({
    where: {
      documentId_versionLabel: { documentId: document.id, versionLabel: record.timeline_code },
    },
    create: {
      documentId: document.id,
      versionLabel: record.timeline_code,
      externalId: record.raw_enc_id,
      sourceUrl: record.reference_url,
      effectiveFrom: record.publish_date ? new Date(record.publish_date) : null,
      isLatest: false,
      contentHash: versionContentHash,
    },
    update: {
      sourceUrl: record.reference_url,
      contentHash: versionContentHash,
    },
  });

  // ⚠️ ป้องกันมีหลายเวอร์ชัน isLatest=true พร้อมกันในกฎหมายเดียวกัน — ต้อง filter isLatest
  // เสมอตอน query ไม่งั้นแสดงมาตราที่ถูกยกเลิกไปแล้ว หาตัวจริงจาก timeline_code suffix
  // ตัวเลขสูงสุดในบรรดาทุกเวอร์ชันของเอกสารนี้ (order-independent, idempotent)
  const siblingVersions = await prisma.documentVersion.findMany({
    where: { documentId: document.id },
    select: { id: true, versionLabel: true },
  });
  const withSuffix = siblingVersions.map((v) => ({
    ...v,
    suffix: extractVersionSuffix(v.versionLabel),
  }));
  const maxSuffix = Math.max(...withSuffix.map((v) => v.suffix));
  const trueLatestId = withSuffix.find((v) => v.suffix === maxSuffix)!.id;

  await prisma.documentVersion.updateMany({
    where: { documentId: document.id, id: trueLatestId },
    data: { isLatest: true },
  });
  await prisma.documentVersion.updateMany({
    where: { documentId: document.id, id: { not: trueLatestId } },
    data: { isLatest: false },
  });

  const existingPassages = await prisma.passage.findMany({
    where: { versionId: version.id },
    select: { ordinal: true, contentHash: true },
  });
  const existingByOrdinal = new Map(existingPassages.map((p) => [p.ordinal, p]));

  const idByOrdinal = new Map<number, number>();
  let skippedUnchanged = 0;

  // ต้อง insert เรียงตาม ordinal เสมอ — parentId ของแถวหลังอ้างถึง id ของแถวก่อนหน้า
  // ที่เพิ่ง upsert ไป (หมวด/ส่วนที่ต้องมี id อยู่แล้วก่อนมาตราลูกจะ resolve parentId ได้)
  for (const passage of parsedPassages) {
    const contentHash = sha256(passage.content);
    const parentId =
      passage.parentOrdinal != null ? (idByOrdinal.get(passage.parentOrdinal) ?? null) : null;

    const upserted = await prisma.passage.upsert({
      where: { versionId_ordinal: { versionId: version.id, ordinal: passage.ordinal } },
      create: {
        versionId: version.id,
        ordinal: passage.ordinal,
        sectionType: passage.sectionType,
        sectionNumber: passage.sectionNumber,
        parentId,
        content: passage.content,
        contentHash,
      },
      update: {
        sectionType: passage.sectionType,
        sectionNumber: passage.sectionNumber,
        parentId,
        content: passage.content,
        contentHash,
      },
    });
    idByOrdinal.set(passage.ordinal, upserted.id);

    if (existingByOrdinal.get(passage.ordinal)?.contentHash === contentHash) {
      skippedUnchanged++;
    }
  }

  return {
    versions: 1,
    passagesUpserted: parsedPassages.length,
    passagesSkippedUnchanged: skippedUnchanged,
  };
}

export async function ingestOcsKrisdikaMonth(year: string, month: string): Promise<IngestResult> {
  const records = await downloadMonth(year, month);
  const result: IngestResult = {
    documents: 0,
    versions: 0,
    passagesUpserted: 0,
    passagesSkippedNoSections: 0,
    passagesSkippedUnchanged: 0,
    errors: [],
  };

  const seenLawCodes = new Set<string>();

  for (const record of records) {
    try {
      const outcome = await ingestRecord(record);
      if (!outcome) {
        result.passagesSkippedNoSections++;
        continue;
      }
      seenLawCodes.add(record.law_code);
      result.versions += outcome.versions;
      result.passagesUpserted += outcome.passagesUpserted;
      result.passagesSkippedUnchanged += outcome.passagesSkippedUnchanged;
    } catch (err) {
      // ไม่ throw ทิ้งทั้ง batch — 1 ฉบับพังไม่ควรทำให้ที่เหลือในเดือนเดียวกันไม่ได้ ingest
      // (Document/DocumentVersion ของ record นี้อาจถูก upsert ไปแล้วก่อน error เกิด — ไม่เป็นไร
      // เพราะ idempotent, รันซ้ำจะซ่อมต่อจากจุดที่ค้างได้เอง)
      result.errors.push({
        lawCode: record.law_code,
        timelineCode: record.timeline_code,
        message: err instanceof Error ? err.message : String(err),
      });
    }
  }

  result.documents = seenLawCodes.size;
  return result;
}
