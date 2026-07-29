import { api } from "@/services/api";
import type { ApiResponse } from "@/types";
import type { AiModelOption } from "../types";

// ใช้ร่วมกันทั้งแชททั่วไปและแชทกฎหมาย (Phase 5.1/5.2) — endpoint เดียว ไม่แยกต่อแชท
export const modelApi = {
  async list(): Promise<AiModelOption[]> {
    const response = await api.get<ApiResponse<AiModelOption[]>>("/api/ai-models");
    return response.data.data;
  },
};
