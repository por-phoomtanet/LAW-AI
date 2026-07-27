import { api } from "@/services/api";
import type { ApiResponse } from "@/types";
import type { RolePermission } from "@/store/permissionStore";

export const rolePermissionApi = {
  async getByRole(role: string): Promise<RolePermission[]> {
    const response = await api.get<ApiResponse<RolePermission[]>>(`/api/role-permissions/${role}`);
    return response.data.data;
  },
};
