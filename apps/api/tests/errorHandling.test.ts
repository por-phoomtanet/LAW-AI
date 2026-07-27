import { describe, expect, test } from "bun:test";
import { Elysia, t } from "elysia";
import { errorHandler } from "../src/plugins/errorHandler";
import { ConflictError } from "../src/utils/errors";

// Elysia schema validation (t.Object) — validate ให้อัตโนมัติก่อนเข้า handler
// รวมกับ errorHandler plugin (global .onError()) ที่ทุก route ในระบบใช้ร่วมกัน
const testApp = new Elysia()
  .use(errorHandler)
  .post("/echo", ({ body }) => body, {
    body: t.Object({ content: t.String({ minLength: 1 }) }),
  })
  .get("/conflict", () => {
    throw new ConflictError("ชื่อหน่วยนี้มีอยู่แล้ว");
  });

describe("Elysia schema validation + global error handler", () => {
  test("missing required body field → 400", async () => {
    const response = await testApp.handle(
      new Request("http://localhost/echo", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      }),
    );

    expect(response.status).toBe(400);
  });

  test("valid body → 200 with echoed content", async () => {
    const response = await testApp.handle(
      new Request("http://localhost/echo", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: "สวัสดี" }),
      }),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.content).toBe("สวัสดี");
  });

  test("HttpError subclass → correct status + Thai message", async () => {
    const response = await testApp.handle(new Request("http://localhost/conflict"));
    const body = await response.json();

    expect(response.status).toBe(409);
    expect(body.error).toBe("ชื่อหน่วยนี้มีอยู่แล้ว");
  });
});
