"use client";

import { Typography } from "antd";

const { Title, Paragraph } = Typography;

// Placeholder — CRUD UI จริง (ตาราง/modal) ยังไม่อยู่ใน scope Phase 2
export default function UsersPageContent() {
  return (
    <div>
      <Title level={3}>จัดการผู้ใช้งาน</Title>
      <Paragraph>หน้านี้จะแสดงตารางผู้ใช้งานพร้อมปุ่มเพิ่ม/แก้ไข/ลบ (อยู่ระหว่างพัฒนา)</Paragraph>
    </div>
  );
}
