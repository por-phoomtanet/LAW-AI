"use client";

import { useRouter } from "next/navigation";
import { useAuthStore } from "@/store/authStore";
import { usePermissionStore } from "@/store/permissionStore";
import { ROUTES } from "@/constants";

export function useLogout() {
  const clearAuth = useAuthStore((state) => state.clearAuth);
  const clearPermissions = usePermissionStore((state) => state.clearPermissions);
  const router = useRouter();

  return function logout() {
    clearAuth();
    clearPermissions();
    router.replace(ROUTES.login);
  };
}
