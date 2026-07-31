"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import axios from "axios";
import { authApi } from "../services/authApi";
import { rolePermissionApi } from "../services/rolePermissionApi";
import { useAuthStore } from "@/store/authStore";
import { usePermissionStore } from "@/store/permissionStore";
import { ROUTES } from "@/constants";

export function useLogin() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const setAuth = useAuthStore((state) => state.setAuth);
  const setPermissions = usePermissionStore((state) => state.setPermissions);
  const router = useRouter();

  async function login(email: string, password: string) {
    setLoading(true);
    setError(null);
    try {
      const { user, token } = await authApi.login(email, password);
      setAuth(user, token);
      // ดึง permissions + set auth พร้อมกันหลัง login เพื่อไม่ให้หน้าแรกหลัง redirect
      // เจอ waterfall (sidebar/guard ต้องรอ permissions ก่อนถึงจะ render ถูก)
      const permissions = await rolePermissionApi.getByRole(user.role);
      setPermissions(permissions);
      router.push(ROUTES.legalChat);
    } catch (err) {
      const message = axios.isAxiosError(err) ? err.response?.data?.error : undefined;
      setError(message ?? "เข้าสู่ระบบไม่สำเร็จ กรุณาลองใหม่อีกครั้ง");
    } finally {
      setLoading(false);
    }
  }

  return { login, loading, error };
}
