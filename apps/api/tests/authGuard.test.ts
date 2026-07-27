import { describe, expect, test, beforeAll } from "bun:test";
import { Elysia } from "elysia";
import { prisma } from "@law-ai/db";
import { app } from "../src/app";
import { authGuard } from "../src/plugins/authGuard";
import { requirePermission } from "../src/plugins/roleGuard";

async function loginAndGetToken(email: string, password: string): Promise<string> {
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

describe("GET /api/auth/me — authGuard", () => {
  test("no token → 401", async () => {
    const response = await app.handle(new Request("http://localhost/api/auth/me"));
    expect(response.status).toBe(401);
  });

  test("invalid token → 401", async () => {
    const response = await app.handle(
      new Request("http://localhost/api/auth/me", {
        headers: { Authorization: "Bearer not-a-real-token" },
      }),
    );
    expect(response.status).toBe(401);
  });

  test("valid token → 200 with current user", async () => {
    const token = await loginAndGetToken(
      process.env.SEED_ADMIN_EMAIL ?? "admin@law-ai.local",
      process.env.SEED_ADMIN_PASSWORD ?? "ChangeMe123!",
    );

    const response = await app.handle(
      new Request("http://localhost/api/auth/me", {
        headers: { Authorization: `Bearer ${token}` },
      }),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.data.email).toBe("admin@law-ai.local");
    expect(body.data.role).toBe("admin");
  });
});

describe("requirePermission — roleGuard", () => {
  const testMenuKey = "__test_menu__";
  let adminRoleId: number;
  let adminToken: string;

  beforeAll(async () => {
    const adminRole = await prisma.role.findUniqueOrThrow({ where: { name: "admin" } });
    adminRoleId = adminRole.id;
    adminToken = await loginAndGetToken(
      process.env.SEED_ADMIN_EMAIL ?? "admin@law-ai.local",
      process.env.SEED_ADMIN_PASSWORD ?? "ChangeMe123!",
    );
  });

  test("blocks when no permission row exists (default deny)", async () => {
    const testApp = new Elysia()
      .use(authGuard)
      .guard({ beforeHandle: requirePermission(testMenuKey, "canView") })
      .get("/protected", () => ({ ok: true }));

    const response = await testApp.handle(
      new Request("http://localhost/protected", {
        headers: { Authorization: `Bearer ${adminToken}` },
      }),
    );
    expect(response.status).toBe(403);
  });

  test("allows when permission row grants access", async () => {
    await prisma.rolePermission.upsert({
      where: { roleId_menuKey: { roleId: adminRoleId, menuKey: testMenuKey } },
      create: { roleId: adminRoleId, menuKey: testMenuKey, canView: true },
      update: { canView: true },
    });

    const testApp = new Elysia()
      .use(authGuard)
      .guard({ beforeHandle: requirePermission(testMenuKey, "canView") })
      .get("/protected", () => ({ ok: true }));

    const response = await testApp.handle(
      new Request("http://localhost/protected", {
        headers: { Authorization: `Bearer ${adminToken}` },
      }),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.ok).toBe(true);

    // cleanup
    await prisma.rolePermission.delete({
      where: { roleId_menuKey: { roleId: adminRoleId, menuKey: testMenuKey } },
    });
  });
});
