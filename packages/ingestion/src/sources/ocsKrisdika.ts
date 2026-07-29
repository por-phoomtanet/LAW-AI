// Parser สำหรับ ocs-krisdika dataset (open-law-data-thailand) — แยกออกจากการ download/DB
// เพื่อทดสอบ logic การจัดกลุ่มได้แบบ pure function
//
// sectionTypeId ตรวจสอบจากข้อมูลจริงแล้ว ตรงกับ TOC ที่เห็นใน UI อ้างอิงทุกรายการ ไม่ใช่การเดา:
//   1  = title (ชื่อกฎหมาย)              2  = royal_name (พระปรมาภิไธย)
//   3  = preamble (คำปรารภ)              4  = section (มาตรา)
//   8  = chapter (หมวด)                  9  = part (ส่วนที่)
//   13 = transitional (บทเฉพาะกาล)       14 = signatory (ผู้รับสนองพระบรมราชโองการ)
//   15 = note (หมายเหตุ)
import { thaiDigitsToArabic } from "@law-ai/core";

export interface RawSection {
  sectionId: number;
  sectionTypeId: number;
  contentNo: number;
  content: string;
}

export interface RawLawRecord {
  filename: string;
  law_code: string;
  timeline_code: string;
  category: string | null;
  title: string;
  is_latest: boolean;
  publish_date: string;
  year: string;
  month: string;
  reference_url: string;
  sections: RawSection[];
  raw_enc_id: string;
}

export type PassageSectionType =
  | "title"
  | "royal_name"
  | "preamble"
  | "section"
  | "chapter"
  | "part"
  | "transitional"
  | "signatory"
  | "note"
  | "other";

const SECTION_TYPE_MAP: Record<number, PassageSectionType> = {
  1: "title",
  2: "royal_name",
  3: "preamble",
  4: "section",
  8: "chapter",
  9: "part",
  13: "transitional",
  14: "signatory",
  15: "note",
};

// ดึงเลขมาตรา/หมวด/ส่วนที่ จากคำนำหน้าเนื้อหา เช่น "มาตรา ๙/๑ ..." → "9/1", "หมวด ๖ ..." → "6"
function extractNumber(content: string, prefix: "มาตรา" | "หมวด" | "ส่วนที่"): string | null {
  const pattern = new RegExp(`^${prefix}\\s*([๐-๙0-9/]+(?:\\s*(?:ทวิ|ตรี|จัตวา|เบญจ))?)`);
  const match = content.match(pattern);
  if (!match) return null;
  return thaiDigitsToArabic(match[1].trim());
}

export interface ParsedPassage {
  ordinal: number;
  sectionType: PassageSectionType;
  sectionNumber: string | null;
  content: string;
  parentOrdinal: number | null; // อ้างถึง ordinal ของ parent ใน array เดียวกัน — resolve เป็น id จริงตอน insert DB
}

// รวม row ที่ contentNo ต่อเนื่อง (2,3,4...) เข้ากับ row ก่อนหน้าเป็น 1 หน่วยเดียว
// contentNo กลับไปเป็น 1 = เริ่มหน่วยใหม่เสมอ (ไม่ว่า sectionTypeId จะเปลี่ยนหรือไม่)
// พิสูจน์จากข้อมูลจริง: "มาตรา ๔" นิยามยาวถูกตัดเป็น contentNo 1-4 ของ sectionTypeId เดียวกัน (4)
// ในขณะที่ "มาตรา ๕" ที่ตามมาก็เป็น sectionTypeId 4 เหมือนกันแต่ contentNo รีเซ็ตกลับเป็น 1
function groupSections(sections: RawSection[]): { sectionTypeId: number; content: string }[] {
  const groups: { sectionTypeId: number; content: string }[] = [];

  for (const section of sections) {
    if (section.contentNo === 1 || groups.length === 0) {
      groups.push({ sectionTypeId: section.sectionTypeId, content: section.content });
    } else {
      const last = groups[groups.length - 1];
      last.content = `${last.content} ${section.content}`;
    }
  }

  return groups;
}

export function parseLawRecord(raw: RawLawRecord): ParsedPassage[] {
  const groups = groupSections(raw.sections);
  const passages: ParsedPassage[] = [];

  // stack ของ container ที่ "เปิดอยู่" ตอนนี้ — มาตราที่เจอถัดไปจะผูกกับตัวบนสุดของ stack
  // เจอ chapter/transitional ใหม่ → เคลียร์ part เดิม (part เป็นลูกของ chapter เท่านั้น)
  let currentChapterOrdinal: number | null = null;
  let currentPartOrdinal: number | null = null;

  groups.forEach((group, index) => {
    const sectionType = SECTION_TYPE_MAP[group.sectionTypeId] ?? "other";

    let sectionNumber: string | null = null;
    let parentOrdinal: number | null = null;

    if (sectionType === "section") {
      sectionNumber = extractNumber(group.content, "มาตรา");
      parentOrdinal = currentPartOrdinal ?? currentChapterOrdinal;
    } else if (sectionType === "chapter") {
      sectionNumber = extractNumber(group.content, "หมวด");
      currentChapterOrdinal = index;
      currentPartOrdinal = null; // หมวดใหม่ → ส่วนที่เดิมไม่เกี่ยวข้องแล้ว
    } else if (sectionType === "part") {
      sectionNumber = extractNumber(group.content, "ส่วนที่");
      parentOrdinal = currentChapterOrdinal;
      currentPartOrdinal = index;
    } else if (sectionType === "transitional") {
      currentChapterOrdinal = index; // บทเฉพาะกาลทำหน้าที่เป็น container ระดับเดียวกับหมวด
      currentPartOrdinal = null;
    }

    passages.push({
      ordinal: index,
      sectionType,
      sectionNumber,
      content: group.content,
      parentOrdinal,
    });
  });

  return passages;
}
