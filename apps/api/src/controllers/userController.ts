import type { Prisma } from "@law-ai/db";
import { userService } from "../services/users/userService";

type UserWithRole = Prisma.UserGetPayload<{ include: { role: true } }>;

function toSafeUser(user: UserWithRole) {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    isActive: user.isActive,
    role: user.role.name,
    createdAt: user.createdAt,
  };
}

export const userController = {
  async list({ query }: { query: { status?: "active" | "all" } }) {
    const users = await userService.list(query.status ?? "active");
    return { data: users.map(toSafeUser) };
  },

  async create({
    body,
  }: {
    body: { name: string; email: string; password: string; roleId: number };
  }) {
    const user = await userService.create(body);
    return { data: toSafeUser(user) };
  },

  async update({
    params,
    body,
  }: {
    params: { id: string };
    body: Partial<{
      name: string;
      email: string;
      password: string;
      roleId: number;
      isActive: boolean;
    }>;
  }) {
    const user = await userService.update(Number(params.id), body);
    return { data: toSafeUser(user) };
  },

  async remove({ params }: { params: { id: string } }) {
    await userService.softDelete(Number(params.id));
    return { data: { id: Number(params.id) } };
  },
};
