import { prisma } from "@law-ai/db";

export const roleRepository = {
  findByName(name: string) {
    return prisma.role.findUnique({ where: { name } });
  },

  findAll() {
    return prisma.role.findMany({ orderBy: { id: "asc" } });
  },
};
