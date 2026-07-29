import { Elysia, t } from "elysia";
import { authGuard } from "../plugins/authGuard";
import { conversationController } from "../controllers/conversationController";
import { conversationRepository } from "../repositories/conversationRepository";
import { chatCompletionService } from "../services/chat/chatCompletionService";
import { legalChatCompletionService } from "../services/chat/legalChatCompletionService";
import type { JwtPayload } from "../types/auth";

// ไม่ใส่ requirePermission — chat เปิดให้ทุก role ที่ login แล้ว (Dev Standard #11)
// permission row ของเมนู "chat" ที่ seed ไว้มีแค่ canView ไม่มี canCreate/canUpdate/canDelete
export const conversationRoutes = new Elysia({ prefix: "/api/conversations" })
  .use(authGuard)
  .get("/", conversationController.list)
  .post("/", conversationController.create, {
    body: t.Optional(
      t.Object({
        modelId: t.Optional(t.String()),
        mode: t.Optional(t.Union([t.Literal("general"), t.Literal("legal")])),
      }),
    ),
  })
  .get("/:id", conversationController.get, {
    params: t.Object({ id: t.String() }),
  })
  .delete("/:id", conversationController.remove, {
    params: t.Object({ id: t.String() }),
  })
  // เปลี่ยนโมเดลได้ตลอดแม้แชทไปแล้ว ไม่ใช่แค่ตอนสร้างบทสนทนาใหม่เท่านั้น (แก้ข้อจำกัดเดิมใน Phase 5.1)
  .patch("/:id/model", conversationController.updateModel, {
    params: t.Object({ id: t.String() }),
    body: t.Object({ modelId: t.String({ minLength: 1 }) }),
  })
  .post(
    "/:id/messages",
    // reuse /api/conversations/:id/messages เดิม แล้ว branch ตาม conversation.mode แทน
    // การแยก route prefix ใหม่ทั้งก้อน (Phase 5.5 — diff เล็กกว่า, ไม่ต้อง duplicate CRUD)
    // ไม่พบ/ไม่ใช่เจ้าของ → ปล่อยให้ chatCompletionService (ค่า default) ทำ ownership check
    // เองแล้ว throw NotFoundError ตามปกติ ไม่ต้อง duplicate การเช็คตรงนี้
    async ({
      params,
      body,
      user,
    }: {
      params: { id: string };
      body: { content: string };
      user: JwtPayload;
    }) => {
      const conversationId = Number(params.id);
      const conversation = await conversationRepository.findModeForUser(
        conversationId,
        user.userId,
      );
      const service =
        conversation?.mode === "legal" ? legalChatCompletionService : chatCompletionService;
      return service.streamReply(conversationId, user.userId, body.content);
    },
    {
      params: t.Object({ id: t.String() }),
      body: t.Object({ content: t.String({ minLength: 1 }) }),
    },
  );
