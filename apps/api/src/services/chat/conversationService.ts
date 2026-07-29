import { conversationRepository } from "../../repositories/conversationRepository";
import { NotFoundError } from "../../utils/errors";
import { env } from "../../utils/env";

export const conversationService = {
  list(userId: number) {
    return conversationRepository.findManyByUser(userId);
  },

  // ตั้ง modelTier จาก env.OPENROUTER_MODEL ตรงนี้เอง ไม่พึ่ง default ของ Prisma column
  // (Dev Standard #1 — ห้าม hardcode model id, อ่านจาก env เสมอเพื่อสลับโมเดลได้โดยไม่ deploy ใหม่)
  create(userId: number) {
    return conversationRepository.create(userId, env.OPENROUTER_MODEL);
  },

  async getWithMessages(id: number, userId: number) {
    const conversation = await conversationRepository.findByIdForUser(id, userId);
    if (!conversation) {
      throw new NotFoundError("ไม่พบบทสนทนา");
    }
    return conversation;
  },

  async remove(id: number, userId: number) {
    const conversation = await conversationRepository.findByIdForUser(id, userId);
    if (!conversation) {
      throw new NotFoundError("ไม่พบบทสนทนา");
    }
    await conversationRepository.softDelete(id);
  },
};
