// แบ่งหมวด "กฎหมายหลัก"/"กฎหมายลำดับรอง" จาก docType — อ้างอิงจากที่ตรวจสอบมาแล้วว่า
// searchlaw/ocs-krisdika ใช้ prefix ชุดนี้ (ดู CLAUDE.md § Phase 4)
// อยู่ packages/core เพราะทั้ง apps/api (หน้าคลังกฎหมาย, สรุปหมวด) และ packages/ingestion
// (derive docType ตอน ingest จาก title prefix) ต้องใช้ list เดียวกัน — แยกไว้ 2 ที่เสี่ยง
// พิมพ์ผิด/ไม่ sync กัน
export const PRIMARY_LAW_TYPES = [
  "รัฐธรรมนูญ",
  "ประมวลกฎหมาย",
  "พระราชบัญญัติ",
  "พระราชบัญญัติประกอบรัฐธรรมนูญ",
  "พระราชกำหนด",
] as const;

export const SUBORDINATE_LAW_TYPES = [
  "พระราชกฤษฎีกา",
  "กฎกระทรวง",
  "ประกาศ",
  "ระเบียบ",
  "ข้อบังคับ",
  "คำสั่ง",
] as const;

export type LawCategory = "primary" | "subordinate";

export const LAW_CATEGORY_LABEL: Record<LawCategory, string> = {
  primary: "กฎหมายหลัก",
  subordinate: "กฎหมายลำดับรอง",
};

// ตรวจจาก title prefix จริงของ ocs-krisdika (ทดสอบกับข้อมูลปี 2019 ทั้งปี 285 ฉบับ
// ครอบคลุมครบทุก docType ที่เจอจริง) — ลำดับสำคัญ: "พระราชบัญญัติประกอบรัฐธรรมนูญ" ต้อง
// เช็คก่อน "พระราชบัญญัติ" เพราะเป็น prefix ซ้อนกัน (startsWith จะ match ตัวสั้นกว่าก่อนผิด)
const DOC_TYPE_PREFIXES = [
  "รัฐธรรมนูญ",
  "ประมวลกฎหมาย",
  "พระราชบัญญัติประกอบรัฐธรรมนูญ",
  "พระราชบัญญัติ",
  "พระราชกำหนด",
  "พระราชกฤษฎีกา",
  "กฎกระทรวง",
  "ระเบียบ",
  "ข้อบังคับ",
  "ประกาศ",
  "คำสั่ง",
] as const;

export function deriveDocType(title: string): string {
  for (const prefix of DOC_TYPE_PREFIXES) {
    if (title.startsWith(prefix)) return prefix;
  }
  return "อื่นๆ";
}

export function categorizeDocType(docType: string): LawCategory {
  return (PRIMARY_LAW_TYPES as readonly string[]).includes(docType) ? "primary" : "subordinate";
}
