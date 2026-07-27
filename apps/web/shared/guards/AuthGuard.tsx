"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Spin } from "antd";
import { useAuthStore } from "@/store/authStore";
import { ROUTES } from "@/constants";

export default function AuthGuard({ children }: { children: React.ReactNode }) {
  const token = useAuthStore((state) => state.token);
  const router = useRouter();
  // รอ Zustand persist rehydrate จาก localStorage ก่อน check token
  // ไม่งั้นจะ flash redirect ไปหน้า login ทุกครั้งที่ refresh แม้ login อยู่แล้ว
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (mounted && !token) {
      router.replace(ROUTES.login);
    }
  }, [mounted, token, router]);

  if (!mounted || !token) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Spin size="large" />
      </div>
    );
  }

  return <>{children}</>;
}
