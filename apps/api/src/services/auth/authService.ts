import { userRepository } from "../../repositories/userRepository";
import { UnauthorizedError } from "../../utils/errors";

export const authService = {
  async login(email: string, password: string) {
    const user = await userRepository.findByEmail(email);
    if (!user || !user.isActive) {
      throw new UnauthorizedError("อีเมลหรือรหัสผ่านไม่ถูกต้อง");
    }

    const valid = await Bun.password.verify(password, user.passwordHash);
    if (!valid) {
      throw new UnauthorizedError("อีเมลหรือรหัสผ่านไม่ถูกต้อง");
    }

    return user;
  },
};
