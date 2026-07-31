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
  { key: "legal-chat", menuKey: "legal-chat", label: "แชทกฎหมาย", route: ROUTES.legalChat },
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
  // ไฮไลต์เมนูตาม route ที่ตรงกับ pathname จริง (ก่อนหน้านี้เทียบ pathname กับ item.key ตรงๆ
  // ซึ่งไม่มีทางตรงกันเลย เช่น pathname="/" แต่ key="legal-chat" — ไม่เคยไฮไลต์อะไรเลยแม้แต่ครั้งเดียว)
  const selectedKey = visibleItems.find((item) => item.route === pathname)?.key;

  return (
    <Menu
      theme="dark"
      mode="inline"
      style={{ background: "#131314" }}
      selectedKeys={selectedKey ? [selectedKey] : []}
      onClick={({ key }) => {
        const item = visibleItems.find((i) => i.key === key);
        if (item) router.push(item.route);
      }}
      items={visibleItems.map((item) => ({ key: item.key, label: item.label }))}
    />
  );
}
