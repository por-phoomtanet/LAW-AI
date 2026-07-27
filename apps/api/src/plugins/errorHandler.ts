import { Elysia } from "elysia";
import { HttpError } from "../utils/errors";

// Global error handler — format error response สม่ำเสมอทั้ง API
// หมายเหตุ: onError ใน plugin เป็น local scope โดย default — ต้องระบุ
// { as: "global" } ไม่งั้น hook นี้จะไม่ทำงานกับ route ที่ประกาศบน instance
// ที่ .use(errorHandler) เข้าไป (Elysia จะ fallback ไปใช้ error response ของตัวเอง
// เช่น validation error จะได้ 422 ดิบแทนที่จะเป็น 400 ตามที่กำหนดไว้)
export const errorHandler = new Elysia().onError({ as: "global" }, ({ code, error, set }) => {
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
});
