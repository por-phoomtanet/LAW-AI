import { userRepository } from "../../repositories/userRepository";
import { ConflictError, NotFoundError } from "../../utils/errors";

export const userService = {
  list(status: "active" | "all" = "active") {
    return userRepository.findAll(status);
  },

  async create(data: { name: string; email: string; password: string; roleId: number }) {
    const existing = await userRepository.countByEmail(data.email);
    if (existing > 0) {
      throw new ConflictError("อีเมลนี้มีอยู่ในระบบแล้ว");
    }

    const passwordHash = await Bun.password.hash(data.password, { algorithm: "bcrypt" });
    return userRepository.create({
      name: data.name,
      email: data.email,
      passwordHash,
      roleId: data.roleId,
    });
  },

  async update(
    id: number,
    data: Partial<{
      name: string;
      email: string;
      password: string;
      roleId: number;
      isActive: boolean;
    }>,
  ) {
    const existing = await userRepository.findById(id);
    if (!existing) {
      throw new NotFoundError("ไม่พบผู้ใช้");
    }

    if (data.email && data.email !== existing.email) {
      const duplicate = await userRepository.countByEmail(data.email, id);
      if (duplicate > 0) {
        throw new ConflictError("อีเมลนี้มีอยู่ในระบบแล้ว");
      }
    }

    const passwordHash = data.password
      ? await Bun.password.hash(data.password, { algorithm: "bcrypt" })
      : undefined;

    return userRepository.update(id, {
      name: data.name,
      email: data.email,
      roleId: data.roleId,
      isActive: data.isActive,
      ...(passwordHash ? { passwordHash } : {}),
    });
  },

  async softDelete(id: number) {
    const existing = await userRepository.findById(id);
    if (!existing) {
      throw new NotFoundError("ไม่พบผู้ใช้");
    }
    await userRepository.softDelete(id);
  },
};
