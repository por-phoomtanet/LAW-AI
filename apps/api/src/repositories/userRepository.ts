import { prisma } from "@law-ai/db";

const includeRole = { role: true } as const;

export const userRepository = {
  findByEmail(email: string) {
    return prisma.user.findFirst({
      where: { email, deletedAt: null },
      include: includeRole,
    });
  },

  findById(id: number) {
    return prisma.user.findFirst({
      where: { id, deletedAt: null },
      include: includeRole,
    });
  },

  findAll(status: "active" | "all" = "active") {
    return prisma.user.findMany({
      where: status === "active" ? { isActive: true, deletedAt: null } : { deletedAt: null },
      include: includeRole,
      orderBy: { id: "asc" },
    });
  },

  countByEmail(email: string, excludeId?: number) {
    return prisma.user.count({
      where: {
        email,
        deletedAt: null,
        ...(excludeId ? { id: { not: excludeId } } : {}),
      },
    });
  },

  create(data: { name: string; email: string; passwordHash: string; roleId: number }) {
    return prisma.user.create({ data, include: includeRole });
  },

  update(
    id: number,
    data: Partial<{
      name: string;
      email: string;
      passwordHash: string;
      roleId: number;
      isActive: boolean;
    }>,
  ) {
    return prisma.user.update({ where: { id }, data, include: includeRole });
  },

  softDelete(id: number) {
    return prisma.user.update({ where: { id }, data: { deletedAt: new Date() } });
  },
};
