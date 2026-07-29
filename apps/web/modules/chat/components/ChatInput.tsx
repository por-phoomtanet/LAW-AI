"use client";

import { useRef, useState } from "react";

// input แบบ pill สีเข้ม + ปุ่มส่งวงกลม ตามโทน NotebookLM — ใช้ HTML element ธรรมดาแทน
// antd Input/Button เพราะต้องคุมสีพื้น/ขอบเองทั้งหมด ไม่ใช่ theme antd แบบ default
export default function ChatInput({
  disabled,
  onSend,
}: {
  disabled: boolean;
  onSend: (content: string) => void;
}) {
  const [value, setValue] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  function handleSend() {
    const trimmed = value.trim();
    if (!trimmed || disabled) return;
    onSend(trimmed);
    setValue("");
    if (textareaRef.current) textareaRef.current.style.height = "auto";
  }

  function handleInput(e: React.ChangeEvent<HTMLTextAreaElement>) {
    setValue(e.target.value);
    const el = e.target;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
  }

  return (
    <div className="sticky bottom-0 px-3 pb-4 pt-2">
      <div className="mx-auto flex max-w-3xl items-end gap-2 rounded-3xl border border-white/10 bg-[#1e1f20] px-4 py-2.5">
        <textarea
          ref={textareaRef}
          value={value}
          onChange={handleInput}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              handleSend();
            }
          }}
          placeholder="เริ่มพิมพ์..."
          rows={1}
          disabled={disabled}
          className="max-h-40 flex-1 resize-none bg-transparent text-gray-100 placeholder-gray-500 outline-none disabled:opacity-50"
        />
        <button
          type="button"
          onClick={handleSend}
          disabled={disabled || !value.trim()}
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gray-200 text-gray-900 transition-colors disabled:bg-white/10 disabled:text-gray-500"
        >
          →
        </button>
      </div>
    </div>
  );
}
