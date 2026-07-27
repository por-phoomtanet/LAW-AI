import { roleRepository } from "../../repositories/roleRepository";
import { rolePermissionRepository } from "../../repositories/rolePermissionRepository";
import { NotFoundError } from "../../utils/errors";

export const rolePermissionService = {
  listAll() {
    return rolePermissionRepository.findAll();
  },

  async listByRoleName(roleName: string) {
    const role = await roleRepository.findByName(roleName);
    if (!role) {
      throw new NotFoundError("ไม่พบ role นี้");
    }
    return rolePermissionRepository.findAllByRole(role.id);
  },

  async update(
    roleName: string,
    menuKey: string,
    data: Partial<{
      canView: boolean;
      canCreate: boolean;
      canUpdate: boolean;
      canDelete: boolean;
    }>,
  ) {
    const role = await roleRepository.findByName(roleName);
    if (!role) {
      throw new NotFoundError("ไม่พบ role นี้");
    }
    return rolePermissionRepository.upsert(role.id, menuKey, data);
  },
};
