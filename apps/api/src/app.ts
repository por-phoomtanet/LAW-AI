import { Elysia } from "elysia";
import { prisma } from "@law-ai/db";
import { errorHandler } from "./plugins/errorHandler";

const startedAt = Date.now();

// สร้าง Elysia instance ที่นี่ — ไม่เรียก .listen() ในไฟล์นี้
// เพื่อให้ test เรียก app.handle(new Request(...)) ได้โดยไม่ bind port จริง
export const app = new Elysia().use(errorHandler).get("/api/health", async ({ set }) => {
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
