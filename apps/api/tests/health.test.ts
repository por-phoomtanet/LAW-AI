import { describe, expect, test } from "bun:test";
import { app } from "../src/app";

describe("GET /api/health", () => {
  test("returns ok status with db connected", async () => {
    // ทดสอบ Elysia route ตรงผ่าน app.handle(new Request(...))
    // ไม่ต้องเปิด port จริงเหมือน Supertest
    const response = await app.handle(new Request("http://localhost/api/health"));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.status).toBe("ok");
    expect(body.db).toBe("connected");
    expect(typeof body.uptime).toBe("number");
  });
});
