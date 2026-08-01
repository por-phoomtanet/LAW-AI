// OPENAI_API_KEY ถูกถอดออกตั้งแต่ Phase 6 — embeddings ย้ายไปเรียกผ่าน OpenRouter ด้วย
// OPENROUTER_API_KEY ตัวเดียว (ทดสอบแล้วว่า OpenRouter มี /v1/embeddings จริง ดู CLAUDE.md
// § AI/RAG ข้อ 2) จึงไม่ต้องมี key แยกอีกต่อไป
const REQUIRED_ENV_VARS = ["DATABASE_URL", "JWT_SECRET", "OPENROUTER_API_KEY"] as const;

export function validateEnv(): void {
  for (const key of REQUIRED_ENV_VARS) {
    if (!process.env[key]) {
      throw new Error(`Missing env: ${key}`);
    }
  }
}

export const env = {
  DATABASE_URL: process.env.DATABASE_URL!,
  JWT_SECRET: process.env.JWT_SECRET!,
  OPENROUTER_API_KEY: process.env.OPENROUTER_API_KEY!,
  // มี default ในโค้ด — ไม่บังคับต้องตั้งเอง แต่แนะนำให้ตั้งชัดเจนใน .env
  OPENROUTER_MODEL: process.env.OPENROUTER_MODEL ?? "deepseek/deepseek-v4-flash",
  EMBEDDING_MODEL: process.env.EMBEDDING_MODEL ?? "openai/text-embedding-3-small",
  PORT: Number(process.env.PORT ?? 4002),
  WEB_ORIGIN: process.env.WEB_ORIGIN ?? "http://localhost:3002",
};
