"use client";

import { useEffect, useState } from "react";
import { Select } from "antd";
import { modelApi } from "../services/modelApi";
import type { AiModelOption } from "../types";

// เลือกโมเดล AI ตอนเริ่มบทสนทนาใหม่ — ใช้ร่วมกันทั้งแชททั่วไปและแชทกฎหมาย (Phase 5.1/5.2)
// เลือกได้ครั้งเดียวตอนสร้าง เปลี่ยนกลางคันไม่ได้ (Conversation.modelTier เป็น per-conversation)
export default function ModelSelect({
  value,
  onChange,
}: {
  value: string | null;
  onChange: (modelId: string | null) => void;
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
    <Select
      value={value ?? undefined}
      onChange={(modelId) => onChange(modelId ?? null)}
      loading={loading}
      placeholder="เลือกโมเดล (ค่าเริ่มต้น)"
      allowClear
      size="small"
      className="w-56"
      styles={{
        popup: { root: { background: "#1e1f20" } },
      }}
      popupMatchSelectWidth={false}
      style={{ background: "#1e1f20" }}
      options={options.map((model) => ({ value: model.modelId, label: model.label }))}
    />
  );
}
