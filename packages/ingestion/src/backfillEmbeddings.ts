// Backfill embedding ของ corpus ที่ ingest ไปแล้ว (Phase 6.2)
//
// รัน: bun run src/backfillEmbeddings.ts [--dry-run] [--limit N]
//   --dry-run  ไม่เรียก OpenAI API และไม่เขียน DB — ใช้ตรวจ query/batching/ประมาณการก่อนจ่ายเงินจริง
//   --limit N  จำกัดจำนวน passage (ทดสอบกับตัวอย่างเล็กๆ ก่อนรันเต็ม)
import { prisma, Prisma } from "@law-ai/db";
import {
  embedTexts,
  planBatches,
  toVectorLiteral,
  embeddingModelId,
  MAX_CHARS_PER_INPUT,
} from "./embeddings";

interface PendingPassage {
  id: number;
  content: string;
}

// embed เฉพาะ passage บนเวอร์ชัน isLatest เท่านั้น — retrievalService filter isLatest=true
// อยู่แล้ว การ embed เวอร์ชันเก่า (70% ของทั้งหมด: 213,734 จาก 307,368) คือจ่ายเงินทิ้งเปล่าๆ
//
// embedding IS NULL ทำให้ resume ได้เอง: สคริปต์ตายกลางทางแล้วรันใหม่จะทำต่อจากที่ค้าง
// ไม่ใช่เริ่มใหม่ทั้งหมด (สำคัญมากกับ 93k รายการที่ใช้เวลาเป็นสิบนาที)
async function fetchPending(limit: number | null): Promise<PendingPassage[]> {
  // Prisma.sql/Prisma.empty — ต่อ SQL fragment แบบยัง parameterized อยู่ (ไม่ใช่ต่อ string เอง)
  const limitClause = limit != null ? Prisma.sql`LIMIT ${limit}` : Prisma.empty;
  return prisma.$queryRaw<PendingPassage[]>`
    SELECT p.id, p.content
    FROM "Passage" p
    JOIN "DocumentVersion" v ON v.id = p."versionId"
    WHERE v."isLatest" = true
      AND p.embedding IS NULL
      AND length(trim(p.content)) > 0
    ORDER BY p.id
    ${limitClause}
  `;
}

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  const limitFlag = process.argv.indexOf("--limit");
  const limit = limitFlag !== -1 ? Number(process.argv[limitFlag + 1]) : null;

  if (!dryRun && !process.env.OPENROUTER_API_KEY) {
    throw new Error(
      "ไม่พบ OPENROUTER_API_KEY — ตั้งค่าใน .env ก่อน (หรือใช้ --dry-run เพื่อทดสอบ logic)",
    );
  }

  console.log(
    `โมเดล: ${embeddingModelId}${dryRun ? "  [DRY RUN — ไม่เรียก API/ไม่เขียน DB]" : ""}`,
  );

  const pending = await fetchPending(limit);
  if (pending.length === 0) {
    console.log("ไม่มี passage ที่ต้อง embed (backfill ครบแล้ว)");
    return;
  }

  const batches = planBatches(pending, (p) => p.content);
  const totalChars = pending.reduce(
    (sum, p) => sum + Math.min(p.content.length, MAX_CHARS_PER_INPUT),
    0,
  );
  console.log(
    `ต้อง embed ${pending.length.toLocaleString()} passages ` +
      `(${(totalChars / 1_000_000).toFixed(1)}M ตัวอักษร) ใน ${batches.length.toLocaleString()} batches`,
  );

  if (dryRun) {
    // อัตราส่วนวัดจากของจริง ไม่ใช่เดา: sample 20 passages = 7,441 ตัวอักษร → 7,046 token
    // = 1.06 ตัวอักษร/token — ภาษาไทย tokenize แย่กว่าที่ประเมินไว้ตอนแรกมาก (เคยเดา 1.5-2.5)
    // เกือบ 1 token ต่อ 1 ตัวอักษร ทำให้ค่าใช้จ่ายจริงสูงกว่าประมาณการเดิมเกือบ 2 เท่า
    const CHARS_PER_TOKEN = 1.06;
    const estTokens = totalChars / CHARS_PER_TOKEN;
    const rate = embeddingModelId.includes("-large") ? 0.13 : 0.02;
    console.log(
      `ประมาณการ: ~${(estTokens / 1e6).toFixed(1)}M token ` +
        `≈ $${((estTokens / 1e6) * rate).toFixed(2)} ` +
        `(อัตรา $${rate}/1M token, ${CHARS_PER_TOKEN} ตัวอักษร/token วัดจาก sample จริง)`,
    );
    return;
  }

  const start = Date.now();
  let done = 0;
  let totalTokens = 0;

  for (const [i, batch] of batches.entries()) {
    const { embeddings, promptTokens } = await embedTexts(batch.map((p) => p.content));
    totalTokens += promptTokens;

    // เขียนทีละแถวใน transaction เดียวต่อ batch — Prisma Client ไม่มี field Unsupported
    // ใน update type ต้องผ่าน $executeRaw เท่านั้น (ข้อจำกัดเดิมตั้งแต่ seed ใน 1.11)
    await prisma.$transaction(
      batch.map(
        (passage, idx) =>
          prisma.$executeRaw`
          UPDATE "Passage"
          SET embedding = ${toVectorLiteral(embeddings[idx])}::halfvec
          WHERE id = ${passage.id}
        `,
      ),
    );

    done += batch.length;
    if ((i + 1) % 20 === 0 || i === batches.length - 1) {
      const elapsed = (Date.now() - start) / 1000;
      const rate = done / elapsed;
      const remaining = (pending.length - done) / rate;
      console.log(
        `  ${done.toLocaleString()}/${pending.length.toLocaleString()} ` +
          `(${((done / pending.length) * 100).toFixed(1)}%) ` +
          `· ${totalTokens.toLocaleString()} tokens ` +
          `· เหลืออีก ~${Math.round(remaining / 60)} นาที`,
      );
    }
  }

  const rate = embeddingModelId.includes("-large") ? 0.13 : 0.02;
  console.log(
    `\nเสร็จ: ${done.toLocaleString()} passages, ${totalTokens.toLocaleString()} tokens ` +
      `≈ $${((totalTokens / 1e6) * rate).toFixed(2)} ` +
      `ใน ${((Date.now() - start) / 60000).toFixed(1)} นาที`,
  );
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => process.exit(0));
