import { prisma } from "@law-ai/db";

export const aiModelRepository = {
  findManyActive() {
    return prisma.aiModel.findMany({
      where: { isActive: true },
      orderBy: { sortOrder: "asc" },
    });
  },

  findActiveByModelId(modelId: string) {
    return prisma.aiModel.findFirst({
      where: { modelId, isActive: true },
    });
  },
};
