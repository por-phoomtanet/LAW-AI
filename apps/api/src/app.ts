import { Elysia } from "elysia";
import { prisma } from "@law-ai/db";
import { HttpError } from "./utils/errors";

const startedAt = Date.now();

// สร้าง Elysia instance ที่นี่ — ไม่เรียก .listen() ในไฟล์นี้
// เพื่อให้ test เรียก app.handle(new Request(...)) ได้โดยไม่ bind port จริง
export const app = new Elysia()
  .onError(({ code, error, set }) => {
    if (code === "VALIDATION") {
      set.status = 400;
      return { error: error.message };
    }
    if (error instanceof HttpError) {
      set.status = error.status;
      return { error: error.message };
    }
    set.status = 500;
    return { error: "Internal server error" };
  })
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
