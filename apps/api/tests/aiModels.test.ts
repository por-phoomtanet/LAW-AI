import { describe, expect, test, beforeAll } from "bun:test";
import { app } from "../src/app";

async function login(email: string, password: string): Promise<string> {
  const response = await app.handle(
    new Request("http://localhost/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    }),
  );
  const body = await response.json();
  return body.data.token as string;
}

describe("AI model list (Phase 5.1)", () => {
  let token: string;

  beforeAll(async () => {
    token = await login(
      process.env.SEED_ADMIN_EMAIL ?? "admin@law-ai.local",
      process.env.SEED_ADMIN_PASSWORD ?? "ChangeMe123!",
    );
  });

  test("no token → 401", async () => {
    const response = await app.handle(new Request("http://localhost/api/ai-models"));
    expect(response.status).toBe(401);
  });

  test("list returns seeded active models with modelId + label only", async () => {
    const response = await app.handle(
      new Request("http://localhost/api/ai-models", {
        headers: { Authorization: `Bearer ${token}` },
      }),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.data.length).toBeGreaterThan(0);
    expect(body.data[0]).toHaveProperty("modelId");
    expect(body.data[0]).toHaveProperty("label");
    expect(
      body.data.some((m: { modelId: string }) => m.modelId === "anthropic/claude-opus-5"),
    ).toBe(true);
  });
});
