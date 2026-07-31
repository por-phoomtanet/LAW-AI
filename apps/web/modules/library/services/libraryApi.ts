import { api } from "@/services/api";
import type { ApiResponse } from "@/types";
import type { DocumentListResponse, DocumentDetail } from "../types";

export const libraryApi = {
  async list(docType?: string): Promise<DocumentListResponse> {
    const response = await api.get<ApiResponse<DocumentListResponse>>("/api/documents", {
      params: docType ? { docType } : undefined,
    });
    return response.data.data;
  },

  async get(id: number, versionId?: number): Promise<DocumentDetail> {
    const response = await api.get<ApiResponse<DocumentDetail>>(`/api/documents/${id}`, {
      params: versionId ? { versionId } : undefined,
    });
    return response.data.data;
  },
};
