"use client";

import { useMemo } from "react";
import { useRouter, usePathname } from "next/navigation";
import { Menu } from "antd";
import { usePermissionStore } from "@/store/permissionStore";
import { ROUTES } from "@/constants";

interface MenuItem {
  key: string;
  menuKey: string;
  label: string;
  route: string;
}

const MENU_ITEMS: MenuItem[] = [
  { key: "chat", menuKey: "chat", label: "แชท", route: ROUTES.chat },
  { key: "library", menuKey: "library", label: "คลังกฎหมาย", route: ROUTES.library },
  { key: "users", menuKey: "users", label: "จัดการผู้ใช้งาน", route: ROUTES.users },
  { key: "settings", menuKey: "settings", label: "ตั้งค่าสิทธิ์", route: ROUTES.settings },
];

export default function Sidebar() {
  const router = useRouter();
  const pathname = usePathname();
  const canView = usePermissionStore((state) => state.canView);

  // filter ตาม permission จริงจาก store — ไม่ hardcode role name (ตาม Dev Standard #11)
  const visibleItems = useMemo(() => MENU_ITEMS.filter((item) => canView(item.menuKey)), [canView]);

  return (
    <Menu
      theme="dark"
      mode="inline"
      style={{ background: "#131314" }}
      selectedKeys={[pathname]}
      onClick={({ key }) => {
        const item = visibleItems.find((i) => i.key === key);
        if (item) router.push(item.route);
      }}
      items={visibleItems.map((item) => ({ key: item.key, label: item.label }))}
    />
  );
}
