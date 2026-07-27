"use client";

import { Layout } from "antd";
import Sidebar from "./Sidebar";

const { Sider, Content } = Layout;

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <Layout className="min-h-screen">
      <Sider breakpoint="md" collapsedWidth={0}>
        <Sidebar />
      </Sider>
      <Content className="p-6">{children}</Content>
    </Layout>
  );
}
