import OpenAI from "openai";
import { env } from "../utils/env";

// OpenAI-compatible SDK ชี้ไปที่ OpenRouter — ห้ามใช้ @anthropic-ai/sdk
// แม้ underlying model บาง provider จะเป็น Claude ก็ตาม (wire format เดินตาม OpenAI Chat Completions)
export const openrouter = new OpenAI({
  apiKey: env.OPENROUTER_API_KEY,
  baseURL: "https://openrouter.ai/api/v1",
});
