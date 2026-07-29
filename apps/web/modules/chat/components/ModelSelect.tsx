"use client";

import { useEffect, useState } from "react";
import { ConfigProvider, Select, theme } from "antd";
import { modelApi } from "../services/modelApi";
import type { AiModelOption } from "../types";

// เลือกโมเดล AI — ใช้ร่วมกันทั้งแชททั่วไปและแชทกฎหมาย (Phase 5.1/5.2) เปลี่ยนได้ตลอดแม้แชทไปแล้ว
// (ไม่ได้ผูกไว้แค่ตอนสร้างครั้งเดียวอีกต่อไป — parent เป็นคนตัดสินใจว่าจะเรียก chatApi.updateModel
// ทันทีตอนมีบทสนทนาอยู่แล้ว หรือแค่เก็บ state รอไว้ใช้ตอนสร้างบทสนทนาใหม่)
export default function ModelSelect({
  value,
  onChange,
  allowClear = true,
}: {
  value: string | null;
  onChange: (modelId: string | null) => void;
  // ปิดปุ่มล้างค่าตอนมีบทสนทนาอยู่แล้ว — conversation ต้องมีโมเดลผูกอยู่เสมอ ค่า null ไม่มีความหมาย
  allowClear?: boolean;
}) {
  const [options, setOptions] = useState<AiModelOption[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    modelApi
      .list()
      .then(setOptions)
      .finally(() => setLoading(false));
  }, []);

  return (
    // Select's dropdown render ผ่าน portal (ต่อท้าย document.body) — style/styles prop ธรรมดา
    // ไม่ cascade ไปถึง เพราะ portal อยู่นอก DOM tree ของ component นี้ ต้องใช้ ConfigProvider
    // + darkAlgorithm สโคปเฉพาะจุดแทน ถึงจะย้อมทั้งตัว trigger และ popup panel ให้เข้ากันจริง
    <ConfigProvider
      theme={{
        algorithm: theme.darkAlgorithm,
        token: {
          colorBgContainer: "#1e1f20",
          colorBgElevated: "#1e1f20",
          colorBorder: "rgba(255,255,255,0.1)",
          colorText: "#e5e7eb",
          colorTextPlaceholder: "#9ca3af",
        },
      }}
    >
      <Select
        value={value ?? undefined}
        onChange={(modelId) => onChange(modelId ?? null)}
        loading={loading}
        placeholder="เลือกโมเดล (ค่าเริ่มต้น)"
        allowClear={allowClear}
        size="small"
        className="w-56"
        popupMatchSelectWidth={false}
        options={options.map((model) => ({ value: model.modelId, label: model.label }))}
      />
    </ConfigProvider>
  );
}
