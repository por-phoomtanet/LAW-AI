"use client";

import { useCallback, useRef, useState } from "react";
import { API_BASE_URL } from "@/constants";
import { useAuthStore } from "@/store/authStore";
import { useChatStore } from "@/store/chatStore";
import type { Citation } from "../types";

interface StreamEvent {
  delta?: string;
  done?: boolean;
  error?: string;
  citations?: Citation[];
}

// ทยอยโชว์ทีละ REVEAL_CHARS_PER_TICK ตัวอักษรทุก REVEAL_INTERVAL_MS แทนการโชว์ delta
// ที่รับมาทันที — OpenRouter ส่ง chunk มาเป็นก้อนไม่สม่ำเสมอ (บาง chunk มีหลาย token
// บาง chunk มีตัวเดียว) ทำให้ UI ดูสะดุดถ้า render ตรงๆ ตามจังหวะ network
const REVEAL_INTERVAL_MS = 20;
const REVEAL_CHARS_PER_TICK = 2;

// hook เดียวที่ถือ fetch + ReadableStream reader สำหรับ chat streaming (Dev Standard #10)
// ใช้ fetch ตรงแทน axios instance เดิม เพราะต้อง stream SSE (ตาม comment ใน services/api.ts)
export function useChatStream() {
  const [error, setError] = useState<string | null>(null);
  const appendStreamingDelta = useChatStore((state) => state.appendStreamingDelta);
  const commitStreamingMessage = useChatStore((state) => state.commitStreamingMessage);
  const resetStreamingBuffer = useChatStore((state) => state.resetStreamingBuffer);
  const setIsStreaming = useChatStore((state) => state.setIsStreaming);

  // ข้อความที่รับจาก network มาแล้วแต่ยังไม่ได้ทยอยโชว์ — แยกจาก streamingBuffer ใน store
  // (ซึ่งคือสิ่งที่โชว์บนจอจริง) เพื่อทำ typewriter effect
  const pendingQueueRef = useRef("");
  const revealTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const stopRevealLoop = useCallback(() => {
    if (revealTimerRef.current) {
      clearInterval(revealTimerRef.current);
      revealTimerRef.current = null;
    }
  }, []);

  const send = useCallback(
    async (conversationId: number, content: string) => {
      setError(null);
      setIsStreaming(true);
      pendingQueueRef.current = "";
      stopRevealLoop();

      let hadError = false;
      let networkDone = false;
      let finalized = false;
      let citations: Citation[] | undefined;

      const finalize = () => {
        if (finalized) return;
        finalized = true;
        stopRevealLoop();
        // error ไม่ persist ฝั่ง backend อยู่แล้ว (ดู chatCompletionService) — เคลียร์ buffer แทน commit
        // เพื่อไม่ให้ UI โชว์ข้อความที่ backend ไม่ได้บันทึกไว้จริง
        if (hadError) {
          resetStreamingBuffer();
        } else {
          commitStreamingMessage(citations);
        }
        setIsStreaming(false);
      };

      revealTimerRef.current = setInterval(() => {
        if (pendingQueueRef.current.length > 0) {
          const chunk = pendingQueueRef.current.slice(0, REVEAL_CHARS_PER_TICK);
          pendingQueueRef.current = pendingQueueRef.current.slice(chunk.length);
          appendStreamingDelta(chunk);
        } else if (networkDone) {
          finalize();
        }
      }, REVEAL_INTERVAL_MS);

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
              pendingQueueRef.current += event.delta;
            } else if (event.error) {
              setError(event.error);
              hadError = true;
            } else if (event.done) {
              citations = event.citations;
            }
          }
        }
      } catch (err) {
        hadError = true;
        setError(err instanceof Error ? err.message : "เกิดข้อผิดพลาดที่ไม่คาดคิด");
      } finally {
        networkDone = true;
        if (hadError) {
          // error → ตัดจบทันที ไม่ทยอยโชว์คิวที่เหลือต่อ
          pendingQueueRef.current = "";
          finalize();
        } else if (pendingQueueRef.current.length === 0) {
          finalize();
        }
        // ถ้ายังมีคิวค้างอยู่และไม่ error ปล่อยให้ reveal loop ทยอยโชว์จนหมดแล้ว finalize เอง
      }
    },
    [
      appendStreamingDelta,
      commitStreamingMessage,
      resetStreamingBuffer,
      setIsStreaming,
      stopRevealLoop,
    ],
  );

  return { send, error };
}
