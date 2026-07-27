import { rolePermissionRepository } from "../repositories/rolePermissionRepository";
import { ForbiddenError } from "../utils/errors";
import type { JwtPayload } from "../types/auth";

type PermissionAction = "canView" | "canCreate" | "canUpdate" | "canDelete";

// factory function (ไม่ใช่ Elysia plugin) — ใช้ผ่าน .guard({ beforeHandle: requirePermission(...) })
// ในไฟล์ route โดยตรง เพื่อเลี่ยงปัญหา local-scope ของ Elysia lifecycle hook ที่ mount
// ผ่าน plugin แยกไฟล์ (ดู Dev Standard #4 — errorHandler ก็เจอปัญหานี้มาแล้ว)
export function requirePermission(menuKey: string, action: PermissionAction = "canView") {
  return async ({ user }: { user: JwtPayload }) => {
    const permission = await rolePermissionRepository.findByRoleAndMenu(user.roleId, menuKey);
    if (!permission?.[action]) {
      throw new ForbiddenError();
    }
  };
}
