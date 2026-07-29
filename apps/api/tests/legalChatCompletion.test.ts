import { describe, expect, test, beforeAll, afterAll, mock } from "bun:test";
import { prisma } from "@law-ai/db";

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

let nextReplyParts: Array<{ content?: string; finishReason?: string }> = [];
let lastCallMessages: Array<{ role: string; content: string }> = [];

mock.module("../src/clients/openrouterClient", () => ({
  openrouter: {
    chat: {
      completions: {
        create: async (options: { stream?: boolean; messages?: typeof lastCallMessages }) => {
          lastCallMessages = options.messages ?? [];
          if (options.stream) {
            return fakeStream(nextReplyParts);
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

describe("Legal chat completion with RAG grounding (Phase 5.5)", () => {
  let app: typeof import("../src/app").app;
  let token: string;
  let legalConversationId: number;
  let generalConversationId: number;

  beforeAll(async () => {
    ({ app } = await import("../src/app"));
    token = await login(
      app,
      process.env.SEED_ADMIN_EMAIL ?? "admin@law-ai.local",
      process.env.SEED_ADMIN_PASSWORD ?? "ChangeMe123!",
    );

    const legalCreate = await app.handle(
      new Request("http://localhost/api/conversations", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ mode: "legal" }),
      }),
    );
    legalConversationId = (await legalCreate.json()).data.id;

    const generalCreate = await app.handle(
      new Request("http://localhost/api/conversations", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      }),
    );
    generalConversationId = (await generalCreate.json()).data.id;
  });

  afterAll(async () => {
    for (const id of [legalConversationId, generalConversationId]) {
      if (!id) continue;
      await prisma.message.deleteMany({ where: { conversationId: id } });
      await prisma.conversation.delete({ where: { id } }).catch(() => undefined);
    }
  });

  test("legal-mode conversation retrieves context and injects it into the prompt", async () => {
    nextReplyParts = [{ content: "สถาบัน[1] หมายถึง...", finishReason: "stop" }];

    const response = await app.handle(
      new Request(`http://localhost/api/conversations/${legalConversationId}/messages`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ content: "สถาบัน คืออะไร" }),
      }),
    );

    expect(response.status).toBe(200);
    await readSseEvents(response);

    // system prompt ต้องเป็น persona นักกฎหมาย ไม่ใช่ general chat's system prompt
    expect(lastCallMessages[0].role).toBe("system");
    expect(lastCallMessages[0].content).toContain("นักกฎหมาย");
    // ข้อความสุดท้าย (คำถาม) ต้องมี context ที่ retrieve มาแทรกอยู่ด้วย
    const lastMessage = lastCallMessages[lastCallMessages.length - 1];
    expect(lastMessage.content).toContain("บริบทจากคลังกฎหมาย");
    expect(lastMessage.content).toContain("[1]");
  });

  test("validated [n] citations get persisted on Message.citations", async () => {
    const messages = await prisma.message.findMany({
      where: { conversationId: legalConversationId, role: "assistant" },
      orderBy: { createdAt: "asc" },
    });
    expect(messages).toHaveLength(1);
    const citations = messages[0].citations as Array<{ index: number }> | null;
    expect(citations).not.toBeNull();
    expect(citations?.[0]?.index).toBe(1);
  });

  test("citing an out-of-range [n] does not get persisted as a citation", async () => {
    nextReplyParts = [{ content: "อ้างอิงมั่วๆ [999] ไม่มีจริง", finishReason: "stop" }];

    const response = await app.handle(
      new Request(`http://localhost/api/conversations/${legalConversationId}/messages`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ content: "อีกคำถามหนึ่ง" }),
      }),
    );
    await readSseEvents(response);

    const messages = await prisma.message.findMany({
      where: { conversationId: legalConversationId, role: "assistant" },
      orderBy: { createdAt: "asc" },
    });
    const latest = messages[messages.length - 1];
    expect(latest.citations).toBeNull();
  });

  test("no relevant passages found → context notes nothing was found, no citations", async () => {
    nextReplyParts = [{ content: "ไม่พบข้อมูลในคลังกฎหมายสำหรับคำถามนี้", finishReason: "stop" }];

    const response = await app.handle(
      new Request(`http://localhost/api/conversations/${legalConversationId}/messages`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ content: "zzzqqqxxxไม่มีทางเจอคำนี้แน่นอน123456789" }),
      }),
    );
    await readSseEvents(response);

    const lastMessage = lastCallMessages[lastCallMessages.length - 1];
    expect(lastMessage.content).toContain("ไม่พบข้อมูลที่เกี่ยวข้อง");
  });

  test("general-mode conversation still uses chatCompletionService (no RAG context, no citations)", async () => {
    nextReplyParts = [{ content: "สวัสดีครับ", finishReason: "stop" }];

    const response = await app.handle(
      new Request(`http://localhost/api/conversations/${generalConversationId}/messages`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ content: "สวัสดี" }),
      }),
    );
    // ต้องอ่าน response body ให้จบก่อน — persist ลง DB เกิดขึ้นตอน ReadableStream ทำงานจบ
    // (เหมือน chatCompletionService เดิม) ถ้าไม่ await ตรงนี้ assertion ข้างล่างจะ race กับมัน
    await readSseEvents(response);

    expect(lastCallMessages[0].content).not.toContain("นักกฎหมาย");
    const lastMessage = lastCallMessages[lastCallMessages.length - 1];
    expect(lastMessage.content).not.toContain("บริบทจากคลังกฎหมาย");

    const messages = await prisma.message.findMany({
      where: { conversationId: generalConversationId, role: "assistant" },
    });
    expect(messages[0].citations).toBeNull();
  });
});
