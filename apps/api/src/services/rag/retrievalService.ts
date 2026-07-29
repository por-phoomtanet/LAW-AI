import { prisma } from "@law-ai/db";
import { thaiDigitsToArabic } from "@law-ai/core";

const TOP_K = 10;

interface RawPassageRow {
  passageId: number;
  documentId: number;
  documentTitle: string;
  sectionType: string;
  sectionNumber: string | null;
  content: string;
}

export interface RetrievedPassage {
  index: number; // 1-based — ตรงกับเลข [n] ที่บังคับให้โมเดลอ้างอิงในคำตอบ
  passageId: number;
  documentId: number;
  citationLabel: string;
  content: string;
}

export interface RetrievalResult {
  passages: RetrievedPassage[];
  contextBlock: string;
}

// ดึงเลขมาตราจากคำถามผู้ใช้ เช่น "มาตรา 420 พูดว่าไง" หรือ "มาตรา ๔๒๐" → "420"
function extractSectionNumber(query: string): string | null {
  const match = query.match(/มาตรา\s*([๐-๙0-9/]+)/);
  if (!match) return null;
  return thaiDigitsToArabic(match[1]);
}

// สร้าง tsquery แบบ OR ระหว่างคำ (ไม่ใช่ AND แบบ plainto_tsquery default) — ผู้ใช้พิมพ์เป็น
// คำถามเต็มประโยค ("สถาบัน คืออะไร") ไม่ใช่ keyword ล้วนๆ ถ้า AND ทุกคำ คำถามท้าย ๆ แบบ
// "คืออะไร"/"พูดว่าอย่างไร" ที่ไม่ปรากฏในตัวบทกฎหมายจริงจะทำให้ไม่แมตช์อะไรเลย ts_rank จะให้
// น้ำหนัก row ที่แมตช์หลายคำสูงกว่าอยู่แล้วโดยธรรมชาติ ไม่ต้องกังวลเรื่อง noise จากคำ OR ที่กว้างไป
function buildOrTsQuery(query: string): string {
  const tokens = query
    .split(/\s+/)
    .map((token) => token.replace(/[&|!():*'"?,.]/g, "").trim())
    .filter((token) => token.length > 0);
  return tokens.join(" | ");
}

function citationLabel(row: RawPassageRow): string {
  if (row.sectionType === "section" && row.sectionNumber) {
    return `มาตรา ${row.sectionNumber} (${row.documentTitle})`;
  }
  return row.documentTitle;
}

export const retrievalService = {
  // รับคำถามผู้ใช้ → full-text query (plainto_tsquery) บน Passage.searchVector join
  // Document/DocumentVersion (filter isLatest=true เท่านั้น กันตอบด้วยมาตราที่ถูกยกเลิกไปแล้ว)
  // + exact-match fast path ถ้า query ระบุเลขมาตราชัดเจน → merge ผลลัพธ์ (exact มาก่อน)
  async retrieve(query: string): Promise<RetrievalResult> {
    const orQuery = buildOrTsQuery(query);
    const fullTextRows = orQuery
      ? await prisma.$queryRaw<RawPassageRow[]>`
          SELECT p.id as "passageId", d.id as "documentId", d.title as "documentTitle",
                 p."sectionType" as "sectionType", p."sectionNumber" as "sectionNumber",
                 p.content as "content"
          FROM "Passage" p
          JOIN "DocumentVersion" v ON v.id = p."versionId"
          JOIN "Document" d ON d.id = v."documentId"
          WHERE v."isLatest" = true
            AND p."searchVector" @@ to_tsquery('simple', ${orQuery})
          ORDER BY ts_rank(p."searchVector", to_tsquery('simple', ${orQuery})) DESC
          LIMIT ${TOP_K}
        `
      : [];

    const sectionNumber = extractSectionNumber(query);
    const exactRows = sectionNumber
      ? await prisma.$queryRaw<RawPassageRow[]>`
          SELECT p.id as "passageId", d.id as "documentId", d.title as "documentTitle",
                 p."sectionType" as "sectionType", p."sectionNumber" as "sectionNumber",
                 p.content as "content"
          FROM "Passage" p
          JOIN "DocumentVersion" v ON v.id = p."versionId"
          JOIN "Document" d ON d.id = v."documentId"
          WHERE v."isLatest" = true
            AND p."sectionType" = 'section'
            AND p."sectionNumber" = ${sectionNumber}
          LIMIT 5
        `
      : [];

    // merge เอา exact match ขึ้นก่อนเสมอ, dedupe ด้วย passageId, cap ที่ TOP_K
    const seen = new Set<number>();
    const merged: RawPassageRow[] = [];
    for (const row of [...exactRows, ...fullTextRows]) {
      if (seen.has(row.passageId)) continue;
      seen.add(row.passageId);
      merged.push(row);
      if (merged.length >= TOP_K) break;
    }

    const passages: RetrievedPassage[] = merged.map((row, i) => ({
      index: i + 1,
      passageId: row.passageId,
      documentId: row.documentId,
      citationLabel: citationLabel(row),
      content: row.content,
    }));

    const contextBlock = passages
      .map((p) => `[${p.index}] ${p.citationLabel}: ${p.content}`)
      .join("\n\n");

    return { passages, contextBlock };
  },
};
