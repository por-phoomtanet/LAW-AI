# LAW-AI — ผู้ช่วยกฎหมายไทย AI (Thai Legal AI Research Assistant)

แพลตฟอร์ม AI Chat สำหรับค้นคว้ากฎหมายไทย — ผู้ใช้ถามคำถามภาษาไทยเกี่ยวกับกฎหมาย/คำพิพากษา แล้วได้คำตอบพร้อม**การอ้างอิงที่ตรวจสอบย้อนกลับไปยังต้นฉบับได้ (verifiable citations)** แนวทางเดียวกับ fourcorners.law — ไม่เดา ไม่มโน ทุกคำตอบต้องสืบไปที่มาตรา/คำพิพากษาต้นฉบับได้

---

## ขอบเขตระบบ (Scope)

### ✅ ทำได้ใน Phase นี้
| ระบบ | Feature |
|---|---|
| AI Chat | ถาม-ตอบภาษาไทย, RAG grounding, citation ต่อคำตอบ, streaming response, เลือก model tier (Lite/Standard/Pro), ประวัติการสนทนา |
| คลังกฎหมาย (Law Library) | Ingest **ตัวบทกฎหมาย** จาก Open Law Data Thailand (`ocs-krisdika` + `soc-ratchakitcha`), chunk + embed, ค้นหาแบบ full-text + semantic, browse ตามหมวดหมู่ |
| Auth | Login/JWT, Role (admin/researcher/subscriber), User Management, Usage quota per tier |

> ⚠️ **คำพิพากษา (case law) ไม่อยู่ใน Phase นี้** — ยังไม่พบ bulk dataset สาธารณะของคำพิพากษาศาลฎีกาไทยที่ใหญ่พอ (ดู § AI/RAG Architecture ข้อ 6 — Data Sources) ระบบ Phase 1 จึงเป็น**ตัวบทกฎหมายเท่านั้น** ไม่ใช่ "กฎหมาย+คำพิพากษา" แบบ fourcorners.law เต็มรูปแบบ

### 🔜 Phase ถัดไป (ทำทีหลัง)
| ระบบ | เหตุผลที่เลื่อน |
|---|---|
| คำพิพากษาศาลฎีกา (case law ingestion) | ไม่มี bulk dataset สาธารณะ — ต้อง scrape deka.supremecourt.or.th เอง (ต้องเช็ค ToS ก่อน) หรือหา partnership กับหน่วยงาน แยกเป็น workstream ต่างหากจากตัวบทกฎหมาย |
| เปรียบเทียบเอกสารกฎหมาย (side-by-side diff) | ต้องมี document library ที่สมบูรณ์ก่อน |
| Export บทวิเคราะห์เป็น PDF/Word | ไม่ critical สำหรับ MVP |
| Subscription/Billing (Stripe) | รอ validate product-market fit ก่อน |
| Multi-agent (coordinator แยกค้นกฎหมาย vs คำพิพากษา) | เพิ่ม complexity โดยไม่จำเป็นถ้า single-agent RAG พอ, รอ Phase คำพิพากษาก่อน |

---

## Tech Stack

- **Docker** — containerize ทุก service
- **PostgreSQL + pgvector extension** — relational DB หลัก + vector store สำหรับ RAG (ไม่แยก vector DB ต่างหาก เพื่อลด moving parts)
- **Prisma ORM** — schema, migration, type-safe query (เวกเตอร์ column ใช้ `Unsupported("vector(n)")`)
- **OpenRouter** — LLM หลักสำหรับ chat/citation grounding, เรียกผ่าน OpenAI-compatible Chat Completions API (`OPENROUTER_API_KEY`, `OPENROUTER_MODEL` — default `deepseek/deepseek-v4-flash`) ดู § AI / RAG Architecture
- **OpenAI Embeddings** — text embeddings สำหรับ RAG (`EMBEDDING_MODEL=openai/text-embedding-3-small`) — เรียกตรงผ่าน OpenAI Embeddings API เพราะ OpenRouter ไม่มี embeddings endpoint (ดูหมายเหตุใน § AI / RAG Architecture ข้อ 2)
- **Next.js 15** (App Router) — chat UI + admin dashboard
- **Tailwind CSS** — utility-first styling (หน้า chat เขียน custom component ไม่ใช้ Ant Design Table-heavy pattern)
- **Ant Design** — เฉพาะฝั่ง admin/library management (Table, Form, Modal)
- **Axios** — HTTP client (single instance, interceptors) — endpoint แชทใช้ `fetch` + `ReadableStream` แทน เพราะต้อง stream SSE
- **Zustand** — global state (authStore, chatStore — เก็บ conversation ปัจจุบัน + streaming buffer)
- **Bun + Elysia** — runtime + web framework สำหรับ REST API + SSE endpoint (Bun แทน Node.js, Elysia แทน Express)
- **JWT + bcrypt** — Authentication / Authorization (`@elysiajs/jwt` สำหรับ JWT, `Bun.password` built-in ของ runtime สำหรับ bcrypt hash — ไม่ใช้ `bcryptjs` เพิ่มเป็น dependency)
- **Bun test (native)** — Unit & Integration test (API) — ทดสอบ Elysia route ตรงผ่าน `app.handle(new Request(...))` ไม่ต้องพึ่ง Supertest (Supertest ผูกกับ Express `http.Server`) — mock OpenRouter/OpenAI SDK ใน test อย่าเรียก API จริง
- **Git Monorepo** — จัดการ codebase

---

## AI / RAG Architecture

> ระบบนี้ใช้ **OpenRouter** (ไม่ใช่ Anthropic API โดยตรง) — ทุก client call ต้องใช้ OpenAI-compatible SDK (`openai` package, `baseURL: "https://openrouter.ai/api/v1"`) ห้ามใช้ `@anthropic-ai/sdk` แม้ underlying model บาง provider บน OpenRouter จะเป็น Claude ก็ตาม เพราะ wire format/response shape เดินตาม OpenAI Chat Completions ทั้งหมด

### 1. Model Selection — OpenRouter (single default model)

| Env var | ค่า default | ใช้ทำอะไร |
|---|---|---|
| `OPENROUTER_API_KEY` | — | auth กับ OpenRouter |
| `OPENROUTER_MODEL` | `deepseek/deepseek-v4-flash` | model id ที่ใช้ตอบคำถามทั้งหมด |

- ไม่มี tier Lite/Standard/Pro แบบหลายโมเดลใน MVP นี้ — ใช้โมเดลเดียวตาม `OPENROUTER_MODEL` เพื่อความง่าย ถ้าต้องการ multi-tier ในอนาคต ให้เปลี่ยน `Conversation.modelTier` จาก enum เป็น **เก็บ OpenRouter model id string ตรงๆ** (เช่น `"deepseek/deepseek-v4-flash"`, `"anthropic/claude-opus-5"`) แทนการ hardcode ชื่อ tier — จะสลับ/เพิ่มโมเดลได้โดยไม่ต้อง migrate schema
- อ่านค่า `OPENROUTER_MODEL` จาก env เสมอ **ห้าม hardcode model id ในโค้ด** — เปลี่ยนโมเดลได้โดยไม่ต้อง deploy ใหม่
- Reasoning/effort parameter แตกต่างกันตาม provider ที่ OpenRouter proxy ให้ (บาง model รองรับ `reasoning: {effort: "..."}` แบบ OpenRouter's unified reasoning param, บางตัวไม่รองรับเลย) — เช็ค [openrouter.ai/docs](https://openrouter.ai/docs) ของ model นั้นๆ ก่อน ห้ามสมมติว่าใช้ `thinking`/`output_config.effort` แบบ Anthropic ได้ตรงๆ
- Handle finish/stop reason ที่ไม่ใช่ `"stop"` เสมอ (เช่น `"length"`, `"content_filter"`) — OpenRouter ส่ง error/finish_reason ต่างจาก Anthropic's `stop_reason: "refusal"`

### 2. Embeddings — OpenAI Embeddings API (ไม่ผ่าน OpenRouter)

| Env var | ค่า default |
|---|---|
| `EMBEDDING_MODEL` | `openai/text-embedding-3-small` |
| `OPENAI_API_KEY` | ต้องมีแยกต่างหาก |

**OpenRouter ไม่มี embeddings endpoint** (รองรับแค่ chat/completions) — เรียก OpenAI Embeddings API ตรง (`https://api.openai.com/v1/embeddings`) ด้วย `OPENAI_API_KEY` คนละตัวกับ `OPENROUTER_API_KEY` โดยตัด prefix `"openai/"` ออกจาก `EMBEDDING_MODEL` ก่อนส่ง (`text-embedding-3-small` คือ model id จริงฝั่ง OpenAI, ส่วน `"openai/"` เป็น namespace convention แบบ OpenRouter เท่านั้น)

ใช้สำหรับ:
- Embed ทุก `DocumentChunk` ตอน ingest (batch embedding, `text-embedding-3-small` = 1536 มิติ — ต้องปรับ `vector(n)` ใน Prisma schema ให้ตรง ไม่ใช่ 1024 แบบเดิม)
- Embed query ของ user ก่อนค้นหาใน `pgvector`

### 3. RAG Retrieval Pipeline

```
User query (TH)
  → embed query ผ่าน OpenAI Embeddings API (text-embedding-3-small)
  → pgvector cosine similarity search บน DocumentChunk.embedding (top-K, K=8-12)
  → filter เพิ่มด้วย metadata (document.type, citationCode ตรง exact match ถ้า query ระบุมาตราชัดเจน)
  → ใส่ chunk แต่ละอันเป็นข้อความมีเลขกำกับ [1] [2] ... ต่อท้าย system/context message
  → ส่งเข้า OpenRouter Chat Completions พร้อม system prompt ที่บังคับให้ตอบแบบอ้างอิงเลข [n]
  → Backend parse การอ้างอิง [n] จาก response แล้ว validate ว่าเลขนั้นตรงกับ chunk ที่ retrieve จริง
  → บันทึก citations (ที่ validate แล้ว) ลง Message.citations เพื่อ render เป็นลิงก์ไปต้นฉบับใน UI
```

**กฎ Citation Grounding (บังคับ) — สำคัญกว่าเดิมเพราะไม่มี native citation feature:**
- โมเดลทั่วไปบน OpenRouter **ไม่มี native citation feature เหมือน Anthropic's `citations: {enabled: true}`** — ต้องสร้างกลไก grounding เองทั้งหมด:
  1. ใส่เลขกำกับ chunk ทุกอันในสารบัญ context เช่น `[1] มาตรา 420 ป.พ.พ.: ...` `[2] คำพิพากษาฎีกาที่ ...: ...`
  2. System prompt สั่งชัดเจน: *"ทุกข้อความที่อ้างจากกฎหมาย/คำพิพากษา ต้องใส่เลขอ้างอิง [n] ต่อท้ายทันที ห้ามตอบโดยไม่มี [n] กำกับ ถ้าไม่พบข้อมูลใน context ที่ให้มา ให้ตอบว่าไม่พบข้อมูล ห้ามคาดเดาหรือใช้ความรู้ทั่วไปนอก context คำตอบนี้เป็นข้อมูลอ้างอิงเบื้องต้นจากฐานข้อมูลกฎหมายเท่านั้น ไม่ใช่คำแนะนำทางกฎหมายที่มีผลผูกพัน ผู้ใช้ควรตรวจสอบกับต้นฉบับหรือปรึกษาผู้เชี่ยวชาญก่อนนำไปใช้จริง"* (ส่วน disclaimer มาจากเงื่อนไขของ dataset ต้นทาง `open-law-data-thailand` เอง — ดู § ข้อ 6)
  3. **Backend ต้อง validate ทุก [n] ที่โมเดลตอบมา** — เทียบกับรายการ chunk ที่ retrieve จริงในรอบนั้น ถ้าเลขไม่ตรง/เกินขอบเขต ให้ตัดออกหรือ flag ว่า unverified ก่อนแสดงผล **ห้ามเชื่อ output ของโมเดลโดยไม่ validate**
  4. ถ้า provider ที่เลือกใน `OPENROUTER_MODEL` รองรับ structured output (`response_format: {type: "json_schema", ...}` แบบ OpenAI) ให้ใช้แทนการ parse `[n]` จาก free text — บังคับ schema `{ answer: string, citations: [{ chunkIndex: number, quote: string }] }` แล้ว validate `chunkIndex` เหมือนเดิม เพื่อความแม่นยำสูงกว่าการ regex

### 4. Streaming (SSE) สำหรับ Chat UI

- API endpoint `POST /api/conversations/:id/messages` เปิด SSE (`Content-Type: text/event-stream`) ฝั่ง Elysia — คืนค่าเป็น `Response` ที่มี `ReadableStream` body (Elysia รองรับ `Response` ของ Web standard โดยตรง ไม่ต้องเขียน raw `res.write()` แบบ Express)
- เรียก OpenRouter ด้วย `stream: true` (OpenAI-compatible Chat Completions) แล้ว forward แต่ละ `choices[0].delta.content` เป็น SSE event ให้ frontend
- Frontend ใช้ `fetch` + `ReadableStream` reader (ไม่ใช้ Axios instance เดิมสำหรับ endpoint นี้)
- เมื่อ stream จบ → รวม delta ทั้งหมดเป็นคำตอบเต็ม, parse/validate citations (ตาม § ข้อ 3), แล้วค่อย persist ลง DB (การ persist ทำหลัง stream จบ ไม่ทำระหว่าง stream)

### 5. Prompt/Context Caching — อย่าสมมติพฤติกรรมแบบ Anthropic

- **OpenRouter ไม่รับประกัน prompt caching แบบ Anthropic's `cache_control`** — พฤติกรรม caching (ถ้ามี) ขึ้นกับ provider ที่ underlying model นั้นรันอยู่ ต้องเช็ค OpenRouter docs ของ `OPENROUTER_MODEL` ที่เลือกใช้จริงก่อนว่ารองรับหรือไม่ และเปิดใช้อย่างไร (บางตัวมี automatic prefix caching โดยไม่ต้องส่ง parameter พิเศษ)
- **สิ่งที่ทำได้แน่นอนโดยไม่พึ่ง provider-specific feature**: ออกแบบ prompt ให้ system prompt (persona + กฎ citation grounding) เป็นเนื้อหาคงที่และวางไว้เป็น prefix เสมอ, ส่วนที่เปลี่ยนทุก query (retrieved chunks, คำถาม) วางไว้ท้ายสุด — เผื่อกรณี provider มี automatic prefix caching จะได้ประโยชน์โดยไม่ต้องแก้โค้ดเพิ่ม
- ห้าม hardcode logic ที่อ้างอิง `cache_creation_input_tokens`/`cache_read_input_tokens` (field เฉพาะของ Anthropic) — ถ้าต้องการวัด cost saving จริง ให้ดูจาก `usage` field ที่ OpenRouter ส่งกลับตาม provider นั้นๆ

### 6. Data Sources & Ingestion Pipeline

**แหล่งข้อมูล — [Open Law Data Thailand](https://huggingface.co/open-law-data-thailand)** (HuggingFace org, CC-BY-4.0, ต้อง attribution)

| Dataset | ใช้ทำอะไร | หมายเหตุ |
|---|---|---|
| [`ocs-krisdika`](https://huggingface.co/datasets/open-law-data-thailand/ocs-krisdika) | ตัวบทกฎหมาย (พ.ร.บ./ประมวลกฎหมาย) — แหล่งหลักของ Phase 1 | JSON Lines แบ่งตามปี/เดือน, chunk ตามมาตรามาให้แล้วใน `sections[]` — ไม่ต้อง chunk เอง |
| [`soc-ratchakitcha`](https://huggingface.co/datasets/open-law-data-thailand/soc-ratchakitcha) | ราชกิจจานุเบกษา (ประกาศ/กฎกระทรวงที่ไม่อยู่ใน krisdika) | 192GB เต็มชุด — **MVP ดึงแค่ metadata + OCR text เฉพาะหมวด/ช่วงเวลาที่เกี่ยวข้อง อย่า ingest ทั้งหมด** |

**ไม่มีแหล่งคำพิพากษา** — ทั้งสอง dataset ไม่ครอบคลุมคำพิพากษาศาลฎีกา (ดู § ขอบเขตระบบ — ย้ายไป Phase ถัดไป)

**ดาวน์โหลด**: ใช้ `huggingface_hub` (Python) หรือดึงไฟล์ผ่าน HTTP ตรงจาก `resolve/main/...` ก็ได้เพราะเป็น public dataset ไม่ต้องมี HF token สำหรับ read-only (แต่ควรใส่ `HF_TOKEN` ถ้าโดน rate limit)

**Field mapping — `ocs-krisdika` → Prisma:**

| Dataset field | Prisma field |
|---|---|
| `title` | `LegalDocument.title` |
| `law_code` | `LegalDocument.citationCode` |
| `publish_date` | `LegalDocument.publishedAt` |
| `is_latest` | `LegalDocument.isActive` |
| `reference_url` | `LegalDocument.sourceUrl` (ลิงก์กลับไป searchlaw.ocs.go.th ให้ user เช็คต้นฉบับสด) |
| `sections[].sectionId` | `DocumentChunk.chunkIndex` + ต่อท้ายใน `citationCode` (เช่น "มาตรา 420") |
| `sections[].content` | `DocumentChunk.content` |

**Pipeline**: Script แยกต่างหาก (`packages/ingestion` หรือ cron job) ดาวน์โหลด dataset → map field ตามตารางบน → chunk ตามมาตราที่ dataset แบ่งมาให้แล้ว (ไม่ต้องเขียน logic แยกมาตราเอง สำหรับ `ocs-krisdika`; ต้องแยกเองสำหรับ `soc-ratchakitcha` เพราะเป็น OCR text ดิบ) → embed ผ่าน OpenAI Embeddings API → upsert เข้า `DocumentChunk`

- Deduplicate ด้วย `contentHash` ก่อน re-embed ซ้ำ (ประหยัด OpenAI Embeddings API cost เวลารัน ingestion ซ้ำ หรือ dataset มีการอัปเดต)
- แสดง attribution "ข้อมูลจาก Open Law Data Thailand (CC-BY-4.0)" ที่ footer หรือหน้า About ของเว็บ (เงื่อนไข license บังคับ)
- ต้องมี disclaimer ในทุกคำตอบ AI ว่าเป็นข้อมูลอ้างอิงเบื้องต้น ไม่ใช่คำแนะนำทางกฎหมายที่มีผลผูกพัน (ตาม disclaimer ของ dataset ต้นทางเอง) — ใส่ไว้ใน system prompt ถาวร

---

## Monorepo Structure

```
LAW-AI/
├── apps/
│   ├── api/
│   │   ├── src/
│   │   │   ├── routes/
│   │   │   ├── controllers/
│   │   │   ├── services/
│   │   │   │   ├── chat/              # orchestrate: retrieve → call OpenRouter → stream → validate citations → persist
│   │   │   │   ├── rag/               # embedding query, pgvector search, chunk ranking
│   │   │   │   └── ingestion/         # ดึง+chunk+embed เอกสารกฎหมาย
│   │   │   ├── repositories/          # Prisma queries เท่านั้น
│   │   │   ├── plugins/               # Elysia plugins — authGuard.ts, roleGuard.ts (แทน Express middleware)
│   │   │   ├── clients/               # openrouterClient.ts, embeddingClient.ts — instance เดียวต่อ SDK
│   │   │   ├── types/
│   │   │   └── utils/
│   │   ├── tests/
│   │   └── package.json
│   └── web/
│       ├── app/
│       │   ├── (auth)/login/page.tsx
│       │   ├── (chat)/
│       │   │   ├── layout.tsx
│       │   │   └── c/[conversationId]/page.tsx
│       │   ├── (dashboard)/            # admin: library, users, roles
│       │   │   ├── layout.tsx
│       │   │   ├── library/page.tsx
│       │   │   └── users/page.tsx
│       │   ├── layout.tsx
│       │   └── globals.css
│       ├── modules/
│       │   ├── auth/
│       │   ├── chat/
│       │   │   ├── components/         # ChatWindow, MessageBubble, CitationCard, ModelTierSelect
│       │   │   ├── hooks/              # useChatStream — fetch + ReadableStream reader
│       │   │   ├── services/           # chatApi.ts
│       │   │   └── types.ts
│       │   ├── library/                # browse กฎหมาย/คำพิพากษา (admin + read-only user view)
│       │   └── users/
│       ├── shared/
│       ├── services/api.ts             # Axios instance — ใช้กับทุก endpoint ยกเว้น chat streaming
│       ├── store/
│       │   ├── authStore.ts
│       │   └── chatStore.ts            # conversation ปัจจุบัน + streaming buffer (Zustand)
│       ├── types/
│       ├── constants/
│       └── lib/
├── packages/
│   └── db/
│       ├── prisma/
│       │   ├── schema.prisma
│       │   └── migrations/
│       ├── src/
│       └── package.json
├── docker-compose.yml
└── package.json
```

---

## User Roles

| Role | คำอธิบาย |
|---|---|
| `admin` | จัดการ library, users, roles, ดู usage/cost ทั้งระบบ |
| `researcher` | สิทธิ์เต็มในการถาม-ตอบทุก tier รวม Pro, ไม่จำกัด quota |
| `subscriber` | ใช้ตาม quota ของแพ็กเกจ (จำนวนคำถาม/เดือน ต่อ tier) |

---

## Data Models (Prisma Schema)

```prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider   = "postgresql"
  url        = env("DATABASE_URL")
  directUrl  = env("DIRECT_URL")
  extensions = [vector]
}

model Role {
  id          Int              @id @default(autoincrement())
  name        String           @unique
  label       String
  createdAt   DateTime         @default(now())
  users       User[]
  permissions RolePermission[]
}

model RolePermission {
  id        Int      @id @default(autoincrement())
  roleId    Int
  role      Role     @relation(fields: [roleId], references: [id])
  menuKey   String
  canView   Boolean  @default(true)
  canCreate Boolean  @default(false)
  canUpdate Boolean  @default(false)
  canDelete Boolean  @default(false)
  updatedAt DateTime @updatedAt

  @@unique([roleId, menuKey])
}

model User {
  id            Int            @id @default(autoincrement())
  name          String
  email         String         @unique
  passwordHash  String
  roleId        Int
  role          Role           @relation(fields: [roleId], references: [id])
  isActive      Boolean        @default(true)
  createdAt     DateTime       @default(now())
  deletedAt     DateTime?
  conversations Conversation[]
}

// เอกสารกฎหมายต้นฉบับ 1 รายการ (กฎหมาย 1 ฉบับ / คำพิพากษา 1 คดี)
model LegalDocument {
  id           Int             @id @default(autoincrement())
  type         String          // "statute" | "court_decision" | "regulation"
  title        String
  citationCode String?         // เช่น "มาตรา 420 ป.พ.พ." หรือเลขคดี
  sourceUrl    String?
  publishedAt  DateTime?
  isActive     Boolean         @default(true)
  createdAt    DateTime        @default(now())
  updatedAt    DateTime        @updatedAt
  chunks       DocumentChunk[]

  @@index([type])
}

// Chunk ระดับมาตรา/ย่อหน้า พร้อม embedding สำหรับ semantic search
model DocumentChunk {
  id           Int                     @id @default(autoincrement())
  documentId   Int
  document     LegalDocument           @relation(fields: [documentId], references: [id])
  content      String                  @db.Text
  chunkIndex   Int
  contentHash  String                  // dedupe ก่อน re-embed
  embedding    Unsupported("vector(1536)")  // 1536 มิติ = text-embedding-3-small ของ OpenAI (EMBEDDING_MODEL)
  createdAt    DateTime                @default(now())

  @@index([documentId])
  @@unique([documentId, chunkIndex])
}

model Conversation {
  id        Int       @id @default(autoincrement())
  userId    Int
  user      User      @relation(fields: [userId], references: [id])
  title     String?
  modelTier String    @default("deepseek/deepseek-v4-flash") // เก็บ OpenRouter model id ตรงๆ ไม่ใช่ enum tier
  createdAt DateTime  @default(now())
  updatedAt DateTime  @updatedAt
  messages  Message[]
  deletedAt DateTime?
}

model Message {
  id             Int          @id @default(autoincrement())
  conversationId Int
  conversation   Conversation @relation(fields: [conversationId], references: [id])
  role           String       // "user" | "assistant"
  content        String       @db.Text
  citations      Json?        // [{ documentId, chunkId, citedText, location }]
  modelUsed      String?      // model id ที่ใช้ตอบจริง (เผื่อ fallback)
  createdAt      DateTime     @default(now())

  @@index([conversationId])
}
```

**หมายเหตุ pgvector index**: index สำหรับ approximate nearest neighbor (เช่น `ivfflat` หรือ `hnsw`) ต้องสร้างผ่าน raw SQL migration เพราะ Prisma schema syntax ยังไม่รองรับ vector index โดยตรง — ใช้ `prisma db execute --file` แยกหลัง `db push`/`migrate`

---

## API Endpoints

| Method | Path | Auth | คำอธิบาย |
|---|---|---|---|
| POST | `/api/auth/login` | * | Login รับ JWT |
| GET | `/api/auth/me` | auth | ดูข้อมูลตัวเอง |
| GET | `/api/health` | * | Health check |
| GET/POST | `/api/conversations` | auth | รายการ / สร้างบทสนทนาใหม่ |
| GET/DELETE | `/api/conversations/:id` | auth | ดู / ลบบทสนทนา |
| POST | `/api/conversations/:id/messages` | auth | ส่งคำถาม — **SSE stream** คำตอบกลับ |
| GET | `/api/documents` | auth | รายการเอกสารกฎหมาย (browse/ค้นหา keyword) |
| GET | `/api/documents/:id` | auth | ดูเอกสารกฎหมายเต็ม |
| POST | `/api/admin/documents/ingest` | admin | trigger ingestion job (upload/URL แหล่งข้อมูล) |
| GET/POST | `/api/users` | auth | จัดการ user (admin เท่านั้นสำหรับ POST) |
| GET/POST/PUT/DELETE | `/api/roles`, `/api/role-permissions` | auth/admin | Dynamic RBAC เหมือนระบบทั่วไป |

---

## Dev Standards (บังคับใช้ทุก Phase)

### 1. LLM/Embedding Client — instance เดียว
สร้าง `apps/api/src/clients/openrouterClient.ts` และ `embeddingClient.ts` เป็น singleton — ห้าม `new OpenAI()` กระจายหลายที่ในโค้ด (เสียโอกาส connection pooling + ปน env var config)

```ts
// clients/openrouterClient.ts — OpenAI-compatible SDK ชี้ไปที่ OpenRouter
import OpenAI from 'openai'
export const openrouter = new OpenAI({
  apiKey: process.env.OPENROUTER_API_KEY,
  baseURL: 'https://openrouter.ai/api/v1',
})

// clients/embeddingClient.ts — เรียก OpenAI ตรง (คนละ key จาก OpenRouter)
export const embeddingClient = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
```

### 2. Citation ต้อง validate กับ retrieved chunks เสมอ — ห้ามเชื่อ output โมเดลตรงๆ
โมเดลที่เรียกผ่าน `OPENROUTER_MODEL` ไม่มี native citation feature — ทุกครั้งที่ parse การอ้างอิง `[n]` (หรือ `citations` array จาก structured output) จาก response ต้อง cross-check กับรายการ chunk ที่ retrieve จริงในรอบนั้นก่อนบันทึก/แสดงผล เลขที่ไม่ตรง/เกินขอบเขตต้องตัดทิ้งหรือ flag เป็น unverified (ดู § AI/RAG Architecture ข้อ 3)

### 3. Input Validation — Elysia's built-in schema (TypeBox `t`) แทน Zod middleware
Elysia ผูก schema validation ไว้ในตัว route โดยตรงผ่าน `t.Object(...)` — ใช้ตรงนี้แทนการเขียน Zod middleware แยกแบบ Express เพราะ Elysia validate ให้อัตโนมัติก่อนเข้า handler (โยน validation error ที่ `.onError()` ดักแล้วแปลงเป็น response เองได้) และได้ type inference + OpenAPI schema ฟรี

```ts
app.post('/api/conversations/:id/messages', handler, {
  body: t.Object({ content: t.String({ minLength: 1 }) }),
})
```

ใช้ Zod เฉพาะจุดที่ validation logic ซับซ้อนเกินกว่า TypeBox จะแสดงออกได้ (เช่น cross-field validation ที่พึ่งพา business rule) — ไม่ใช่ default ทุก route

### 4. Global Error Handler — Elysia `.onError()`

**⚠️ ต้องใส่ `{ as: 'global' }` ถ้า error handler อยู่ใน plugin แยกไฟล์ (เช่น `plugins/errorHandler.ts`)** — Elysia's lifecycle hook (`onError`, `derive`, ฯลฯ) เป็น **local scope โดย default** แปลว่าถ้าประกาศ `.onError()` บน Elysia instance แยกต่างหากแล้ว `.use()` เข้า app หลัก hook นั้น**จะไม่ทำงาน**กับ route ที่ประกาศบน app หลัก — Elysia จะ fallback ไปใช้ error response ของตัวเอง (เช่น validation error จะได้ **422** ดิบพร้อม TypeBox error object แทนที่จะเป็น 400 ตาม format ที่กำหนดไว้ และ error ที่ throw จาก route จะไม่ถูกจับด้วย) พิสูจน์แล้วจริงจากการรัน test — ไม่ใช่แค่ทฤษฎี

```ts
// ❌ ผิด — ถ้าอยู่ใน plugin แยกไฟล์แล้ว .use() เข้า app หลัก จะไม่ทำงาน
export const errorHandler = new Elysia()
  .onError(({ code, error, set }) => { ... })

// ✅ ถูก — ระบุ { as: 'global' } เป็น argument แรกของ .onError()
export const errorHandler = new Elysia()
  .onError({ as: 'global' }, ({ code, error, set }) => {
    if (code === 'VALIDATION') { set.status = 400; return { error: error.message } }
    if (error instanceof HttpError) { set.status = error.status; return { error: error.message } }
    set.status = 500
    return { error: 'Internal server error' }
  })

// app.ts
export const app = new Elysia().use(errorHandler).get('/api/health', ...)
```

ถ้าเขียน `.onError(...)` ตรงบน instance เดียวกับที่ประกาศ route ทั้งหมด (ไม่แยก plugin) จะไม่เจอปัญหานี้ — แต่โปรเจกต์นี้แยก error handler เป็น plugin ตาม Controller-Service-Repository pattern จึงต้องระบุ `{ as: 'global' }` เสมอ

**⚠️ แต่ `{ as: 'global' }` ไม่ใช่ค่าที่ถูกต้องเสมอไป — ต้องแยกให้ออกว่า hook นั้นควรมีผล "ทั้งแอป" หรือ "เฉพาะ route group"** `global` ไหลขึ้นไปถึง app หลักและมีผลกับ**ทุก route ที่ app หลัก `.use()` เข้าไป** ไม่ใช่แค่ตัวที่ `.use()` โดยตรง — เจอมาแล้วจริงกับ `authGuard` (§ ดู plugin `authGuard.ts`): ตอนแรกใช้ `{ as: 'global' }` เหมือน `errorHandler` ผลคือ `/api/health` และ `/api/auth/login` (routes ที่**ไม่ควร**ต้องมี token) ถูกบังคับให้ต้องมี Bearer token ไปด้วย เพราะ global ไหลทะลุขึ้นไปถึง `app` ที่ mount ทุกอย่างรวมกัน

| Scope | มีผลกับ | ใช้เมื่อ |
|---|---|---|
| `local` (default) | เฉพาะ instance ที่ประกาศเอง | ไม่ต้องแชร์ข้าม plugin |
| `scoped` | instance ที่ประกาศ + parent ที่ `.use()` เข้าไป**โดยตรง** (ชั้นเดียว) | hook ที่ต้องมีผลเฉพาะ route group หนึ่ง เช่น `authGuard` — ต้องการให้ `/api/auth/me` มี `user` ใน context แต่ไม่อยากให้ `/api/health` โดนบังคับ token ไปด้วย |
| `global` | ไหลขึ้นไปทุกชั้นจนถึง app บนสุดที่ประกอบร่าง route ทั้งหมด | hook ที่ต้องมีผล**ทั้งระบบ**จริงๆ เช่น `errorHandler` — ทุก route ต้อง format error เหมือนกันหมด |

```ts
// ❌ ผิด — authGuard ใช้ { as: 'global' } ทำให้ /api/health และ login โดนบังคับ token ไปด้วย
export const authGuard = new Elysia({ name: 'authGuard' })
  .derive({ as: 'global' }, async ({ jwt, headers }) => { ... })

// ✅ ถูก — { as: 'scoped' } จำกัดผลแค่ route group ที่ .use(authGuard) โดยตรง
export const authGuard = new Elysia({ name: 'authGuard' })
  .derive({ as: 'scoped' }, async ({ jwt, headers }) => { ... })
```

**กฎจำง่ายๆ**: `errorHandler` (ต้องมีผลทั้งแอป) → `global` | `authGuard`/guard อื่นๆ ที่ผูกกับ route group เฉพาะ (ไม่ต้องการให้หลุดไปกระทบ route สาธารณะ เช่น health check, login) → `scoped`

**roleGuard ไม่ใช้ Elysia plugin เลย** — เพื่อเลี่ยงปัญหา scope ทั้งหมดนี้ตั้งแต่ต้น `requirePermission(menuKey, action)` ใน `plugins/roleGuard.ts` เป็นแค่ plain function ที่ return `beforeHandle` callback ใช้ผ่าน `.guard({ beforeHandle: requirePermission('users', 'canCreate') })` ในไฟล์ route โดยตรง ไม่ต้อง `.use()` เป็น plugin แยกเลยจึงไม่มี scope ให้ตั้งผิด

### 5. Env Validation ตอน Startup
```ts
const required = ['DATABASE_URL', 'JWT_SECRET', 'OPENROUTER_API_KEY', 'OPENAI_API_KEY']
// OPENROUTER_MODEL / EMBEDDING_MODEL มี default ในโค้ด — ไม่บังคับต้องตั้งเอง แต่แนะนำให้ตั้งชัดเจนใน .env
required.forEach(k => { if (!process.env[k]) throw new Error(`Missing env: ${k}`) })
```

### 6. Controller-Service-Repository Pattern
เหมือนระบบทั่วไป — RAG service (`services/rag/`) และ chat orchestration service (`services/chat/`) เป็นชั้น service แยกจาก route handler เพื่อ testable โดยไม่ต้อง mock HTTP layer **route handler ของ Elysia ทำหน้าที่แทน "controller"** (รับ context `{ body, params, set }` ที่ Elysia validate ให้แล้ว → เรียก service → return ค่า) ไม่ต้องแยกไฟล์ controller ต่างหากถ้า route นั้น thin พอ

### 7. Mock LLM calls ใน test เสมอ
ห้ามเรียก OpenRouter/OpenAI API จริงใน automated test (ค่าใช้จ่าย + non-determinism) — mock ที่ระดับ client module ด้วย Bun test's `mock.module(...)` (ไม่ใช่ `jest.mock`) แล้วทดสอบ route ตรงผ่าน `await app.handle(new Request('http://localhost/api/...', { method: 'POST', body: ... }))`

### 8. Soft Delete + isActive
ใช้กฎเดียวกับระบบทั่วไป: `deletedAt` สำหรับลบจริง, `isActive` สำหรับ toggle เปิด/ปิดการมองเห็น (เช่น เอกสารกฎหมายที่ถูกยกเลิกแล้วแต่ยังต้องอ้างอิงในบริบททางประวัติศาสตร์)

### 9. Feature-Based Frontend Architecture (Web)
```ts
// app/(chat)/c/[conversationId]/page.tsx — routing ONLY
import ChatWindow from '@/modules/chat/components/ChatWindow'
export default function Page({ params }) { return <ChatWindow conversationId={params.conversationId} /> }
```
**กฎข้าม:** `app/` ห้ามมี useState/useEffect/fetch | `modules/[feature]/services/` ห้าม import จาก module อื่น

### 10. Chat streaming ฝั่ง frontend — ใช้ hook เฉพาะ
`useChatStream` เป็น hook เดียวที่จัดการ `fetch` + `ReadableStream` — ห้าม component เรียก stream เองกระจายหลายที่ อัปเดต `chatStore` (Zustand) ทีละ delta เพื่อ re-render ทีละตัวอักษร

### 11. Role Permission (Dynamic RBAC)
ใช้ `PermissionGuard menuKey="..."` เหมือนระบบทั่วไป — เมนู `library` (admin CRUD), `chat` (ทุก role ที่ login แล้ว), `users`/`settings` (admin เท่านั้น)

### 12. Responsive Design
Chat UI ต้องใช้งานได้บนมือถือ (≥375px) — input bar sticky bottom, message bubble wrap ข้อความยาว, sidebar ประวัติบทสนทนาเปลี่ยนเป็น Drawer บน mobile

### 13. Error Message Handling
Service throw error ภาษาไทยที่ user เข้าใจได้ — รวมถึง error จาก LLM เช่น `finish_reason: "content_filter"` หรือ error จาก OpenRouter provider → แปลงเป็น `'ไม่สามารถตอบคำถามนี้ได้ กรุณาลองถามในรูปแบบอื่น'` แทนการโชว์ raw provider error ให้ user

---

## Task Management Rules (สำหรับ AI)

> 1. **เริ่ม task** → เปลี่ยน `[ ]` เป็น `[~]`
> 2. **เจอปัญหา** → เพิ่ม FIX ใต้ task นั้นทันที
> 3. **fix เสร็จ** → `[x]` + เพิ่ม `🧪 test:` และ `📝 commit:` ใต้ FIX item นั้น
> 4. **task เสร็จ** → `[x]` + เพิ่ม `🧪 test:` และ `📝 commit:` ใต้ task หลัก
> 5. **ห้ามลบ** FIX ที่เสร็จแล้ว — เก็บ `[x]` ไว้เป็น history

**สัญลักษณ์:**

| สัญลักษณ์ | ความหมาย |
|---|---|
| `[ ]` | ยังไม่เริ่ม |
| `[~]` | กำลังทำอยู่ |
| `[x]` | เสร็จแล้ว |
| `FIX #N:` | sub-task แก้ปัญหา |
| `🧪 test:` | วิธีทดสอบ + ผลที่ควรเห็น |
| `📝 commit:` | ชื่อ git commit ที่แนะนำ |

---

## Tasks

### Phase 1 — Project Setup

- [x] 1.0 สร้างไฟล์ `.gitignore` ที่ root
  - 🧪 test: `git status` → node_modules, .env, dist ไม่ติด tracked ✅
  - 📝 commit: `chore: add gitignore`

- [x] 1.1 สร้าง Monorepo structure + Bun workspaces
  - 🧪 test: `bun install` root → 528 packages installed, ไม่มี error ✅
  - 📝 commit: `chore: init monorepo workspace`

- [x] 1.2 Docker Compose (PostgreSQL + pgvector + API + Web)
  - หมายเหตุ: ใช้ image `pgvector/pgvector:pg16` แทน `postgres:16` ธรรมดา, API service ใช้ base image `oven/bun` แทน `node`
  - 🧪 test: `docker compose up -d postgres` → healthy, `CREATE EXTENSION vector;` สำเร็จ ✅
  - 📝 commit: `chore: add docker-compose with pgvector`

  - [x] FIX #1: port 4002/3002 (api/web) ชนกับโปรเจกต์อื่น (`knowledge-assistant-*`) ที่รันอยู่บนเครื่องเดียวกัน | before: เจอ `EADDRINUSE` ตอนสตาร์ท web dev server → after: ระบุ container ที่ชนด้วย `docker ps` + ถามผู้ใช้ก่อนแก้ (ผู้ใช้เลือกหยุด container เดิมเอง)
    - 🧪 test: `docker ps` → เห็น container คู่แข่งชัดเจนก่อนแก้ปัญหา
    - 📝 commit: `chore: remap ports to 4002/3002/5434 to avoid host conflicts`

- [x] 1.3 Prisma schema + migration + เปิด pgvector extension
  - 🧪 test: `bunx prisma migrate dev` → migration สำเร็จ, `\d "DocumentChunk"` ยืนยัน HNSW index บน embedding ✅
  - 📝 commit: `feat(db): add prisma schema and initial migration`

  - [x] FIX #2: `prisma migrate dev` ครั้งแรกเจอ drift เพราะรัน `CREATE EXTENSION vector` ผ่าน psql มือก่อนมี migration | before: drift error ต้อง reset → after: `prisma migrate reset --force` (ขอ consent ผู้ใช้ก่อนตาม safety guard ของ Prisma เอง) แล้วสร้าง migration ใหม่สะอาด
    - 🧪 test: `prisma migrate deploy` → "No pending migrations to apply" หลัง reset+migrate ✅
    - 📝 commit: `fix(db): reset dev db to resolve pre-migration extension drift`

- [x] 1.4 Elysia API พื้นฐาน + Health endpoint + env validation
  - 🧪 test: `curl http://127.0.0.1:4002/api/health` → `{"status":"ok","db":"connected","uptime":14}` ✅ (หมายเหตุ: `localhost` ผ่าน curl บน Windows Git Bash resolve เป็น IPv6 แล้วต่อไม่ติด — ใช้ `127.0.0.1` แทนตอน debug)
  - 📝 commit: `feat(api): setup elysia with prisma and health endpoint`

- [~] 1.5 Next.js + Tailwind + Ant Design + Zustand
  - 🧪 test: `bun run build` → pass (Next.js 15.5.22, pin จาก 16.2.12 ที่ create-next-app ติดตั้งมาให้ตาม decision ของผู้ใช้) ✅ | `bun run dev` → **ยังไม่ยืนยันสด** เพราะ port 3002 ชนกับโปรเจกต์อื่นที่ยังรันอยู่ (ดู FIX #1) รอผู้ใช้หยุด container เดิมก่อน verify รอบสุดท้าย
  - 📝 commit: `feat(web): setup nextjs tailwind antd zustand`

- [x] 1.6 Bun test + mock OpenRouter/OpenAI client
  - หมายเหตุ: ทดสอบ Elysia app ตรงผ่าน `app.handle(new Request(...))` — ไม่ต้องเปิด port จริงเหมือน Supertest
  - 🧪 test: `bun test` → 2 pass (health endpoint + openrouterClient mock pattern) ✅
  - 📝 commit: `chore(api): setup bun test with mocked llm clients`

- [x] 1.7 `.dockerignore` (api + web)
  - หมายเหตุ: ใช้ไฟล์เดียวที่ root แทนแยกต่อแอป เพราะ `docker-compose.yml` ใช้ `context: .` (repo root) สำหรับทั้งสอง service — .dockerignore ต่อแอปจะไม่ถูกใช้เว้นแต่ตั้งชื่อแบบ BuildKit-specific (`<Dockerfile>.dockerignore`) ซึ่งพึ่งพา BuildKit เกินไปสำหรับ setup พื้นฐาน
  - 🧪 test: ตรวจ pattern ครอบคลุม node_modules/.next/dist/tests/.env ของทั้งสอง workspace ✅
  - 📝 commit: `chore: add dockerignore`

- [x] 1.8 ESLint + Prettier + lint-staged + Husky
  - 🧪 test: `bun run lint` → exit 0 (clean) ✅ | ใส่ `any` ทดสอบ → `error  Unexpected any... @typescript-eslint/no-explicit-any`, exit 1 ✅ (ลบไฟล์ทดสอบออกหลังยืนยัน)
  - 📝 commit: `chore: add eslint prettier lint-staged`

- [x] 1.9 Env Validation + Global Error Handler
  - 🧪 test: ไม่มี `OPENROUTER_API_KEY` (ค่าว่าง `""`) → `error: Missing env: OPENROUTER_API_KEY` ตอน startup ✅
  - 📝 commit: `feat(api): env validation and global error handler`

  - [x] FIX #3: `errorHandler` เป็น Elysia plugin แยกไฟล์ (`plugins/errorHandler.ts`) แล้ว `.use()` เข้า app หลัก — `onError` เป็น **local scope by default** ทำให้ validation error ได้ 422 ดิบจาก Elysia เองแทนที่จะเป็น 400 ตาม format ที่กำหนด และ `HttpError` ที่ throw จาก route ไม่ถูกจับเลย (response ไม่ใช่ JSON) | before: `new Elysia().onError((...) => {...})` → after: `new Elysia().onError({ as: 'global' }, (...) => {...})` (อัปเดต Dev Standard #4 ด้วยแล้ว)
    - 🧪 test: `bun test` → validation error 400 ✅, valid body 200 ✅, `ConflictError` → 409 พร้อมข้อความไทย ✅
    - 📝 commit: `fix(api): scope global error handler plugin correctly`

- [x] 1.10 Elysia schema validation (`t.Object`) บนทุก route ที่รับ body/query
  - 🧪 test: POST body ขาด field required → 400 หลังแก้ FIX #3 (Elysia validation error format) ✅ | body ถูกต้อง → 200 พร้อม echo ✅
  - 📝 commit: `feat(api): add elysia schema validation`

- [x] 1.11 Seed script (roles + admin user + เอกสารกฎหมายตัวอย่าง 2-3 ฉบับ)
  - หมายเหตุ: `embedding` เป็น `Unsupported("vector(1536)")` — Prisma Client ไม่มี field นี้ใน create/update type ต้อง insert ผ่าน `$executeRaw` เท่านั้น (ใช้ placeholder vector ศูนย์ทั้งหมด ไม่ใช่ embedding จริง)
  - 🧪 test: `bun run src/seed.ts` → roles 3 + admin user + เอกสารตัวอย่าง 3 ฉบับ ✅ | รันซ้ำไม่ error (upsert + `ON CONFLICT`) ✅ | ตรวจผ่าน `psql` ยืนยันข้อมูลตรง ✅
  - 📝 commit: `chore(db): add seed script`

---

### Phase 2 — Authentication & User Management

- [x] 2.1 API: Login + JWT (`POST /api/auth/login`)
  - 🧪 test: `bun test` → credentials ถูก → 200 + JWT ✅ | password ผิด → 401 ✅ | email ไม่มีในระบบ → 401 ✅ | ขาด field → 400 ✅ | curl จริงผ่าน HTTP (ไม่ใช่แค่ `app.handle`) → ได้ JWT จริง ✅
  - 📝 commit: `feat(api): auth login with jwt`

- [x] 2.2 API: Elysia plugin ตรวจสอบ JWT + Role Guard (`plugins/authGuard.ts`, `plugins/roleGuard.ts`)
  - หมายเหตุ: `roleGuard.ts` ออกแบบเป็น plain function (`requirePermission`) ไม่ใช่ Elysia plugin ตั้งแต่แรก เพื่อเลี่ยงปัญหา scope (ดู FIX #4)
  - 🧪 test: ไม่มี token → 401 ✅ | token ผิด → 401 ✅ | token ถูก → 200 พร้อม user ✅ | ไม่มี permission row (default deny) → 403 ✅ | มี permission row → 200 ✅
  - 📝 commit: `feat(api): auth plugin and role guard`

  - [x] FIX #4: `authGuard.ts` ใช้ `{ as: 'global' }` เหมือน `errorHandler` ตอนแรก ผลคือ `.derive()` ไหลทะลุขึ้นไปถึง `app` หลักและบังคับทุก route (รวม `/api/health`, `/api/auth/login`) ให้ต้องมี Bearer token ไปด้วย ทั้งที่ควรมีผลแค่ route group ที่ `.use(authGuard)` โดยตรง | before: `.derive({ as: 'global' }, ...)` → after: `.derive({ as: 'scoped' }, ...)` (พิสูจน์ด้วย debug script แยกก่อนแก้ของจริง, อัปเดต Dev Standard #4 เพิ่มตาราง scope เทียบ global/scoped/local)
    - 🧪 test: `bun test` → `/api/health` กลับมา 200 ไม่ต้องใช้ token อีกครั้ง (ก่อนแก้ได้ 401 ผิดพลาด) ✅, `/api/auth/me` ยังทำงานถูกต้องด้วย `scoped` ✅
    - 📝 commit: `fix(api): use scoped instead of global for authGuard derive`

- [x] 2.3 API: CRUD user + Soft Delete
  - หมายเหตุ: seed permissions (admin full access ทุกเมนู, researcher/subscriber view-only chat+library) เพิ่มเข้า `packages/db/src/seed.ts` เพื่อให้ role guard มีข้อมูลจริงทดสอบ ไม่ใช่ default-deny ทั้งหมด
  - 🧪 test: `bun test` → admin list/create/update/delete ✅ | subscriber → 403 บน `/api/users` ✅ | duplicate email → 409 ✅ | DELETE → `deletedAt` ถูกตั้งค่าจริงใน DB + หายจาก list ทุก status ✅
  - 📝 commit: `feat(api): user management with soft delete`

- [x] 2.4 Web: หน้า Login
  - หมายเหตุ: ลบ `bcryptjs`/`@types/bcryptjs` ออกจาก `apps/api` แล้วใช้ `Bun.password` แทนตลอดทั้งระบบ (verify แล้วว่า hash ข้ามไลบรารีกันได้ — มาตรฐาน bcrypt เดียวกัน) เพิ่ม CORS (`@elysiajs/cors`, `env.WEB_ORIGIN`) ที่ตอนแรกเป็น dependency เฉยๆ ไม่เคย mount จริง
  - 🧪 test: `bun run build` (web) → pass ✅ | curl `/login` → render ฟอร์ม "เข้าสู่ระบบ LAW-AI" ✅ | curl POST `/api/auth/login` จริงผ่าน dev server → ได้ JWT ✅ | CORS preflight (`OPTIONS` + `Origin: http://localhost:3002`) → `Access-Control-Allow-Origin` ตรง ✅
  - 📝 commit: `feat(web): login page with jwt`

- [x] 2.5 Web: Protected routes
  - หมายเหตุ: ทดสอบได้แค่ฝั่ง server-render (curl) — behavior redirect จริงเกิดฝั่ง client JS หลัง hydrate ซึ่งต้องใช้ browser จริงถึงจะยืนยันได้ ไม่ใช่ claim ว่าทดสอบครบ
  - 🧪 test: curl `/` โดยไม่มี token → server ส่ง loading state (`ant-spin`) กลับมาเสมอ ไม่เคย leak เนื้อหาที่ต้อง login ✅ | client-side redirect ไป `/login` **ยังไม่ยืนยันด้วย browser จริง**
  - 📝 commit: `feat(web): protected routes with auth guard`

- [x] 2.6 DB + API: Role Permission system
  - 🧪 test: `bun test` → `GET /api/role-permissions` (admin) → 200 ✅ | `GET /api/role-permissions/:role` (auth ใดก็ได้) → 200 ✅ | role ไม่มีจริง → 404 ✅ | `PUT /api/role-permissions/:role/:menuKey` (admin) → update เฉพาะ field ที่ส่งมา ค่าอื่นไม่ถูกเขียนทับ ✅
  - 📝 commit: `feat(api): role permission management`

- [x] 2.7 Web: ใช้ Role Permission จาก server ใน UI (Sidebar/menu ตาม permission)
  - หมายเหตุ: ย้าย `app/page.tsx` เข้า `(dashboard)` route group เพื่อให้หน้าแรกได้ Sidebar+AuthGuard จาก `(dashboard)/layout.tsx` อัตโนมัติ, ใช้ `Bun.password`/CORS ตามข้อ 2.4 — หน้า `/users` `/library` `/settings` เป็น placeholder รอ CRUD UI จริงใน Phase ถัดไป, ไม่ใช้ antd `Result`/`Card`/`Image` เพราะ type conflict กับ React 19 (ตามที่ template เดิมเตือนไว้)
  - 🧪 test: `bun run build` → 5 route ผ่าน (`/`, `/login`, `/library`, `/users`, `/settings`) ✅ | curl ทุก route → 200 ✅ | **การกรองเมนูตาม permission จริง (เช่น subscriber ไม่เห็นเมนู users) ยังไม่ยืนยันด้วย browser จริง** เพราะพึ่งพา Zustand+localStorage ฝั่ง client curl มองไม่เห็น
  - 📝 commit: `feat(web): dynamic menu from role permissions`

---

### Phase 3 — RAG Pipeline & Ingestion

- [ ] 3.1 ตั้งค่า OpenAI Embeddings client + ทดสอบ embed ข้อความตัวอย่าง
  - 🧪 test: embed ข้อความ 1 ประโยค → ได้ vector 1536 มิติ (text-embedding-3-small)
  - 📝 commit: `feat(api): openai embeddings client`

- [ ] 3.2 Ingestion script: ดาวน์โหลด + parse `open-law-data-thailand/ocs-krisdika` (HuggingFace) + hash dedupe
  - หมายเหตุ: map field ตามตารางใน § AI/RAG Architecture ข้อ 6 — `sections[]` แบ่งมาตรามาให้แล้ว ไม่ต้องเขียน logic แยกมาตราเอง
  - 🧪 test: ingest เดือนตัวอย่าง 1 ไฟล์ → ได้ `LegalDocument`+`DocumentChunk` ตรงจำนวนมาตรา, รันซ้ำไม่สร้าง chunk ซ้ำ (`contentHash`), `isActive` ตรงกับ `is_latest`
  - 📝 commit: `feat(ingestion): ingest ocs-krisdika dataset`

- [ ] 3.3 Ingestion script: ดาวน์โหลด + chunk `open-law-data-thailand/soc-ratchakitcha` (เฉพาะช่วง/หมวดที่กำหนด — ห้ามดึงทั้ง 192GB)
  - หมายเหตุ: เนื้อหาเป็น OCR text ดิบ ต้องเขียน logic แยกหน่วยเอง (ต่างจาก ocs-krisdika ที่ chunk มาให้แล้ว)
  - 🧪 test: ingest metadata + OCR text ของช่วงที่กำหนด → ได้ `LegalDocument`+`DocumentChunk` ตาม field mapping
  - 📝 commit: `feat(ingestion): ingest soc-ratchakitcha dataset (scoped range)`

- [ ] 3.4 pgvector similarity search service (top-K + metadata filter)
  - 🧪 test: query ตัวอย่าง → คืน chunk ที่เกี่ยวข้องเรียงตาม similarity
  - 📝 commit: `feat(api): pgvector similarity search`

- [ ] 3.5 API: `POST /api/admin/documents/ingest` (trigger ingestion)
  - 🧪 test: admin เรียก → เอกสารใหม่ปรากฏใน DB พร้อม chunk+embedding
  - 📝 commit: `feat(api): document ingestion endpoint`

- [ ] 3.6 Web: แสดง attribution "ข้อมูลจาก Open Law Data Thailand (CC-BY-4.0)" ที่ footer
  - 🧪 test: ทุกหน้ามี attribution แสดงตาม license requirement
  - 📝 commit: `feat(web): add data source attribution footer`

- [ ] 3.7 Auto test: ครอบคลุม ingestion dedupe + retrieval ranking
  - 🧪 test: `bun test` → ผ่านทั้งหมด
  - 📝 commit: `test(api): rag pipeline tests`

---

### Phase 4 — AI Chat with Citations

- [ ] 4.1 API: `POST /api/conversations` + `GET /api/conversations`
  - 🧪 test: สร้าง/list บทสนทนาได้ตาม user ที่ login
  - 📝 commit: `feat(api): conversations crud`

- [ ] 4.2 API: chat orchestration service — retrieve → build prompt (system + numbered chunks) → call OpenRouter → parse+validate citations
  - หมายเหตุ: system prompt บังคับให้อ้างอิงเลข `[n]` ทุกครั้ง, backend validate ทุกเลขกับ chunk ที่ retrieve จริง (ดู § AI/RAG Architecture ข้อ 3)
  - 🧪 test: ถามคำถามตัวอย่าง → ได้คำตอบพร้อม citation ที่ validate แล้วตรงกับ chunk ที่ retrieve มา, เลขปลอม/เกินขอบเขตถูกตัดทิ้ง
  - 📝 commit: `feat(api): rag chat orchestration with validated citations`

- [ ] 4.3 API: SSE streaming endpoint `POST /api/conversations/:id/messages`
  - 🧪 test: เปิด connection → ได้ text delta ทยอยมาจาก OpenRouter (`stream: true`), ปิด stream เมื่อจบ, citations แนบท้ายหลัง validate
  - 📝 commit: `feat(api): sse streaming chat endpoint`

- [ ] 4.4 API: อ่าน `OPENROUTER_MODEL` จาก env + รองรับ override ต่อ conversation (`Conversation.modelTier` เก็บ model id ตรงๆ)
  - 🧪 test: ไม่ส่ง modelTier → ใช้ `OPENROUTER_MODEL` default | ส่ง model id อื่นที่ config ไว้ → เรียกโมเดลนั้นจริง (ตรวจจาก mock call args)
  - 📝 commit: `feat(api): configurable openrouter model selection`

- [ ] 4.5 Web: `useChatStream` hook (fetch + ReadableStream)
  - 🧪 test: ส่งคำถาม → เห็นข้อความ stream ทีละตัวอักษรใน UI
  - 📝 commit: `feat(web): chat streaming hook`

- [ ] 4.6 Web: ChatWindow + MessageBubble + CitationCard
  - 🧪 test: คำตอบแสดง citation เป็นการ์ดคลิกไปดูต้นฉบับได้
  - 📝 commit: `feat(web): chat ui with citation cards`

- [ ] 4.7 Web: เลือก model tier ต่อบทสนทนา (ModelTierSelect)
  - 🧪 test: เปลี่ยน tier → คำถามถัดไปใช้ model ที่เลือก
  - 📝 commit: `feat(web): model tier selector`

- [ ] 4.8 Auto test: ครอบคลุม chat flow (retrieve, streaming, citation validation)
  - 🧪 test: `bun test` → ผ่านทั้งหมด
  - 📝 commit: `test(api): chat flow tests`

---

### Phase 5 — Law Library (Browse & Admin)

- [ ] 5.1 API: `GET /api/documents` (ค้นหา keyword + filter type) + `GET /api/documents/:id`
  - 🧪 test: ค้นหาได้ตามชื่อ/citationCode, filter ตาม type
  - 📝 commit: `feat(api): law library browse endpoints`

- [ ] 5.2 Web: หน้ารายการเอกสารกฎหมาย (ค้นหา, filter, pagination)
  - 🧪 test: แสดงรายการ, ค้นหาได้
  - 📝 commit: `feat(web): law library list page`

- [ ] 5.3 Web: หน้า admin ingest เอกสารใหม่ (upload/URL + trigger ingestion)
  - 🧪 test: admin เพิ่มเอกสาร → ปรากฏใน library หลัง ingestion เสร็จ
  - 📝 commit: `feat(web): admin document ingestion page`

---

### Phase Last — Dashboard & Polish

- [ ] L.1 Dashboard ผู้ดูแลระบบ (จำนวนบทสนทนา, cost/usage ต่อ model tier, เอกสารล่าสุด)
  - 🧪 test: เปิด dashboard → เห็นข้อมูลสรุปถูกต้อง
  - 📝 commit: `feat(web): admin dashboard`

- [ ] L.2 Responsive design — chat + library ทุกหน้า
  - 🧪 test: Chrome DevTools iPhone SE (375px) → ใช้งานได้ทุกหน้า
  - 📝 commit: `feat(web): responsive layout`

- [ ] L.3 รวม test suite ทั้งหมด
  - 🧪 test: `bun test` root → ผ่านทุก test ใน monorepo
  - 📝 commit: `chore: unified test suite`

---

<!--
## วิธีใช้ไฟล์นี้

1. เริ่ม Phase 1 ตามลำดับ — Phase 1-2 (Setup + Auth) เป็น boilerplate มาตรฐาน ปรับน้อย
2. Phase 3-4 คือแกนหลักของระบบ (RAG + Chat) — อ่าน § AI / RAG Architecture ให้เข้าใจก่อนเริ่ม โดยเฉพาะกฎ citation grounding และ prompt caching placement
3. ก่อนเขียนโค้ดเรียก OpenRouter ทุกครั้ง เช็ค model id (`OPENROUTER_MODEL`) และ feature ที่ provider นั้นรองรับจริงบน [openrouter.ai/docs](https://openrouter.ai/docs) — อย่าสมมติว่าทุกโมเดลรองรับ reasoning/structured output/caching เหมือนกันหมด
4. Embeddings ใช้ OpenAI Embeddings API เสมอ (`EMBEDDING_MODEL`) — เรียกตรง ไม่ผ่าน OpenRouter เพราะ OpenRouter ไม่มี embeddings endpoint

## Key Decisions (บันทึกเหตุผลไว้กันลืม)

- **OpenRouter แทน Anthropic API โดยตรง**: เลือกเพื่อความยืดหยุ่นในการสลับโมเดล (`OPENROUTER_MODEL`) โดยไม่ผูกกับ provider เดียว — แลกกับการไม่มี native feature บางอย่างที่ Anthropic API มี (citations, prompt caching แบบ `cache_control`, adaptive thinking) ต้องออกแบบ workaround เอง (ดู § AI/RAG Architecture)
- **Embeddings ผ่าน OpenAI ตรง ไม่ผ่าน OpenRouter**: OpenRouter ไม่มี embeddings endpoint — ต้องมี `OPENAI_API_KEY` แยกจาก `OPENROUTER_API_KEY`
- **Bun + Elysia แทน Node.js + Express**: performance ที่ดีกว่า + built-in TypeScript/test runner ในตัว (ไม่ต้อง ts-node/Jest แยก) — แลกกับ ecosystem ที่เล็กกว่า Express (เช่น Supertest ใช้ไม่ได้ตรงๆ, ต้อง mock/import Elysia plugin ให้ตรง pattern ของ framework แทนการหา Express middleware สำเร็จรูปมาต่อ)
- **pgvector แทน vector DB แยก (Pinecone/Weaviate)**: ลด moving parts, ข้อมูล metadata กับ embedding อยู่ table เดียวกัน join ง่าย, scale พอสำหรับขนาดข้อมูลกฎหมายไทย (หลักหมื่น-แสน chunk)
- **Citation ต้อง validate เองฝั่ง backend**: โมเดลบน OpenRouter ไม่มี native citation feature เหมือน Anthropic — ทุกเลขอ้างอิง `[n]` ที่โมเดลตอบมาต้องเทียบกับ chunk ที่ retrieve จริงก่อนเชื่อ ป้องกันเลขมาตราหลอน/อ้างอิงที่ไม่มีอยู่จริง
- **`modelTier` เก็บ model id ตรงๆ ไม่ใช่ enum lite/standard/pro**: เพราะตอนนี้มีโมเดลเดียว (`OPENROUTER_MODEL`) การเก็บเป็น string ดิบทำให้เพิ่ม/สลับโมเดลในอนาคตไม่ต้อง migrate schema
- **Chat ไม่ใช้ Ant Design Table pattern**: หน้า chat เป็น custom component เพราะ UX ต่างจาก CRUD form/table โดยสิ้นเชิง — Ant Design ยังใช้แค่ฝั่ง admin/library
- **Data source = Open Law Data Thailand (`ocs-krisdika` + `soc-ratchakitcha`) เท่านั้นใน Phase 1**: สำรวจแล้วพบว่านี่เป็นแหล่งเดียวที่มี bulk dataset สาธารณะของตัวบทกฎหมายไทยที่มาจากหน่วยงานทางการ (Krisdika) และ chunk ตามมาตรามาให้แล้ว — เทียบกับ `PyThaiNLP/thai-law` (แหล่งเดียวกันแต่โครงสร้างหยาบกว่า, ตัดออก) และเว็บ `searchlaw.ocs.go.th`/`deka.supremecourt.or.th` (เป็น UI ค้นหา ไม่ใช่ API/bulk, สอง dataset ข้างต้นน่าจะ scrape มาจากตรงนี้อยู่แล้ว) — **คำพิพากษาศาลฎีกาไม่มี bulk dataset สาธารณะที่ใหญ่พอ** (มีแค่ `tscc-dataset` 1,000 คดี ใช้เป็น eval set ได้แต่ไม่ใช่ corpus หลัก) จึงย้าย case-law ingestion ไป Phase ถัดไปเป็น workstream แยก (ต้อง scrape เอง + เช็ค ToS ก่อน)
- **`roleGuard` เป็น plain function ไม่ใช่ Elysia plugin**: หลังเจอปัญหา scope ของ `.onError()`/`.derive()` (`global` vs `scoped`) สองรอบกับ `errorHandler`/`authGuard` แล้ว — `requirePermission(menuKey, action)` ออกแบบเป็น factory function ธรรมดาที่ return `beforeHandle` callback ใช้ผ่าน `.guard({ beforeHandle: ... })` ตรงในไฟล์ route แทน เพื่อไม่ต้องมี scope ให้ตั้งผิดอีก
- **Password hashing ใช้ `Bun.password` แทน `bcryptjs`**: ทดสอบแล้วว่า hash/verify คนละไลบรารีเข้ากันได้ (มาตรฐาน bcrypt หนึ่งเดียว) — เลือก `Bun.password` เพราะ built-in ใน runtime ไม่ต้องเพิ่ม dependency, ตัดทั้ง `bcryptjs`/`@types/bcryptjs` ออกจาก `apps/api/package.json`
- **CORS ต้องเปิดเอง**: `@elysiajs/cors` เป็น dependency ตั้งแต่ Phase 1 แต่ไม่ได้ mount จริงจนกระทั่ง Phase 2.4 ตอนเทส login จาก browser จริง — เพิ่ม `env.WEB_ORIGIN` (default `http://localhost:3002`) แล้ว `.use(cors({ origin: env.WEB_ORIGIN, credentials: true }))` ใน `app.ts`
- **Windows: `next build` EPERM บน `.next/trace` ถ้ามี `bun run dev` ค้างอยู่**: ไม่ใช่แค่ VS Code TS server lock อย่างที่ template เดิมเข้าใจ — เจอจริงว่า `next dev`/`next build` สปอว์น child process เป็น `node.exe` แยกจาก `bun.exe` เอง ฆ่าแค่ `bun.exe` ไม่พอ ต้องเช็ค `Get-Process node` ด้วยแล้ว kill ให้หมดก่อน ถ้ายัง lock อยู่ให้ลบ `.next/` ทิ้งแล้ว build ใหม่
-->
