"use client";

import { Typography } from "antd";

const { Title, Paragraph } = Typography;

// Placeholder — ตาราง roles × menu สำหรับแก้ไข RolePermission จริงยังไม่อยู่ใน scope Phase 2
export default function SettingsPageContent() {
  return (
    <div>
      <Title level={3}>ตั้งค่าสิทธิ์ (Role Permission)</Title>
      <Paragraph>
        หน้านี้จะแสดงตาราง roles × menu สำหรับแก้ไข permission (อยู่ระหว่างพัฒนา)
      </Paragraph>
    </div>
  );
}
