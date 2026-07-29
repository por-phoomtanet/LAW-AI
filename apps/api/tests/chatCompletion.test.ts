import { describe, expect, test, beforeAll, afterAll, mock } from "bun:test";
import { prisma } from "@law-ai/db";

// สร้าง fake async-iterable stream แทน OpenAI SDK's Stream<ChatCompletionChunk> — รองรับทั้ง
// เคส stream:true (เทสหลัก) และ stream:false (เผื่อ mock.module อันนี้ leak ไปโดน
// tests/clients/openrouterClient.test.ts ตาม pattern เดียวกับที่ project เจอมาก่อน)
function fakeStream(parts: Array<{ content?: string; finishReason?: string }>) {
  return {
    [Symbol.asyncIterator]() {
      let i = 0;
      return {
        async next() {
          if (i >= parts.length) return { done: true as const, value: undefined };
          const part = parts[i++];
          return {
            done: false as const,
            value: {
              model: "mocked-model",
              choices: [
                {
                  delta: part.content !== undefined ? { content: part.content } : {},
                  finish_reason: part.finishReason ?? null,
                },
              ],
            },
          };
        },
      };
    },
  };
}

let nextFinishReason = "stop";

mock.module("../src/clients/openrouterClient", () => ({
  openrouter: {
    chat: {
      completions: {
        create: async (options: { stream?: boolean }) => {
          if (options.stream) {
            return fakeStream([
              { content: "สวัสดี" },
              { content: "ครับ" },
              { finishReason: nextFinishReason },
            ]);
          }
          return { choices: [{ message: { content: "mocked response" } }] };
        },
      },
    },
  },
}));

async function login(app: typeof import("../src/app").app, email: string, password: string) {
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

async function readSseEvents(response: Response) {
  const text = await response.text();
  return text
    .split("\n\n")
    .filter((line) => line.startsWith("data: "))
    .map((line) => JSON.parse(line.slice("data: ".length)));
}

describe("Streaming chat completion (Phase 3.2)", () => {
  let app: typeof import("../src/app").app;
  let token: string;
  let conversationId: number;

  beforeAll(async () => {
    ({ app } = await import("../src/app"));
    token = await login(
      app,
      process.env.SEED_ADMIN_EMAIL ?? "admin@law-ai.local",
      process.env.SEED_ADMIN_PASSWORD ?? "ChangeMe123!",
    );

    const createResponse = await app.handle(
      new Request("http://localhost/api/conversations", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      }),
    );
    const createBody = await createResponse.json();
    conversationId = createBody.data.id;
  });

  afterAll(async () => {
    if (conversationId) {
      await prisma.message.deleteMany({ where: { conversationId } });
      await prisma.conversation.delete({ where: { id: conversationId } }).catch(() => undefined);
    }
  });

  test("no token → 401", async () => {
    const response = await app.handle(
      new Request(`http://localhost/api/conversations/${conversationId}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: "สวัสดี" }),
      }),
    );
    expect(response.status).toBe(401);
  });

  test("sends a message, streams SSE deltas, and persists both messages + sets title", async () => {
    nextFinishReason = "stop";
    const response = await app.handle(
      new Request(`http://localhost/api/conversations/${conversationId}/messages`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ content: "ทดสอบคำถามทั่วไป" }),
      }),
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toContain("text/event-stream");

    const events = await readSseEvents(response);
    const deltas = events.filter((e) => e.delta).map((e) => e.delta);
    expect(deltas.join("")).toBe("สวัสดีครับ");
    expect(events.some((e) => e.done)).toBe(true);

    const messages = await prisma.message.findMany({
      where: { conversationId },
      orderBy: { createdAt: "asc" },
    });
    expect(messages).toHaveLength(2);
    expect(messages[0].role).toBe("user");
    expect(messages[0].content).toBe("ทดสอบคำถามทั่วไป");
    expect(messages[1].role).toBe("assistant");
    expect(messages[1].content).toBe("สวัสดีครับ");
    expect(messages[1].modelUsed).toBe("mocked-model");

    const conversation = await prisma.conversation.findUnique({ where: { id: conversationId } });
    expect(conversation?.title).toBe("ทดสอบคำถามทั่วไป");
  });

  test("non-stop finish_reason → generic Thai error, assistant message not persisted", async () => {
    nextFinishReason = "content_filter";
    const response = await app.handle(
      new Request(`http://localhost/api/conversations/${conversationId}/messages`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ content: "คำถามที่สอง" }),
      }),
    );

    const events = await readSseEvents(response);
    expect(events.some((e) => e.error === "ไม่สามารถตอบคำถามนี้ได้ กรุณาลองถามในรูปแบบอื่น")).toBe(
      true,
    );

    const messages = await prisma.message.findMany({
      where: { conversationId },
      orderBy: { createdAt: "asc" },
    });
    // user message รอบสองถูก persist (2 จากรอบแรก + 1 user ใหม่) แต่ assistant ไม่ถูก persist เพราะ finish_reason ไม่ใช่ stop
    expect(messages).toHaveLength(3);
    expect(messages[2].role).toBe("user");
    expect(messages[2].content).toBe("คำถามที่สอง");
  });

  test("other user's conversation → 404 (ownership not leaked)", async () => {
    const subscriberRole = await prisma.role.findUniqueOrThrow({ where: { name: "subscriber" } });
    const passwordHash = await Bun.password.hash("Other123!", { algorithm: "bcrypt" });
    const other = await prisma.user.upsert({
      where: { email: "test-chat-other@law-ai.local" },
      create: {
        name: "Other",
        email: "test-chat-other@law-ai.local",
        passwordHash,
        roleId: subscriberRole.id,
      },
      update: { passwordHash, roleId: subscriberRole.id, isActive: true, deletedAt: null },
    });
    const otherToken = await login(app, "test-chat-other@law-ai.local", "Other123!");

    const response = await app.handle(
      new Request(`http://localhost/api/conversations/${conversationId}/messages`, {
        method: "POST",
        headers: { Authorization: `Bearer ${otherToken}`, "Content-Type": "application/json" },
        body: JSON.stringify({ content: "แอบส่ง" }),
      }),
    );
    expect(response.status).toBe(404);

    await prisma.user.delete({ where: { id: other.id } });
  });
});
