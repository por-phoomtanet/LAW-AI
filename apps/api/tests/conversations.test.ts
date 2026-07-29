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

describe("Conversation CRUD (Phase 3.1)", () => {
  let ownerToken: string;
  let otherToken: string;
  let otherUserId: number;
  let conversationId: number;

  beforeAll(async () => {
    ownerToken = await login(
      process.env.SEED_ADMIN_EMAIL ?? "admin@law-ai.local",
      process.env.SEED_ADMIN_PASSWORD ?? "ChangeMe123!",
    );

    const subscriberRole = await prisma.role.findUniqueOrThrow({ where: { name: "subscriber" } });
    const passwordHash = await Bun.password.hash("OtherUser123!", { algorithm: "bcrypt" });
    const other = await prisma.user.upsert({
      where: { email: "test-conversation-other@law-ai.local" },
      create: {
        name: "Other User",
        email: "test-conversation-other@law-ai.local",
        passwordHash,
        roleId: subscriberRole.id,
      },
      update: { passwordHash, roleId: subscriberRole.id, isActive: true, deletedAt: null },
    });
    otherUserId = other.id;
    otherToken = await login("test-conversation-other@law-ai.local", "OtherUser123!");
  });

  afterAll(async () => {
    await prisma.message.deleteMany({ where: { conversation: { userId: otherUserId } } });
    await prisma.conversation.deleteMany({ where: { userId: otherUserId } });
    if (conversationId) {
      await prisma.message.deleteMany({ where: { conversationId } });
      await prisma.conversation.delete({ where: { id: conversationId } }).catch(() => undefined);
    }
    await prisma.user.delete({ where: { id: otherUserId } }).catch(() => undefined);
  });

  test("no token → 401", async () => {
    const response = await app.handle(new Request("http://localhost/api/conversations"));
    expect(response.status).toBe(401);
  });

  test("create conversation uses env.OPENROUTER_MODEL as modelTier", async () => {
    const response = await authedRequest("/api/conversations", ownerToken, { method: "POST" });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.data.title).toBeNull();
    expect(body.data.modelTier).toBe(process.env.OPENROUTER_MODEL);
    conversationId = body.data.id;
  });

  test("owner lists their own conversation", async () => {
    const response = await authedRequest("/api/conversations", ownerToken);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.data.some((c: { id: number }) => c.id === conversationId)).toBe(true);
  });

  test("other user's list does not include it", async () => {
    const response = await authedRequest("/api/conversations", otherToken);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.data.some((c: { id: number }) => c.id === conversationId)).toBe(false);
  });

  test("owner can get conversation detail with empty messages", async () => {
    const response = await authedRequest(`/api/conversations/${conversationId}`, ownerToken);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.data.messages).toEqual([]);
  });

  test("other user gets 404 on someone else's conversation (ownership not leaked)", async () => {
    const response = await authedRequest(`/api/conversations/${conversationId}`, otherToken);
    expect(response.status).toBe(404);
  });

  test("other user cannot delete someone else's conversation → 404", async () => {
    const response = await authedRequest(`/api/conversations/${conversationId}`, otherToken, {
      method: "DELETE",
    });
    expect(response.status).toBe(404);
  });

  test("owner deletes conversation (soft delete)", async () => {
    const response = await authedRequest(`/api/conversations/${conversationId}`, ownerToken, {
      method: "DELETE",
    });
    expect(response.status).toBe(200);

    const record = await prisma.conversation.findUnique({ where: { id: conversationId } });
    expect(record?.deletedAt).not.toBeNull();

    const getResponse = await authedRequest(`/api/conversations/${conversationId}`, ownerToken);
    expect(getResponse.status).toBe(404);
  });
});
