import { Elysia, t } from "elysia";
import { authGuard } from "../plugins/authGuard";
import { requirePermission } from "../plugins/roleGuard";
import { userController } from "../controllers/userController";

export const userRoutes = new Elysia({ prefix: "/api/users" })
  .use(authGuard)
  .get("/", userController.list, {
    query: t.Object({ status: t.Optional(t.Union([t.Literal("active"), t.Literal("all")])) }),
    beforeHandle: requirePermission("users", "canView"),
  })
  .post("/", userController.create, {
    body: t.Object({
      name: t.String({ minLength: 1 }),
      email: t.String({ format: "email" }),
      password: t.String({ minLength: 8 }),
      roleId: t.Integer(),
    }),
    beforeHandle: requirePermission("users", "canCreate"),
  })
  .put("/:id", userController.update, {
    params: t.Object({ id: t.String() }),
    body: t.Object({
      name: t.Optional(t.String({ minLength: 1 })),
      email: t.Optional(t.String({ format: "email" })),
      password: t.Optional(t.String({ minLength: 8 })),
      roleId: t.Optional(t.Integer()),
      isActive: t.Optional(t.Boolean()),
    }),
    beforeHandle: requirePermission("users", "canUpdate"),
  })
  .delete("/:id", userController.remove, {
    params: t.Object({ id: t.String() }),
    beforeHandle: requirePermission("users", "canDelete"),
  });
