import { authService } from "../services/auth/authService";
import { userRepository } from "../repositories/userRepository";
import { NotFoundError } from "../utils/errors";
import type { JwtPayload } from "../types/auth";

interface JwtContext {
  sign: (payload: Record<string, string | number>) => Promise<string>;
  verify: (token?: string) => Promise<Record<string, string | number> | false>;
}

export const authController = {
  async login({ body, jwt }: { body: { email: string; password: string }; jwt: JwtContext }) {
    const user = await authService.login(body.email, body.password);
    const token = await jwt.sign({
      userId: user.id,
      roleId: user.roleId,
      role: user.role.name,
    });

    return {
      data: {
        token,
        user: {
          id: user.id,
          name: user.name,
          email: user.email,
          role: user.role.name,
        },
      },
    };
  },

  async me({ user }: { user: JwtPayload }) {
    const record = await userRepository.findById(user.userId);
    if (!record) {
      throw new NotFoundError("ไม่พบผู้ใช้");
    }

    return {
      data: {
        id: record.id,
        name: record.name,
        email: record.email,
        role: record.role.name,
        isActive: record.isActive,
      },
    };
  },
};
