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

  create(userId: number, modelTier: string) {
    return prisma.conversation.create({ data: { userId, modelTier } });
  },

  softDelete(id: number) {
    return prisma.conversation.update({ where: { id }, data: { deletedAt: new Date() } });
  },

  appendMessage(data: {
    conversationId: number;
    role: "user" | "assistant";
    content: string;
    modelUsed?: string;
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
