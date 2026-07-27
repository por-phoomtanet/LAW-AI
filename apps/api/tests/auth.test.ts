import { describe, expect, test } from "bun:test";
import { app } from "../src/app";

async function login(email: string, password: string) {
  return app.handle(
    new Request("http://localhost/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    }),
  );
}

describe("POST /api/auth/login", () => {
  test("valid credentials → 200 + JWT", async () => {
    const response = await login(
      process.env.SEED_ADMIN_EMAIL ?? "admin@law-ai.local",
      process.env.SEED_ADMIN_PASSWORD ?? "ChangeMe123!",
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(typeof body.data.token).toBe("string");
    expect(body.data.user.email).toBe("admin@law-ai.local");
    expect(body.data.user.role).toBe("admin");
  });

  test("wrong password → 401", async () => {
    const response = await login("admin@law-ai.local", "wrong-password");
    expect(response.status).toBe(401);
  });

  test("unknown email → 401", async () => {
    const response = await login("nobody@law-ai.local", "whatever");
    expect(response.status).toBe(401);
  });

  test("missing field → 400", async () => {
    const response = await app.handle(
      new Request("http://localhost/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: "admin@law-ai.local" }),
      }),
    );
    expect(response.status).toBe(400);
  });
});
