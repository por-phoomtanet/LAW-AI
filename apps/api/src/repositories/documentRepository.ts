import { prisma } from "@law-ai/db";

export const documentRepository = {
  findMany(docType?: string) {
    return prisma.document.findMany({
      where: { isActive: true, ...(docType ? { docType } : {}) },
      orderBy: { title: "asc" },
    });
  },

  countByDocType() {
    return prisma.document.groupBy({
      by: ["docType"],
      where: { isActive: true },
      _count: { _all: true },
    });
  },

  findByIdWithLatestVersion(id: number) {
    return prisma.document.findFirst({
      where: { id, isActive: true },
      include: {
        versions: {
          where: { isLatest: true },
          include: { passages: { orderBy: { ordinal: "asc" } } },
        },
      },
    });
  },

  // เบาๆ ไม่ดึง passages — ใช้ render tab bar เลือกเวอร์ชันฝั่ง web (เทียบ fourcorners.law)
  findByIdWithVersions(id: number) {
    return prisma.document.findFirst({
      where: { id, isActive: true },
      include: {
        versions: {
          orderBy: { effectiveFrom: "asc" },
          select: { id: true, versionLabel: true, effectiveFrom: true, isLatest: true },
        },
      },
    });
  },

  // documentId กันเอกสารอื่นสวม versionId ของเอกสารที่ไม่ใช่ตัวเอง
  findVersionWithPassages(documentId: number, versionId: number) {
    return prisma.documentVersion.findFirst({
      where: { id: versionId, documentId },
      include: { passages: { orderBy: { ordinal: "asc" } } },
    });
  },
};
