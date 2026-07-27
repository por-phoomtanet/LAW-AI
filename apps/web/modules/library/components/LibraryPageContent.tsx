"use client";

import { Typography } from "antd";

const { Title, Paragraph } = Typography;

// Placeholder — browse/ค้นหาเอกสารกฎหมายจริงอยู่ใน Phase 5
export default function LibraryPageContent() {
  return (
    <div>
      <Title level={3}>คลังกฎหมาย</Title>
      <Paragraph>หน้านี้จะแสดงรายการเอกสารกฎหมายพร้อมค้นหา/filter (อยู่ระหว่างพัฒนา)</Paragraph>
    </div>
  );
}
