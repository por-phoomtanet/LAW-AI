import { describe, expect, test, mock } from "bun:test";

// รูปแบบอ้างอิงสำหรับ mock LLM client ใน test — ใช้ Bun test's mock.module(...)
// ไม่ใช่ jest.mock — ห้ามเรียก OpenRouter/OpenAI API จริงใน automated test
mock.module("../../src/clients/openrouterClient", () => ({
  openrouter: {
    chat: {
      completions: {
        create: async () => ({
          choices: [{ message: { content: "mocked response" } }],
        }),
      },
    },
  },
}));

describe("openrouterClient mock pattern", () => {
  test("mock.module replaces the client so tests never hit the real API", async () => {
    const { openrouter } = await import("../../src/clients/openrouterClient");
    const result = await openrouter.chat.completions.create({} as never);

    expect(result.choices[0].message.content).toBe("mocked response");
  });
});
