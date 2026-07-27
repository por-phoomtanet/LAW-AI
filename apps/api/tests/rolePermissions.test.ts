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

function authedRequest(path: string, token: string, init: RequestInit = {}) {
  return app.handle(
    new Request(`http://localhost${path}`, {
      ...init,
      headers: {
        ...init.headers,
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
    }),
  );
}

describe("Role Permission API (Phase 2.6)", () => {
  let adminToken: string;

  beforeAll(async () => {
    adminToken = await login(
      process.env.SEED_ADMIN_EMAIL ?? "admin@law-ai.local",
      process.env.SEED_ADMIN_PASSWORD ?? "ChangeMe123!",
    );
  });

  test("GET /api/role-permissions (admin) → all permissions", async () => {
    const response = await authedRequest("/api/role-permissions", adminToken);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(Array.isArray(body.data)).toBe(true);
    expect(body.data.length).toBeGreaterThan(0);
  });

  test("GET /api/role-permissions/:role → any authenticated user", async () => {
    const response = await authedRequest("/api/role-permissions/subscriber", adminToken);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.data.some((p: { menuKey: string }) => p.menuKey === "chat")).toBe(true);
  });

  test("GET /api/role-permissions/:role → unknown role → 404", async () => {
    const response = await authedRequest("/api/role-permissions/nonexistent", adminToken);
    expect(response.status).toBe(404);
  });

  test("PUT /api/role-permissions/:role/:menuKey (admin) updates permission", async () => {
    const response = await authedRequest("/api/role-permissions/researcher/library", adminToken, {
      method: "PUT",
      body: JSON.stringify({ canCreate: true }),
    });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.data.canCreate).toBe(true);
    expect(body.data.canView).toBe(true); // ค่าเดิมต้องยังอยู่ ไม่ถูกเขียนทับเป็น false

    // revert เพื่อไม่ให้กระทบ default seed data ของ test อื่น
    await authedRequest("/api/role-permissions/researcher/library", adminToken, {
      method: "PUT",
      body: JSON.stringify({ canCreate: false }),
    });
  });
});
