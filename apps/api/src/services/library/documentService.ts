import { categorizeDocType, LAW_CATEGORY_LABEL, type LawCategory } from "@law-ai/core";
import { documentRepository } from "../../repositories/documentRepository";
import { NotFoundError } from "../../utils/errors";

interface TocNode {
  id: number;
  sectionType: string;
  sectionNumber: string | null;
  content: string;
  children: TocNode[];
}

// สร้าง tree หมวด→ส่วนที่→มาตรา จาก passage ที่เรียงตาม ordinal (flat) + parentId —
// ไม่ต้อง parse ข้อความเดาเพราะ parentId ผูกมาจาก sectionTypeId ตอน ingest แล้ว (ดู 4.2)
function buildToc(
  passages: {
    id: number;
    sectionType: string;
    sectionNumber: string | null;
    content: string;
    parentId: number | null;
  }[],
): TocNode[] {
  const nodeById = new Map<number, TocNode>();
  const roots: TocNode[] = [];

  for (const passage of passages) {
    nodeById.set(passage.id, {
      id: passage.id,
      sectionType: passage.sectionType,
      sectionNumber: passage.sectionNumber,
      content: passage.content,
      children: [],
    });
  }

  for (const passage of passages) {
    const node = nodeById.get(passage.id)!;
    if (passage.parentId != null && nodeById.has(passage.parentId)) {
      nodeById.get(passage.parentId)!.children.push(node);
    } else {
      roots.push(node);
    }
  }

  return roots;
}

export const documentService = {
  async list(docType?: string) {
    const [documents, countsByDocType] = await Promise.all([
      documentRepository.findMany(docType),
      documentRepository.countByDocType(),
    ]);

    // นับต่อ docType ก่อน แล้ว group รวมเป็น primary/subordinate สำหรับ sidebar 2 หมวดใหญ่
    const categoryCounts = new Map<LawCategory, number>();
    const docTypeCounts = countsByDocType.map((row) => {
      const category = categorizeDocType(row.docType);
      categoryCounts.set(category, (categoryCounts.get(category) ?? 0) + row._count._all);
      return { docType: row.docType, category, count: row._count._all };
    });

    return {
      categories: (Object.keys(LAW_CATEGORY_LABEL) as LawCategory[]).map((category) => ({
        category,
        label: LAW_CATEGORY_LABEL[category],
        count: categoryCounts.get(category) ?? 0,
      })),
      docTypes: docTypeCounts,
      documents,
    };
  },

  async getDetail(id: number) {
    const document = await documentRepository.findByIdWithLatestVersion(id);
    if (!document) {
      throw new NotFoundError("ไม่พบเอกสารกฎหมาย");
    }
    const version = document.versions[0];
    if (!version) {
      throw new NotFoundError("ไม่พบเวอร์ชันล่าสุดของเอกสารนี้");
    }

    return {
      id: document.id,
      lawCode: document.lawCode,
      title: document.title,
      docType: document.docType,
      citationCode: document.citationCode,
      version: {
        id: version.id,
        versionLabel: version.versionLabel,
        sourceUrl: version.sourceUrl,
        effectiveFrom: version.effectiveFrom,
      },
      toc: buildToc(version.passages),
    };
  },
};
