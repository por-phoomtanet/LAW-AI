import OpenAI from "openai";
import { env } from "../utils/env";

// เรียก OpenAI Embeddings API ตรง (คนละ key จาก OpenRouter)
// เพราะ OpenRouter ไม่มี embeddings endpoint
export const embeddingClient = new OpenAI({ apiKey: env.OPENAI_API_KEY });

// ตัด prefix "openai/" ออกจาก EMBEDDING_MODEL ก่อนส่ง — "openai/" เป็น namespace
// convention แบบ OpenRouter เท่านั้น ไม่ใช่ model id จริงฝั่ง OpenAI
export const embeddingModelId = env.EMBEDDING_MODEL.replace(/^openai\//, "");
