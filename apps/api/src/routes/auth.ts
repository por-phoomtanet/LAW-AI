import { Elysia, t } from "elysia";
import { jwtPlugin } from "../plugins/jwt";
import { authController } from "../controllers/authController";

export const authRoutes = new Elysia({ prefix: "/api/auth" })
  .use(jwtPlugin)
  .post("/login", authController.login, {
    body: t.Object({
      email: t.String({ format: "email" }),
      password: t.String({ minLength: 1 }),
    }),
  });
