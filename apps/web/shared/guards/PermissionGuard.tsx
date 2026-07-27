"use client";

import { useEffect, useState } from "react";
import { Spin, Typography } from "antd";
import { usePermissionStore } from "@/store/permissionStore";

const { Title, Paragraph } = Typography;

interface PermissionGuardProps {
  menuKey: string;
  children: React.ReactNode;
}

export default function PermissionGuard({ menuKey, children }: PermissionGuardProps) {
  const canView = usePermissionStore((state) => state.canView(menuKey));
  // รอ Zustand persist rehydrate ก่อน check — เหมือน AuthGuard
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Spin size="large" />
      </div>
    );
  }

  if (!canView) {
    // ห้ามใช้ antd Result — type conflict กับ React 19 (เจอมาแล้วในโปรเจกต์ก่อนหน้า)
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-2">
        <Title level={1}>403</Title>
        <Paragraph>คุณไม่มีสิทธิ์เข้าถึงหน้านี้</Paragraph>
      </div>
    );
  }

  return <>{children}</>;
}
