import type { ChatMessage } from "../types";
import MarkdownMessage from "./MarkdownMessage";

// โทนสีแบบ NotebookLM — ข้อความ user เป็น pill สีเทาเข้ม ชิดขวา (plain text พอ เพราะเป็นแค่คำถาม),
// ข้อความ assistant เป็น markdown เต็มรูปแบบ (heading/list/code block ฯลฯ) ไม่มีกรอบ ชิดซ้าย
export default function MessageBubble({
  message,
}: {
  message: Pick<ChatMessage, "role" | "content">;
}) {
  const isUser = message.role === "user";

  if (isUser) {
    return (
      <div className="flex justify-end">
        <div className="max-w-[85%] whitespace-pre-wrap wrap-break-word rounded-3xl bg-[#333537] px-4 py-2.5 text-gray-100">
          {message.content}
        </div>
      </div>
    );
  }

  return (
    <div className="flex justify-start">
      <div className="max-w-[85%] wrap-break-word text-gray-100">
        <MarkdownMessage content={message.content} />
      </div>
    </div>
  );
}
