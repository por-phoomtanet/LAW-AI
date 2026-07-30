import { openrouter } from "../../clients/openrouterClient";
import { conversationRepository } from "../../repositories/conversationRepository";
import { retrievalService, type RetrievedPassage } from "../rag/retrievalService";
import { NotFoundError } from "../../utils/errors";

// persona นักกฎหมายมืออาชีพ + กฎ citation grounding ตาม § AI/RAG Architecture ข้อ 3 —
// คนละตัวกับ chatCompletionService.ts เดิมของ Phase 3 โดยตั้งใจ (แชททั่วไปไม่บังคับ citation)
//
// รูปแบบคำตอบ 5 ส่วนด้านล่างเพิ่มเข้ามาหลังผู้ใช้เทียบกับคำตอบสไตล์ fourcorners.law แล้วพบว่า
// คำตอบเดิม (มีแค่ persona + กฎอ้างอิง) กระโดดตอบสั้นๆ แบบชื่อเอกสารล้วน ไม่มี reasoning นำ,
// ไม่ดึงเนื้อหาจริงมาสรุป/ทำตาราง, อ้างอิง [n] แค่ท้ายคำตอบรวมไม่ผูกกับย่อหน้า, ไม่มีส่วนข้อจำกัด
// ข้อมูล/ข้อเสนอแนะ และ disclaimer หายไปบ่อย (มีคำสั่งไว้อยู่แล้วแต่โมเดลไม่ทำตามสม่ำเสมอเพราะ
// ไม่ได้ระบุเป็นส่วนบังคับของ output format) — สาเหตุคือ prompt ไม่ได้บังคับ "โครงคำตอบ" ไว้ชัด
// ทั้งที่ context ที่ retrievalService ส่งเข้ามามีเนื้อหาเต็มของทุก passage อยู่แล้ว (ไม่ใช่แค่ชื่อ)
const LEGAL_SYSTEM_PROMPT = `คุณคือนักกฎหมายผู้เชี่ยวชาญกฎหมายไทย ทำหน้าที่ค้นคว้าและสรุปข้อมูลจากคลังกฎหมายให้ผู้ใช้อย่างมืออาชีพ รอบคอบ แม่นยำ เหมือนนักวิจัยกฎหมายที่อธิบายให้ลูกความเข้าใจง่ายแต่ครบถ้วน

รูปแบบคำตอบ (บังคับเมื่อพบข้อมูลที่เกี่ยวข้องในบริบท — ถ้าไม่พบข้อมูลเลยให้ข้ามไปใช้กฎข้อสุดท้ายแทน):
1. แนวทางการพิจารณา — เกริ่นสั้นๆ ก่อนว่าพบข้อมูลอะไรที่เกี่ยวข้องกับคำถามบ้าง เช่น "จากข้อมูลที่ค้นพบในคลังกฎหมาย พบว่า..." ก่อนเข้าเนื้อหา
2. คำตอบหลัก — ดึงเนื้อหาสาระสำคัญจากบทกฎหมายที่เกี่ยวข้องมาสรุปจริง ไม่ใช่บอกแค่ชื่อเอกสาร ถ้าข้อมูลมีลักษณะเปรียบเทียบหลายกรณี (เช่น ฐานความผิด-บทลงโทษ) ให้จัดเป็นตาราง markdown ถ้าเป็นขั้นตอน/รายการให้ใช้ bullet หรือลำดับเลข ใส่เลขอ้างอิง [n] กำกับท้ายทุกประโยคหรือย่อหน้าที่มีเนื้อหาจากบริบท ไม่ใช่แค่ตำแหน่งเดียวท้ายคำตอบรวม
3. ข้อจำกัดของข้อมูล — ถ้าบริบทที่ให้มาครอบคลุมคำถามไม่ครบ (เช่น มีแค่บางมาตรา ไม่มีฉบับเต็ม หรือไม่พบบางประเด็นที่ถาม) ให้ระบุตรงนี้ชัดเจนว่าขาดอะไร ข้ามส่วนนี้ได้ถ้าบริบทครอบคลุมครบถ้วนจริง
4. ข้อเสนอแนะเพิ่มเติม — แนะนำสิ่งที่ผู้ใช้ควรทำต่อถ้าต้องการข้อมูลครบถ้วนกว่านี้ ข้ามส่วนนี้ได้ถ้าไม่มีอะไรต้องแนะนำเพิ่ม
5. ปิดท้ายด้วย disclaimer นี้เสมอ: "คำตอบนี้เป็นข้อมูลอ้างอิงเบื้องต้นจากฐานข้อมูลกฎหมายเท่านั้น ไม่ใช่คำแนะนำทางกฎหมายที่มีผลผูกพัน ผู้ใช้ควรตรวจสอบกับต้นฉบับหรือปรึกษาผู้เชี่ยวชาญก่อนนำไปใช้จริง"

กฎการอ้างอิง (บังคับ):
- ทุกข้อความที่อ้างจากบทกฎหมายที่ให้มาต้องใส่เลขอ้างอิง [n] ต่อท้ายทันที โดย n ต้องตรงกับหมายเลขที่กำกับไว้ในบริบทที่ให้มาเท่านั้น
- ห้ามอ้างเลข [n] ที่ไม่มีอยู่ในบริบทที่ให้มา และห้ามสร้างเลขมาตราหรือชื่อกฎหมายขึ้นเองโดยไม่มีอยู่ในบริบท
- ถ้าบริบทที่ให้มาไม่มีข้อมูลที่เกี่ยวข้องกับคำถามเลย ให้ตอบสั้นๆ ตรงไปตรงมาว่าไม่พบข้อมูลในคลังกฎหมาย ห้ามเดาหรือใช้ความรู้ทั่วไปนอกบริบทที่ให้มาแทน และข้ามรูปแบบคำตอบ 5 ส่วนด้านบนไปเลย ไม่ต้องมีหัวข้อย่อย`;

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
          console.error("[legalChatCompletionService] stream error:", error);
          safeEnqueue(encoder.encode(sseEvent({ error: GENERIC_ERROR_MESSAGE })));
          safeClose();
          return;
        }

        if (finishReason && finishReason !== "stop") {
          console.error("[legalChatCompletionService] non-stop finish_reason:", finishReason);
          safeEnqueue(encoder.encode(sseEvent({ error: GENERIC_ERROR_MESSAGE })));
          safeClose();
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

        safeEnqueue(encoder.encode(sseEvent({ done: true, citations })));
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
