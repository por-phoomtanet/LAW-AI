import { jwt } from "@elysiajs/jwt";
import { env } from "../utils/env";

// jwt() ตัวนี้แค่ decorate context ด้วย jwt.sign/jwt.verify — ไม่ enforce อะไร
// เมาต์ได้ทั้ง global (login route ต้องใช้ jwt.sign โดยไม่ต้องมี token มาก่อน)
export const jwtPlugin = jwt({
  name: "jwt",
  secret: env.JWT_SECRET,
});
