import { Elysia, t } from "elysia";
import { authGuard } from "../plugins/authGuard";
import { conversationController } from "../controllers/conversationController";
import { chatCompletionService } from "../services/chat/chatCompletionService";
import type { JwtPayload } from "../types/auth";

// ไม่ใส่ requirePermission — chat เปิดให้ทุก role ที่ login แล้ว (Dev Standard #11)
// permission row ของเมนู "chat" ที่ seed ไว้มีแค่ canView ไม่มี canCreate/canUpdate/canDelete
export const conversationRoutes = new Elysia({ prefix: "/api/conversations" })
  .use(authGuard)
  .get("/", conversationController.list)
  .post("/", conversationController.create, {
    body: t.Optional(t.Object({ modelId: t.Optional(t.String()) })),
  })
  .get("/:id", conversationController.get, {
    params: t.Object({ id: t.String() }),
  })
  .delete("/:id", conversationController.remove, {
    params: t.Object({ id: t.String() }),
  })
  .post(
    "/:id/messages",
    ({
      params,
      body,
      user,
    }: {
      params: { id: string };
      body: { content: string };
      user: JwtPayload;
    }) => chatCompletionService.streamReply(Number(params.id), user.userId, body.content),
    {
      params: t.Object({ id: t.String() }),
      body: t.Object({ content: t.String({ minLength: 1 }) }),
    },
  );
