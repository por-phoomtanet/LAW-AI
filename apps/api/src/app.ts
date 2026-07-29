import { Elysia } from "elysia";
import { cors } from "@elysiajs/cors";
import { prisma } from "@law-ai/db";
import { env } from "./utils/env";
import { errorHandler } from "./plugins/errorHandler";
import { authRoutes } from "./routes/auth";
import { userRoutes } from "./routes/users";
import { rolePermissionRoutes } from "./routes/rolePermissions";
import { conversationRoutes } from "./routes/conversations";
import { documentRoutes } from "./routes/documents";

const startedAt = Date.now();

// สร้าง Elysia instance ที่นี่ — ไม่เรียก .listen() ในไฟล์นี้
// เพื่อให้ test เรียก app.handle(new Request(...)) ได้โดยไม่ bind port จริง
export const app = new Elysia()
  .use(errorHandler)
  .use(cors({ origin: env.WEB_ORIGIN, credentials: true }))
  .use(authRoutes)
  .use(userRoutes)
  .use(rolePermissionRoutes)
  .use(conversationRoutes)
  .use(documentRoutes)
  .get("/api/health", async ({ set }) => {
    try {
      await prisma.$queryRaw`SELECT 1`;
      return {
        status: "ok",
        db: "connected",
        uptime: Math.floor((Date.now() - startedAt) / 1000),
      };
    } catch {
      set.status = 500;
      return {
        status: "error",
        db: "disconnected",
        uptime: Math.floor((Date.now() - startedAt) / 1000),
      };
    }
  });

export type App = typeof app;
