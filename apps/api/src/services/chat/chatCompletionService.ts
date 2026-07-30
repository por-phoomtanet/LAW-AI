import { openrouter } from "../../clients/openrouterClient";
import { conversationRepository } from "../../repositories/conversationRepository";
import { NotFoundError } from "../../utils/errors";

// system prompt แบบ general-purpose assistant — ไม่ใช่ RAG-grounded prompt จาก
// § AI/RAG Architecture ข้อ 3 ของ CLAUDE.md (ตั้งใจไม่บังคับ citation รอบนี้ ตาม
// การตัดสินใจของผู้ใช้ที่จะทำ demo ใหม่แบบ chat ทั่วไปก่อน)
const SYSTEM_PROMPT =
  "คุณคือ LAW-AI ผู้ช่วย AI ที่ตอบเป็นภาษาไทยอย่างเป็นมิตรและกระชับ ตอบคำถามได้ทุกหัวข้อ ไม่จำกัดเฉพาะเรื่องกฎหมาย หากไม่แน่ใจในคำตอบให้บอกตามตรงว่าไม่แน่ใจ";

// Dev Standard #13 — แปลง finish_reason ที่ไม่ใช่ "stop" เป็นข้อความไทยทั่วไป ไม่โชว์ raw provider error
const GENERIC_ERROR_MESSAGE = "ไม่สามารถตอบคำถามนี้ได้ กรุณาลองถามในรูปแบบอื่น";

function sseEvent(data: unknown): string {
  return `data: ${JSON.stringify(data)}\n\n`;
}

export const chatCompletionService = {
  async streamReply(
    conversationId: number,
    userId: number,
    userContent: string,
  ): Promise<Response> {
    const conversation = await conversationRepository.findByIdForUser(conversationId, userId);
    if (!conversation) {
      throw new NotFoundError("ไม่พบบทสนทนา");
    }

    const history = conversation.messages.map((message) => ({
      role: message.role as "user" | "assistant",
      content: message.content,
    }));

    await conversationRepository.appendMessage({
      conversationId,
      role: "user",
      content: userContent,
    });

    const messages = [
      { role: "system" as const, content: SYSTEM_PROMPT },
      ...history,
      { role: "user" as const, content: userContent },
    ];

    const stream = new ReadableStream({
      async start(controller) {
        const encoder = new TextEncoder();
        let fullText = "";
        let modelUsed = conversation.modelTier;
        let finishReason: string | null | undefined;

        // ถ้า client ตัดการเชื่อมต่อกลางทาง (ปิดแท็บ/navigate ออก) runtime จะ tear down controller
        // เอง — enqueue/close รอบถัดไปจะ throw "Controller is already closed" ป้องกันด้วย flag นี้
        // แทนที่จะปล่อยให้ throw ซ้ำสองรอบ (ทั้งใน try และซ้ำอีกทีใน catch เอง — ไม่มี try ครอบ
        // catch จึงกลายเป็น unhandled rejection ที่ทำให้ process crash จริงตามที่เจอใน production log)
        let closed = false;
        function safeEnqueue(chunk: Uint8Array) {
          if (closed) return;
          try {
            controller.enqueue(chunk);
          } catch {
            closed = true;
          }
        }
        function safeClose() {
          if (closed) return;
          closed = true;
          try {
            controller.close();
          } catch {
            // client หายไปแล้ว ไม่มีอะไรต้องทำต่อ
          }
        }

        try {
          const completion = await openrouter.chat.completions.create({
            model: conversation.modelTier,
            messages,
            stream: true,
          });

          for await (const chunk of completion) {
            if (chunk.model) {
              modelUsed = chunk.model;
            }
            const delta = chunk.choices[0]?.delta?.content;
            if (delta) {
              fullText += delta;
              safeEnqueue(encoder.encode(sseEvent({ delta })));
            }
            if (chunk.choices[0]?.finish_reason) {
              finishReason = chunk.choices[0].finish_reason;
            }
          }
        } catch (error) {
          console.error("[chatCompletionService] stream error:", error);
          safeEnqueue(encoder.encode(sseEvent({ error: GENERIC_ERROR_MESSAGE })));
          safeClose();
          return;
        }

        if (finishReason && finishReason !== "stop") {
          console.error("[chatCompletionService] non-stop finish_reason:", finishReason);
          safeEnqueue(encoder.encode(sseEvent({ error: GENERIC_ERROR_MESSAGE })));
          safeClose();
          return;
        }

        await conversationRepository.appendMessage({
          conversationId,
          role: "assistant",
          content: fullText,
          modelUsed,
        });
        await conversationRepository.touchUpdatedAt(conversationId);
        // ตั้ง title จากข้อความแรกที่ "ตอบสำเร็จ" (ไม่ใช่แค่ข้อความแรกที่ส่งเข้ามา) — setTitleIfEmpty
        // เช็ค title:null เองอยู่แล้ว จึง idempotent และทนกรณีรอบแรกล้มเหลวก่อนตอบเสร็จได้
        await conversationRepository.setTitleIfEmpty(conversationId, userContent.slice(0, 60));

        safeEnqueue(encoder.encode(sseEvent({ done: true })));
        safeClose();
      },
      cancel() {
        // client ตัดการเชื่อมต่อ — ไม่มีอะไรต้องทำที่นี่ (safeEnqueue/safeClose ข้างในกัน throw
        // ไว้แล้วจากฝั่ง enqueue เอง) ระบุ handler ไว้เฉยๆ เพื่อไม่ให้ runtime ถือว่าไม่มีใครจัดการ
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      },
    });
  },
};
