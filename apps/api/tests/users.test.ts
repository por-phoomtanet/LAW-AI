import { describe, expect, test, beforeAll, afterAll } from "bun:test";
import { prisma } from "@law-ai/db";
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

describe("User CRUD (Phase 2.3)", () => {
  let adminToken: string;
  let subscriberToken: string;
  let subscriberUserId: number;
  let createdUserId: number;

  beforeAll(async () => {
    adminToken = await login(
      process.env.SEED_ADMIN_EMAIL ?? "admin@law-ai.local",
      process.env.SEED_ADMIN_PASSWORD ?? "ChangeMe123!",
    );

    const subscriberRole = await prisma.role.findUniqueOrThrow({ where: { name: "subscriber" } });
    const passwordHash = await Bun.password.hash("Subscriber123!", { algorithm: "bcrypt" });
    const subscriber = await prisma.user.upsert({
      where: { email: "test-subscriber@law-ai.local" },
      create: {
        name: "Test Subscriber",
        email: "test-subscriber@law-ai.local",
        passwordHash,
        roleId: subscriberRole.id,
      },
      update: { passwordHash, roleId: subscriberRole.id, isActive: true, deletedAt: null },
    });
    subscriberUserId = subscriber.id;
    subscriberToken = await login("test-subscriber@law-ai.local", "Subscriber123!");
  });

  afterAll(async () => {
    await prisma.user.delete({ where: { id: subscriberUserId } }).catch(() => undefined);
    if (createdUserId) {
      await prisma.user.delete({ where: { id: createdUserId } }).catch(() => undefined);
    }
  });

  test("admin can list users", async () => {
    const response = await authedRequest("/api/users", adminToken);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(Array.isArray(body.data)).toBe(true);
    expect(body.data.some((u: { email: string }) => u.email === "admin@law-ai.local")).toBe(true);
  });

  test("subscriber → 403 on user management", async () => {
    const response = await authedRequest("/api/users", subscriberToken);
    expect(response.status).toBe(403);
  });

  test("admin creates a user", async () => {
    const researcherRole = await prisma.role.findUniqueOrThrow({ where: { name: "researcher" } });
    const response = await authedRequest("/api/users", adminToken, {
      method: "POST",
      body: JSON.stringify({
        name: "New Researcher",
        email: "new-researcher@law-ai.local",
        password: "Password123!",
        roleId: researcherRole.id,
      }),
    });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.data.email).toBe("new-researcher@law-ai.local");
    expect(body.data.passwordHash).toBeUndefined();
    createdUserId = body.data.id;
  });

  test("duplicate email → 409", async () => {
    const researcherRole = await prisma.role.findUniqueOrThrow({ where: { name: "researcher" } });
    const response = await authedRequest("/api/users", adminToken, {
      method: "POST",
      body: JSON.stringify({
        name: "Duplicate",
        email: "new-researcher@law-ai.local",
        password: "Password123!",
        roleId: researcherRole.id,
      }),
    });
    expect(response.status).toBe(409);
  });

  test("admin updates a user", async () => {
    const response = await authedRequest(`/api/users/${createdUserId}`, adminToken, {
      method: "PUT",
      body: JSON.stringify({ name: "Updated Name" }),
    });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.data.name).toBe("Updated Name");
  });

  test("admin deletes a user (soft delete sets deletedAt)", async () => {
    const response = await authedRequest(`/api/users/${createdUserId}`, adminToken, {
      method: "DELETE",
    });
    expect(response.status).toBe(200);

    const record = await prisma.user.findUnique({ where: { id: createdUserId } });
    expect(record?.deletedAt).not.toBeNull();

    const listResponse = await authedRequest("/api/users?status=all", adminToken);
    const listBody = await listResponse.json();
    expect(listBody.data.some((u: { id: number }) => u.id === createdUserId)).toBe(false);
  });
});
