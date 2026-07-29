"use client";

import { useEffect, useRef } from "react";
import { useChatStore } from "@/store/chatStore";
import MessageBubble from "./MessageBubble";

export default function MessageThread() {
  const messages = useChatStore((state) => state.messages);
  const streamingBuffer = useChatStore((state) => state.streamingBuffer);
  const isStreaming = useChatStore((state) => state.isStreaming);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, streamingBuffer]);

  if (messages.length === 0 && !isStreaming) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-3 text-center">
        <h2 className="text-2xl font-semibold text-gray-100">LAW-AI</h2>
        <p className="max-w-md text-gray-400">พิมพ์คำถามอะไรก็ได้ด้านล่างเพื่อเริ่มบทสนทนาใหม่</p>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto px-3 py-4">
      <div className="mx-auto flex max-w-3xl flex-col gap-4">
        {messages.map((message) => (
          <MessageBubble key={message.id} message={message} />
        ))}
        {isStreaming && streamingBuffer && (
          <MessageBubble message={{ role: "assistant", content: streamingBuffer }} />
        )}
        {isStreaming && !streamingBuffer && (
          <div className="flex justify-start">
            <div className="px-1 py-1 text-gray-500">กำลังคิด...</div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>
    </div>
  );
}
