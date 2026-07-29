import { Elysia } from "elysia";
import { authGuard } from "../plugins/authGuard";
import { aiModelController } from "../controllers/aiModelController";

// authGuard เท่านั้น — ใช้ร่วมกันทั้งแชททั่วไปและแชทกฎหมาย ไม่มี requirePermission เพิ่ม
export const aiModelRoutes = new Elysia({ prefix: "/api/ai-models" })
  .use(authGuard)
  .get("/", aiModelController.list);
