import { api } from "@/services/api";
import type { ApiResponse } from "@/types";
import type { LoginResponse } from "../types";

export const authApi = {
  async login(email: string, password: string): Promise<LoginResponse> {
    const response = await api.post<ApiResponse<LoginResponse>>("/api/auth/login", {
      email,
      password,
    });
    return response.data.data;
  },
};
