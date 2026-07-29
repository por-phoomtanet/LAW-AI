"use client";

import { Layout } from "antd";
import Sidebar from "./Sidebar";

const { Sider, Content } = Layout;

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <Layout className="h-screen">
      <Sider breakpoint="md" collapsedWidth={0} style={{ background: "#131314", height: "100vh" }}>
        <Sidebar />
      </Sider>
      <Content className="h-screen overflow-y-auto p-6">{children}</Content>
    </Layout>
  );
}
