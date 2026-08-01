import { prisma } from "@law-ai/db";
import { thaiDigitsToArabic } from "@law-ai/core";
import { embeddingClient, embeddingModelId } from "../../clients/embeddingClient";

const TOP_K = 10;

// ถ้า embed คำถามล้มเหลว (ไม่มี key/quota หมด/OpenAI ล่ม) ให้ข้าม vector search แล้วใช้ 3 ขา
// เดิมต่อไป — แชทกฎหมายต้องไม่พังทั้งระบบเพราะ embedding เจ๊ง แต่ก็ไม่ควรยิง request ที่รู้ว่า
// จะ fail ทุกข้อความ: cooldown 60 วิหลังพลาด ค่อยลองใหม่
const EMBED_FAILURE_COOLDOWN_MS = 60_000;
let embedDisabledUntil = 0;

async function embedQuery(query: string): Promise<number[] | null> {
  if (Date.now() < embedDisabledUntil) return null;
  try {
    const response = await embeddingClient.embeddings.create({
      model: embeddingModelId,
      input: query,
    });
    return response.data[0]?.embedding ?? null;
  } catch (error) {
    embedDisabledUntil = Date.now() + EMBED_FAILURE_COOLDOWN_MS;
    console.error("[retrievalService] embed query failed, ข้าม vector search ชั่วคราว:", error);
    return null;
  }
}

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

// embed คำถาม → ค้นด้วย cosine distance (<=>) บน HNSW index ที่สร้างไว้ใน migration
// Phase 6.1 — คืน [] ถ้า embed ไม่สำเร็จ หรือยังไม่มี passage ไหนถูก backfill (embedding
// IS NOT NULL) เพื่อให้ระบบยังทำงานได้ด้วย 3 ขาเดิมระหว่างที่ backfill ยังไม่เสร็จ
async function embedVectorRows(query: string): Promise<RawPassageRow[]> {
  const embedding = await embedQuery(query);
  if (!embedding) return [];

  const literal = `[${embedding.join(",")}]`;
  return prisma.$queryRaw<RawPassageRow[]>`
    SELECT p.id as "passageId", d.id as "documentId", d.title as "documentTitle",
           p."sectionType" as "sectionType", p."sectionNumber" as "sectionNumber",
           p.content as "content"
    FROM "Passage" p
    JOIN "DocumentVersion" v ON v.id = p."versionId"
    JOIN "Document" d ON d.id = v."documentId"
    WHERE v."isLatest" = true
      AND p.embedding IS NOT NULL
    ORDER BY p.embedding <=> ${literal}::halfvec
    LIMIT ${TOP_K}
  `;
}

// Reciprocal Rank Fusion — วิธีมาตรฐานของ hybrid search สำหรับรวมผลจากหลาย ranking ที่
// คะแนนคนละหน่วยกันเทียบตรงๆ ไม่ได้ (ts_rank vs word_similarity vs cosine distance)
// แปลงเป็น "อันดับ" แล้วให้แต่ละขาโหวต: score = Σ 1/(K + rank) — เอกสารที่ติดอันดับดีจาก
// หลายขาพร้อมกันชนะ, เอกสารที่ขาเดียวมั่นใจมากๆ ก็ยังมีสิทธิ์ติดเข้ามา (ไม่ถูกเบียดตกทั้งหมด
// แบบการต่อ list ตามลำดับความสำคัญของขา)
// K=60 เป็นค่ามาตรฐานจากงานวิจัย RRF ดั้งเดิม — ยิ่ง K สูงยิ่งลดอิทธิพลของอันดับต้นๆ
const RRF_K = 60;

function fuseRrf(legs: RawPassageRow[][]): RawPassageRow[] {
  const scoreById = new Map<number, number>();
  const rowById = new Map<number, RawPassageRow>();

  for (const leg of legs) {
    leg.forEach((row, rank) => {
      rowById.set(row.passageId, row);
      const previous = scoreById.get(row.passageId) ?? 0;
      scoreById.set(row.passageId, previous + 1 / (RRF_K + rank + 1));
    });
  }

  return [...scoreById.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([passageId]) => rowById.get(passageId)!);
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
    const sectionNumber = extractSectionNumber(query);

    // ยิงทั้ง 4 ขาขนานกัน — vector search ต้องรอ embed คำถามจาก OpenAI ก่อน (network
    // round-trip ที่ full-text/trigram ไม่มี) ถ้าทำแบบ sequential latency จะบวกเข้าไปตรงๆ
    // ทุกข้อความ พอขนานกันแล้วเวลารวมเท่ากับขาที่ช้าที่สุดแทนที่จะเป็นผลรวม
    const [fullTextRows, exactRows, trigramRows, vectorRows] = await Promise.all([
      orQuery
        ? prisma.$queryRaw<RawPassageRow[]>`
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
        : [],

      sectionNumber
        ? prisma.$queryRaw<RawPassageRow[]>`
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
        : [],

      // pg_trgm fallback — 'simple' tsvector ตัดคำแค่ตามช่องว่าง/วรรคตอน ไม่มี Thai word
      // segmentation จริง ถ้าผู้ใช้พิมพ์คำติดกันคนละจุดกับที่ตัวบทต้นฉบับมีช่องว่างคั่นไว้
      // (เช่น พิมพ์ "พระราชบัญญัติกองทุนน้ำมันเชื้อเพลิง" ทั้งที่ตัวบทเก็บเป็น "พระราชบัญญัติ กองทุนน้ำมันเชื้อเพลิง"
      // สองคำแยกกัน) full-text search ข้างบนจะไม่แมตช์อะไรเลยแม้เอกสารจะมีอยู่จริง
      //
      // ⚠️ เทียบกับ "ชื่อเอกสาร" (Document.title) ไม่ใช่เนื้อ passage — เปลี่ยนตอน Phase 6
      // หลัง ingest เต็มคลัง (7,616 → 307,368 passages) แล้ววัดได้ว่าเวอร์ชันเดิมที่ยิงใส่
      // p.content ใช้เวลา 6.9 วินาที/query (EXPLAIN: GIN index ทำงานปกติ 3.9ms แต่ Bitmap
      // Heap Scan ต้องดึง content ก้อนใหญ่หมื่นแถวมาคำนวณ word_similarity ซ้ำ = 1.4s+)
      // ยิงใส่ title (2,973 แถว) ได้ผลลัพธ์อันดับ 1 ตัวเดียวกันเป๊ะ (similarity = 1.0) ใน 80ms
      // — เร็วขึ้น 86 เท่า และตรงเจตนามากกว่าด้วย เพราะขานี้มีไว้หา "กฎหมายชื่อนี้" ไม่ใช่หา
      // passage ที่บังเอิญพูดถึงชื่อกฎหมายนั้น
      prisma.$queryRaw<RawPassageRow[]>`
      WITH matched AS (
        SELECT d.id, word_similarity(${query}, d.title) AS sim
        FROM "Document" d
        WHERE word_similarity(${query}, d.title) > 0.4
        ORDER BY sim DESC
        LIMIT 3
      )
      SELECT p.id as "passageId", d.id as "documentId", d.title as "documentTitle",
             p."sectionType" as "sectionType", p."sectionNumber" as "sectionNumber",
             p.content as "content"
      FROM matched m
      JOIN "Document" d ON d.id = m.id
      JOIN "DocumentVersion" v ON v."documentId" = d.id AND v."isLatest" = true
      JOIN LATERAL (
        SELECT * FROM "Passage" px
        WHERE px."versionId" = v.id
        ORDER BY px.ordinal
        LIMIT 4
      ) p ON true
      ORDER BY m.sim DESC, p.ordinal
    `,

      // vector search (Phase 6) — ขาเดียวที่ "เข้าใจความหมาย" ไม่ได้จับคู่ตัวอักษร แก้เคสที่
      // 3 ขาบนทำไม่ได้เลย เช่นค้น "PDPA" (คำย่อภาษาอังกฤษที่ไม่เคยปรากฏในตัวบทไทยสักตัว
      // จึงไม่มีทั้ง token ตรงและ trigram ร่วม) ให้เจอ พ.ร.บ.คุ้มครองข้อมูลส่วนบุคคล
      embedVectorRows(query),
    ]);

    // exact match (เลขมาตราที่ผู้ใช้ระบุตรงๆ) ขึ้นก่อนเสมอ — แม่นที่สุดและมีไม่เกิน 5 รายการ
    // ที่เหลือ fuse ด้วย RRF ไม่ใช่ต่อกันตามลำดับขา เพราะการต่อแบบเดิมจะทำให้ vector ถูกเบียด
    // ตกไปทั้งหมด: คำถามอย่าง "กฎหมาย pdpa" ทำให้ full-text แมตช์คำว่า "กฎหมาย" ได้เป็นพันแถว
    // จนเต็ม TOP_K ตั้งแต่ขาแรก ผลลัพธ์จาก vector (ขาเดียวที่รู้ว่า PDPA = คุ้มครองข้อมูล
    // ส่วนบุคคล) จะไม่มีวันได้เข้ารอบเลย — RRF ให้ทุกขาช่วยกันโหวตตามอันดับแทน
    const seen = new Set<number>();
    const merged: RawPassageRow[] = [];
    for (const row of [...exactRows, ...fuseRrf([fullTextRows, trigramRows, vectorRows])]) {
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
