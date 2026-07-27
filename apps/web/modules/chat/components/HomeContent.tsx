"use client";

import { Button, Typography } from "antd";

const { Title, Paragraph } = Typography;

// Placeholder — แทนที่ด้วย ChatWindow จริงใน Phase 4
export default function HomeContent() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4 p-8">
      <Title level={2}>LAW-AI</Title>
      <Paragraph className="text-center max-w-md">
        ผู้ช่วยกฎหมายไทย AI — ถามคำถามภาษาไทยเกี่ยวกับกฎหมาย
        แล้วได้คำตอบพร้อมการอ้างอิงที่ตรวจสอบย้อนกลับได้
      </Paragraph>
      <Button type="primary">เริ่มถามคำถาม</Button>
    </main>
  );
}
