import { prisma } from "@law-ai/db";

export const conversationRepository = {
  findManyByUser(userId: number) {
    return prisma.conversation.findMany({
      where: { userId, deletedAt: null },
      orderBy: { updatedAt: "desc" },
    });
  },

  findByIdForUser(id: number, userId: number) {
    return prisma.conversation.findFirst({
      where: { id, userId, deletedAt: null },
      include: { messages: { orderBy: { createdAt: "asc" } } },
    });
  },

  create(userId: number, modelTier: string, mode?: string) {
    return prisma.conversation.create({
      data: { userId, modelTier, ...(mode ? { mode } : {}) },
    });
  },

  // lookup เบาๆ แค่ mode — ใช้ตอน dispatch ว่าจะเรียก chatCompletionService (Phase 3) หรือ
  // legalChatCompletionService (Phase 5.5) โดยไม่ต้อง fetch messages ทั้งก้อนมาก่อน
  findModeForUser(id: number, userId: number) {
    return prisma.conversation.findFirst({
      where: { id, userId, deletedAt: null },
      select: { mode: true },
    });
  },

  softDelete(id: number) {
    return prisma.conversation.update({ where: { id }, data: { deletedAt: new Date() } });
  },

  // เปลี่ยนโมเดลได้ตลอดแม้แชทไปแล้ว (ยกเลิกข้อจำกัดเดิมที่ผูกโมเดลไว้แค่ตอนสร้างครั้งเดียว)
  // มีผลกับข้อความถัดไปเท่านั้น — ข้อความเก่าที่ persist แล้วยังเก็บ modelUsed ของตัวเองไว้ตามจริง
  updateModel(id: number, modelTier: string) {
    return prisma.conversation.update({ where: { id }, data: { modelTier } });
  },

  appendMessage(data: {
    conversationId: number;
    role: "user" | "assistant";
    content: string;
    modelUsed?: string;
    // เฉพาะแชทกฎหมาย (Phase 5.5) ใช้ — general chat ไม่เคยส่งมา ค่าเป็น undefined เหมือนเดิม
    citations?: object;
  }) {
    return prisma.message.create({ data });
  },

  // ใช้ updateMany + where title:null กัน race กรณีมีข้อความสองรอบพร้อมกัน — ถ้า title ถูกตั้งไปแล้วจะไม่ทับ
  setTitleIfEmpty(id: number, title: string) {
    return prisma.conversation.updateMany({
      where: { id, title: null },
      data: { title },
    });
  },

  // Message เป็นคนละ table กับ Conversation — updatedAt ของ Conversation ไม่ auto-bump ตอนเพิ่ม Message
  // ต้อง touch เองเพื่อให้ list เรียงตามบทสนทนาที่คุยล่าสุดได้ถูกต้อง
  touchUpdatedAt(id: number) {
    return prisma.conversation.update({ where: { id }, data: { updatedAt: new Date() } });
  },
};
