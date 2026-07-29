import { api } from "@/services/api";
import type { ApiResponse } from "@/types";
import type { ConversationSummary, ConversationDetail } from "../types";

// list/create/get/delete เท่านั้น — ส่งข้อความ (streaming) อยู่ใน useChatStream แทน
// เพราะต้องใช้ fetch + ReadableStream ไม่ใช่ axios (Dev Standard #10)
export const chatApi = {
  async list(): Promise<ConversationSummary[]> {
    const response = await api.get<ApiResponse<ConversationSummary[]>>("/api/conversations");
    return response.data.data;
  },

  async create(): Promise<ConversationSummary> {
    const response = await api.post<ApiResponse<ConversationSummary>>("/api/conversations");
    return response.data.data;
  },

  async get(id: number): Promise<ConversationDetail> {
    const response = await api.get<ApiResponse<ConversationDetail>>(`/api/conversations/${id}`);
    return response.data.data;
  },

  async remove(id: number): Promise<void> {
    await api.delete(`/api/conversations/${id}`);
  },
};
