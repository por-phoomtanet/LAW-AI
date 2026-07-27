import { rolePermissionService } from "../services/rolePermissions/rolePermissionService";

export const rolePermissionController = {
  async listAll() {
    const permissions = await rolePermissionService.listAll();
    return { data: permissions };
  },

  async listByRole({ params }: { params: { role: string } }) {
    const permissions = await rolePermissionService.listByRoleName(params.role);
    return { data: permissions };
  },

  async update({
    params,
    body,
  }: {
    params: { role: string; menuKey: string };
    body: Partial<{ canView: boolean; canCreate: boolean; canUpdate: boolean; canDelete: boolean }>;
  }) {
    const permission = await rolePermissionService.update(params.role, params.menuKey, body);
    return { data: permission };
  },
};
