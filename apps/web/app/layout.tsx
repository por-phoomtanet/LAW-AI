import type { Metadata } from "next";
import { AntdRegistry } from "@ant-design/nextjs-registry";
import "./globals.css";

export const metadata: Metadata = {
  title: "LAW-AI — ผู้ช่วยกฎหมายไทย AI",
  description: "แพลตฟอร์ม AI Chat สำหรับค้นคว้ากฎหมายไทย พร้อมการอ้างอิงที่ตรวจสอบย้อนกลับได้",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="th">
      <body>
        <AntdRegistry>{children}</AntdRegistry>
      </body>
    </html>
  );
}
