import { prisma } from "@law-ai/db";

export const rolePermissionRepository = {
  findByRoleAndMenu(roleId: number, menuKey: string) {
    return prisma.rolePermission.findUnique({
      where: { roleId_menuKey: { roleId, menuKey } },
    });
  },

  findAllByRole(roleId: number) {
    return prisma.rolePermission.findMany({ where: { roleId } });
  },

  findAll() {
    return prisma.rolePermission.findMany({ include: { role: true } });
  },

  upsert(
    roleId: number,
    menuKey: string,
    data: Partial<{
      canView: boolean;
      canCreate: boolean;
      canUpdate: boolean;
      canDelete: boolean;
    }>,
  ) {
    return prisma.rolePermission.upsert({
      where: { roleId_menuKey: { roleId, menuKey } },
      create: {
        roleId,
        menuKey,
        canView: data.canView ?? true,
        canCreate: data.canCreate ?? false,
        canUpdate: data.canUpdate ?? false,
        canDelete: data.canDelete ?? false,
      },
      update: data,
    });
  },
};
