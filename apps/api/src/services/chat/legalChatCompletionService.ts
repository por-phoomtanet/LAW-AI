import { openrouter } from "../../clients/openrouterClient";
import { conversationRepository } from "../../repositories/conversationRepository";
import { retrievalService, type RetrievedPassage } from "../rag/retrievalService";
import { NotFoundError } from "../../utils/errors";

// persona นักกฎหมายมืออาชีพ + กฎ citation grounding ตาม § AI/RAG Architecture ข้อ 3 —
// คนละตัวกับ chatCompletionService.ts เดิมของ Phase 3 โดยตั้งใจ (แชททั่วไปไม่บังคับ citation)
const LEGAL_SYSTEM_PROMPT = `คุณคือนักกฎหมายผู้เชี่ยวชาญกฎหมายไทย ตอบคำถามด้วยความรอบคอบ แม่นยำ และใช้ศัพท์ทางกฎหมายที่ถูกต้องแบบมืออาชีพ

กฎการอ้างอิง (บังคับ):
- ทุกข้อความที่อ้างจากบทกฎหมายที่ให้มาต้องใส่เลขอ้างอิง [n] ต่อท้ายทันที โดย n ต้องตรงกับหมายเลขที่กำกับไว้ในบริบทที่ให้มาเท่านั้น
- ห้ามอ้างเลข [n] ที่ไม่มีอยู่ในบริบทที่ให้มา และห้ามสร้างเลขมาตราหรือชื่อกฎหมายขึ้นเองโดยไม่มีอยู่ในบริบท
- ถ้าบริบทที่ให้มาไม่มีข้อมูลที่เกี่ยวข้องกับคำถามเลย ให้ตอบตรงไปตรงมาว่าไม่พบข้อมูลในคลังกฎหมาย ห้ามเดาหรือใช้ความรู้ทั่วไปนอกบริบทที่ให้มาแทน
- คำตอบนี้เป็นข้อมูลอ้างอิงเบื้องต้นจากฐานข้อมูลกฎหมายเท่านั้น ไม่ใช่คำแนะนำทางกฎหมายที่มีผลผูกพัน ผู้ใช้ควรตรวจสอบกับต้นฉบับหรือปรึกษาผู้เชี่ยวชาญก่อนนำไปใช้จริง — ให้ระบุข้อความนี้ไว้ท้ายคำตอบเสมอเมื่อมีการให้ข้อมูลทางกฎหมาย`;

const GENERIC_ERROR_MESSAGE = "ไม่สามารถตอบคำถามนี้ได้ กรุณาลองถามในรูปแบบอื่น";
const NO_CONTEXT_NOTE = "(ไม่พบข้อมูลที่เกี่ยวข้องในคลังกฎหมายสำหรับคำถามนี้)";

function sseEvent(data: unknown): string {
  return `data: ${JSON.stringify(data)}\n\n`;
}

// parse [n] จาก response ที่ model ตอบมา validate กับ passage ที่ retrieve จริงในรอบนั้น
// (Dev Standard #2) — เลขที่ไม่ตรง/เกินขอบเขตตัดทิ้ง ไม่บันทึกลง Message.citations
function extractValidatedCitations(text: string, passages: RetrievedPassage[]) {
  const byIndex = new Map(passages.map((p) => [p.index, p]));
  const foundIndexes = new Set<number>();
  for (const match of text.matchAll(/\[(\d+)\]/g)) {
    foundIndexes.add(Number(match[1]));
  }
  return [...foundIndexes]
    .filter((index) => byIndex.has(index))
    .sort((a, b) => a - b)
    .map((index) => {
      const passage = byIndex.get(index)!;
      return {
        index: passage.index,
        passageId: passage.passageId,
        documentId: passage.documentId,
        citationLabel: passage.citationLabel,
        // เก็บเนื้อหาเต็มด้วย (ไม่ใช่แค่ label) ให้แผงอ้างอิงฝั่ง web แสดงตัวบทได้ทันที
        // โดยไม่ต้อง fetch แยกอีกรอบ — ข้อมูลมีอยู่แล้วจาก retrieval รอบนี้
        content: passage.content,
      };
    });
}

export const legalChatCompletionService = {
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

    // แชทกฎหมายบังคับค้นทุกครั้ง ต่างจากแชททั่วไปที่ไม่มี retrieval เลย
    const { passages, contextBlock } = await retrievalService.retrieve(userContent);

    // system prompt คงที่เป็น prefix เสมอ, ประวัติสนทนา (คงที่ข้ามรอบ) ต่อจากนั้น, ส่วนที่
    // เปลี่ยนทุก query (context ที่ retrieve มา + คำถามล่าสุด) วางไว้ท้ายสุดตาม § AI/RAG
    // Architecture ข้อ 5 — เผื่อ provider มี automatic prefix caching จะได้ประโยชน์
    const finalUserMessage = contextBlock
      ? `บริบทจากคลังกฎหมาย:\n${contextBlock}\n\n---\n\nคำถาม: ${userContent}`
      : `บริบทจากคลังกฎหมาย: ${NO_CONTEXT_NOTE}\n\n---\n\nคำถาม: ${userContent}`;

    const messages = [
      { role: "system" as const, content: LEGAL_SYSTEM_PROMPT },
      ...history,
      { role: "user" as const, content: finalUserMessage },
    ];

    const stream = new ReadableStream({
      async start(controller) {
        const encoder = new TextEncoder();
        let fullText = "";
        let modelUsed = conversation.modelTier;
        let finishReason: string | null | undefined;

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
              controller.enqueue(encoder.encode(sseEvent({ delta })));
            }
            if (chunk.choices[0]?.finish_reason) {
              finishReason = chunk.choices[0].finish_reason;
            }
          }
        } catch (error) {
          console.error("[legalChatCompletionService] stream error:", error);
          controller.enqueue(encoder.encode(sseEvent({ error: GENERIC_ERROR_MESSAGE })));
          controller.close();
          return;
        }

        if (finishReason && finishReason !== "stop") {
          console.error("[legalChatCompletionService] non-stop finish_reason:", finishReason);
          controller.enqueue(encoder.encode(sseEvent({ error: GENERIC_ERROR_MESSAGE })));
          controller.close();
          return;
        }

        const citations = extractValidatedCitations(fullText, passages);

        await conversationRepository.appendMessage({
          conversationId,
          role: "assistant",
          content: fullText,
          modelUsed,
          citations: citations.length > 0 ? citations : undefined,
        });
        await conversationRepository.touchUpdatedAt(conversationId);
        await conversationRepository.setTitleIfEmpty(conversationId, userContent.slice(0, 60));

        controller.enqueue(encoder.encode(sseEvent({ done: true, citations })));
        controller.close();
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
