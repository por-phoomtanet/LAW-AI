import { Elysia, t } from "elysia";
import { authGuard } from "../plugins/authGuard";
import { requirePermission } from "../plugins/roleGuard";
import { rolePermissionController } from "../controllers/rolePermissionController";

export const rolePermissionRoutes = new Elysia({ prefix: "/api/role-permissions" })
  .use(authGuard)
  // ดึง permission ทั้งหมด (ทุก role ทุกเมนู) — ใช้ในหน้าตั้งค่า role permission (admin เท่านั้น)
  .get("/", rolePermissionController.listAll, {
    beforeHandle: requirePermission("settings", "canView"),
  })
  // ดึง permission ของ role หนึ่ง — ทุกคนที่ login แล้วเรียกได้ (ใช้ build sidebar ของตัวเอง)
  .get("/:role", rolePermissionController.listByRole, {
    params: t.Object({ role: t.String() }),
  })
  // แก้ไข permission — admin เท่านั้น
  .put("/:role/:menuKey", rolePermissionController.update, {
    params: t.Object({ role: t.String(), menuKey: t.String() }),
    body: t.Object({
      canView: t.Optional(t.Boolean()),
      canCreate: t.Optional(t.Boolean()),
      canUpdate: t.Optional(t.Boolean()),
      canDelete: t.Optional(t.Boolean()),
    }),
    beforeHandle: requirePermission("settings", "canUpdate"),
  });
