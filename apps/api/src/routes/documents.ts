import { Elysia, t } from "elysia";
import { authGuard } from "../plugins/authGuard";
import { documentController } from "../controllers/documentController";

// authGuard เท่านั้น — เมนู library มี canView ให้ทุก role ที่ login แล้วตาม seed เดิม
// (ดู Dev Standard #11) ไม่ต้อง requirePermission เพิ่ม
export const documentRoutes = new Elysia({ prefix: "/api/documents" })
  .use(authGuard)
  .get("/", documentController.list, {
    query: t.Object({ docType: t.Optional(t.String()) }),
  })
  .get("/:id", documentController.get, {
    params: t.Object({ id: t.String() }),
    query: t.Object({ versionId: t.Optional(t.String()) }),
  });
