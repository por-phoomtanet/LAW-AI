import { Elysia } from "elysia";
import { jwtPlugin } from "./jwt";
import { UnauthorizedError } from "../utils/errors";
import type { JwtPayload } from "../types/auth";

// ตรวจสอบ JWT + แนบ user เข้า context — ใช้ .use() เฉพาะ route group ที่ต้อง login
// (ห้าม mount รวมกับ login route เพราะ login ต้องเรียกได้โดยไม่มี token มาก่อน)
//
// หมายเหตุ: .derive() เป็น local scope โดย default เหมือน .onError() — ต้องระบุ scope
// เอง แต่ห้ามใช้ { as: "global" } ที่นี่! global จะไหลขึ้นไปถึง app หลักและบังคับ
// ทุก route (รวมถึง /api/health, login) ให้ต้องมี token ไปด้วย ("global" ไหลขึ้น
// ทะลุทุกชั้นที่ .use() ต่อกันไปเรื่อยๆ ไม่ใช่แค่ตัวที่ .use() โดยตรง)
// ต้องใช้ { as: "scoped" } แทน — จำกัดผลแค่ instance นี้ + parent ที่ .use() เข้าไปโดยตรง
// เท่านั้น (พิสูจน์แล้วจากการรัน test จริง ไม่ใช่แค่ทฤษฎี — ดู Dev Standard #4)
export const authGuard = new Elysia({ name: "authGuard" })
  .use(jwtPlugin)
  .derive({ as: "scoped" }, async ({ jwt, headers }) => {
    const authHeader = headers.authorization;
    if (!authHeader?.startsWith("Bearer ")) {
      throw new UnauthorizedError("กรุณาเข้าสู่ระบบ");
    }

    const payload = await jwt.verify(authHeader.slice(7));
    if (!payload) {
      throw new UnauthorizedError("token ไม่ถูกต้องหรือหมดอายุ");
    }

    return { user: payload as unknown as JwtPayload };
  });
