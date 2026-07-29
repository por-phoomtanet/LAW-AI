import { conversationRepository } from "../../repositories/conversationRepository";
import { aiModelRepository } from "../../repositories/aiModelRepository";
import { HttpError, NotFoundError } from "../../utils/errors";
import { env } from "../../utils/env";

export const conversationService = {
  list(userId: number) {
    return conversationRepository.findManyByUser(userId);
  },

  // ตั้ง modelTier จาก env.OPENROUTER_MODEL เป็น default ถ้าไม่ระบุ modelId มา (Dev Standard #1
  // — ห้าม hardcode model id, อ่านจาก env เสมอเพื่อสลับโมเดลได้โดยไม่ deploy ใหม่) ถ้าผู้ใช้ระบุ
  // modelId มา (Phase 5.1) ต้อง validate กับ AiModel ที่ isActive=true ก่อนเสมอ กัน client ส่ง
  // model id ที่ไม่ได้เปิดให้ใช้/ไม่มีอยู่จริงตรงเข้า OpenRouter
  // mode (Phase 5.3/5.5) แยกแชททั่วไป/แชทกฎหมาย — ไม่ส่งมา default "general" เหมือนเดิมทุกอย่าง
  async create(userId: number, modelId?: string, mode?: string) {
    if (!modelId) {
      return conversationRepository.create(userId, env.OPENROUTER_MODEL, mode);
    }
    const model = await aiModelRepository.findActiveByModelId(modelId);
    if (!model) {
      throw new HttpError(400, "โมเดลที่เลือกไม่พร้อมใช้งาน");
    }
    return conversationRepository.create(userId, model.modelId, mode);
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

  // เปลี่ยนโมเดลได้ตลอดแม้แชทไปแล้ว — validate ownership + modelId active เหมือน create()
  async updateModel(id: number, userId: number, modelId: string) {
    const conversation = await conversationRepository.findByIdForUser(id, userId);
    if (!conversation) {
      throw new NotFoundError("ไม่พบบทสนทนา");
    }
    const model = await aiModelRepository.findActiveByModelId(modelId);
    if (!model) {
      throw new HttpError(400, "โมเดลที่เลือกไม่พร้อมใช้งาน");
    }
    return conversationRepository.updateModel(id, model.modelId);
  },
};
