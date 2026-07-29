"use client";

import { useCallback, useState } from "react";
import { API_BASE_URL } from "@/constants";
import { useAuthStore } from "@/store/authStore";
import { useChatStore } from "@/store/chatStore";

interface StreamEvent {
  delta?: string;
  done?: boolean;
  error?: string;
}

// hook เดียวที่ถือ fetch + ReadableStream reader สำหรับ chat streaming (Dev Standard #10)
// ใช้ fetch ตรงแทน axios instance เดิม เพราะต้อง stream SSE (ตาม comment ใน services/api.ts)
export function useChatStream() {
  const [error, setError] = useState<string | null>(null);
  const appendStreamingDelta = useChatStore((state) => state.appendStreamingDelta);
  const commitStreamingMessage = useChatStore((state) => state.commitStreamingMessage);
  const resetStreamingBuffer = useChatStore((state) => state.resetStreamingBuffer);
  const setIsStreaming = useChatStore((state) => state.setIsStreaming);

  const send = useCallback(
    async (conversationId: number, content: string) => {
      setError(null);
      setIsStreaming(true);
      let hadError = false;

      try {
        const token = useAuthStore.getState().token;
        const response = await fetch(
          `${API_BASE_URL}/api/conversations/${conversationId}/messages`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              ...(token ? { Authorization: `Bearer ${token}` } : {}),
            },
            body: JSON.stringify({ content }),
          },
        );

        if (!response.ok || !response.body) {
          throw new Error("ส่งข้อความไม่สำเร็จ กรุณาลองใหม่อีกครั้ง");
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const parts = buffer.split("\n\n");
          buffer = parts.pop() ?? "";

          for (const part of parts) {
            if (!part.startsWith("data: ")) continue;
            const event: StreamEvent = JSON.parse(part.slice("data: ".length));
            if (event.delta) {
              appendStreamingDelta(event.delta);
            } else if (event.error) {
              setError(event.error);
              hadError = true;
            }
          }
        }
      } catch (err) {
        hadError = true;
        setError(err instanceof Error ? err.message : "เกิดข้อผิดพลาดที่ไม่คาดคิด");
      } finally {
        // error ไม่ persist ฝั่ง backend อยู่แล้ว (ดู chatCompletionService) — เคลียร์ buffer แทน commit
        // เพื่อไม่ให้ UI โชว์ข้อความที่ backend ไม่ได้บันทึกไว้จริง
        if (hadError) {
          resetStreamingBuffer();
        } else {
          commitStreamingMessage();
        }
        setIsStreaming(false);
      }
    },
    [appendStreamingDelta, commitStreamingMessage, resetStreamingBuffer, setIsStreaming],
  );

  return { send, error };
}
