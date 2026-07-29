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

### Phase 3 — General-Purpose Chat (NotebookLM-style UI)

> หมายเหตุ: Phase นี้เป็นการตัดสินใจใหม่ของผู้ใช้ — เริ่ม demo ใหม่จาก `main` เดิม (ไม่เอา RAG/citation grounding ที่เคยทำไว้บน branch `chore/trim-schema-phase-1-2` ซึ่งยังอยู่ครบบน branch นั้น ไม่ได้ merge เข้ามา) เป้าหมาย Phase นี้คือ chat ทั่วไป (ไม่บังคับ grounding/citation) แบบ NotebookLM แต่เริ่มจากแค่ช่องแชท + เก็บประวัติการสนทนาก่อน ใช้ตาราง `Conversation`/`Message` ที่มีอยู่แล้วใน schema โดยไม่ต้อง migrate

- [x] 3.1 API: Conversation CRUD
  - `repositories/conversationRepository.ts` — query ที่ scope ด้วย `userId`: `findManyByUser`, `findByIdForUser` (เช็ค ownership, คืน null ถ้าไม่ใช่เจ้าของ), `create`, `softDelete`, `appendMessage`, `setTitleIfEmpty`, `touchUpdatedAt` (Message เป็นคนละ table กับ Conversation — updatedAt ไม่ auto-bump ต้อง touch เองให้ list เรียงตามคุยล่าสุดถูก)
  - `services/chat/conversationService.ts` — `list`/`create` (ตั้ง `modelTier: env.OPENROUTER_MODEL` เอง ไม่พึ่ง default ของ Prisma column ตาม Dev Standard #1)/`getWithMessages` (throw `NotFoundError` ถ้าไม่ใช่เจ้าของ)/`remove` (soft delete)
  - `controllers/conversationController.ts` + `routes/conversations.ts` (`prefix: "/api/conversations"`, `.use(authGuard)` เท่านั้น — **ไม่ใส่ `requirePermission`** เพราะ chat เปิดให้ทุก role ที่ login แล้วตาม Dev Standard #11 และ permission row ของ `chat` ที่ seed ไว้มีแค่ `canView`)
  - wire เข้า `apps/api/src/app.ts`

  - [x] FIX #5: Postgres volume ยังมี schema/ข้อมูลของ branch `chore/trim-schema-phase-1-2` ค้างอยู่ทั้งหมด (`Document`/`Passage`/`Workspace`/`ResearchSession`/role 5 แบบ `org_admin` ฯลฯ) ไม่มี table ของ `main` เลย (`Conversation`/`Message`/`LegalDocument`/`DocumentChunk`) เพราะ container Postgres รันข้ามการสลับ branch มาตลอดไม่เคย reset — `prisma migrate status` รายงาน "up to date" หลอกๆ เพราะเช็คแค่ชื่อ migration ใน `_prisma_migrations` ไม่ได้ diff โครงสร้างจริง ทำให้ test แรกที่ query role "subscriber" fail (ไม่มีอยู่จริงในข้อมูลที่ค้าง) | before: seed 5-role เดิมค้างอยู่ → after: ขอ consent ผู้ใช้ก่อน (`AskUserQuestion`) แล้ว `prisma migrate reset --force` (local dev DB เท่านั้น, ผ่าน Prisma's built-in AI-agent consent guard ด้วย `PRISMA_USER_CONSENT_FOR_DANGEROUS_AI_ACTION`)
    - 🧪 test: `\dt` หลัง reset → เหลือแค่ 8 table ตรงกับ `main`'s schema.prisma ✅ | `bun test` (api ทั้งหมด) → 32 pass 0 fail ✅
    - 📝 commit: `fix(db): reset dev postgres volume to match main schema after branch switch`

  - 🧪 test: `bun test tests/conversations.test.ts` → 8 pass (401 ไม่มี token, create ใช้ `OPENROUTER_MODEL` จาก env, list เห็นแค่ของตัวเอง, get/delete คนอื่น → 404 ไม่ leak, soft delete ตั้ง `deletedAt` จริง) ✅
  - 📝 commit: `feat(api): conversation crud scoped by owner`

- [x] 3.2 API: Streaming chat completion (SSE, general-purpose — ไม่มี RAG)
  - `services/chat/chatCompletionService.ts`: persist user message ที่ส่งเข้ามาก่อน → ประกอบ `messages` array (system prompt แบบ general assistant คงที่ — ตั้งใจ**ไม่ใช้**ระบบ prompt แบบ RAG-grounded จาก § AI/RAG Architecture ข้อ 3 รอบนี้ ไม่บังคับ citation) + ประวัติเดิม → เรียก `openrouter.chat.completions.create({ model: conversation.modelTier, messages, stream: true })` → คืน raw `Response`/`ReadableStream` forward `choices[0].delta.content` เป็น SSE (ตาม pattern § AI/RAG Architecture ข้อ 4 — ยืนยันแล้วว่า Elysia ส่ง raw `Response` ผ่านได้จริงจาก curl -N สด) → เมื่อ stream จบ persist assistant `Message` (`modelUsed` = model id จริงจาก response), ตั้ง `title` จาก user message ถ้ายังว่าง
  - handle finish_reason ที่ไม่ใช่ `"stop"` ตาม Dev Standard #13 (แปลเป็นข้อความไทย ไม่โชว์ raw provider error)
  - route `POST /api/conversations/:id/messages`, `body: t.Object({ content: t.String({ minLength: 1 }) })`
  - mock `openrouterClient` ใน `tests/chatCompletion.test.ts` ด้วย dynamic `await import("../src/app")` ใน `beforeAll` แทน static top-level import — เพราะ static import จะ hoist ขึ้นก่อน `mock.module()` ทำให้โหลด client ตัวจริงไปแล้วก่อน mock มีผล (ตาม pattern ที่ `tests/clients/openrouterClient.test.ts` วางไว้ตั้งแต่ Phase 1) — ห้ามเรียก API จริงใน `bun test`

  - [x] FIX #6: ตั้งใจตั้ง `title` เฉพาะตอน `isFirstMessage` (คำนวณจาก `conversation.messages.length === 0` ก่อน persist) — ถ้ารอบแรกสุด persist user message สำเร็จแต่ assistant reply ไม่เสร็จ (error/timeout) รอบถัดไปจะไม่ถูกนับเป็น "first" อีกต่อไป (เพราะมี user message ค้างจากรอบก่อนอยู่แล้ว) ทำให้ title ไม่ถูกตั้งค่าตลอดไป แม้บทสนทนาจะตอบสำเร็จจริงในรอบหลังๆ ก็ตาม | เจอจริงจากการยิง curl สดตรง — รอบแรกไม่มี assistant message ถูก persist (เหตุผล: ข้อความ Thai ที่พิมพ์ผ่าน bash argument บน Windows เพี้ยน encoding ทำให้ debug ช้าไปพักหนึ่ง) รอบสองตอบสำเร็จแต่ title ยังว่าง | before: `if (isFirstMessage) await setTitleIfEmpty(...)` → after: เรียก `setTitleIfEmpty` ทุกครั้งหลัง assistant ตอบสำเร็จแบบไม่มีเงื่อนไข (ฟังก์ชันเช็ค `title: null` เองอยู่แล้วจึง idempotent)
    - 🧪 test: `bun test` (36 pass) ✅ | live curl ผ่าน `docker compose` จริง — สร้างบทสนทนาใหม่ ถามคำถาม ได้ title ตรงกับคำถามจริง ✅
    - 📝 commit: `fix(api): always attempt conversation title on successful reply, not just first message`

  - 🧪 test: `bun test tests/chatCompletion.test.ts` → 4 pass (401 ไม่มี token, ส่งข้อความ → SSE delta ต่อกันได้ข้อความเต็มถูกต้อง + persist ทั้ง user/assistant message + ตั้ง title, finish_reason ไม่ใช่ stop → error event ภาษาไทย + assistant message ไม่ถูก persist, คนอื่นส่งเข้าบทสนทนาที่ไม่ใช่ของตัวเอง → 404) ✅ | full suite 36 pass ไม่มี mock leak ข้าม test file ✅
  - 📝 commit: `feat(api): streaming chat completion with sse`

- [x] 3.3 Web: chat state + API client module
  - `store/chatStore.ts` (Zustand, ไม่ persist — DB เป็น source of truth เพื่อเลี่ยงบั๊ก stale-localStorage-JWT แบบที่เคยเจอ): `conversations[]`, `activeConversationId`, `messages[]`, `streamingBuffer`
  - `modules/chat/types.ts`, `modules/chat/services/chatApi.ts` (list/create/get/delete ผ่าน `api` axios instance เดิม)
  - `modules/chat/hooks/useChatStream.ts` — ถือ `fetch` + ใส่ `Authorization` header เอง + `ReadableStream` reader สำหรับ `POST /:id/messages` ตาม Dev Standard #10 (hook เดียว ไม่ให้ component เรียก stream เอง) — error event จาก backend (finish_reason ไม่ใช่ stop) จะ reset streaming buffer แทนการ commit เข้า message list เพื่อให้ตรงกับฝั่ง backend ที่ไม่ persist ข้อความ assistant ที่ไม่สมบูรณ์
  - 🧪 test: type-check ผ่านใน `bun run build` (web) ✅ — ไม่มี test แยกเฉพาะ layer นี้ เพราะไม่มี logic ที่ซับซ้อนพอจะแยกเทส (เทสร่วมกับ 3.4 ด้านล่าง)
  - 📝 commit: `feat(web): chat store and api client module`

- [x] 3.4 Web: ChatWindow two-pane UI
  - `modules/chat/components/ChatWindow.tsx` — ซ้าย: รายการบทสนทนา + ปุ่ม "+ บทสนทนาใหม่" (เปลี่ยนเป็น Drawer บน mobile ตาม Dev Standard #12 ผ่าน `md:hidden`/`hidden md:flex`), ขวา: thread ที่เลือกอยู่ — ใช้ route เดิม (`/`, `ROUTES.chat`) สลับบทสนทนาด้วย client-side state รอบนี้ยังไม่เพิ่ม route ใหม่
  - `ConversationList.tsx`, `MessageThread.tsx` + `MessageBubble.tsx`, `ChatInput.tsx` (input sticky bottom, ส่งข้อความตอนยังไม่มี `activeConversationId` จะสร้าง conversation ก่อนแล้วค่อยส่ง — path เดียวกับข้อความถัดๆ ไป)
  - แทนที่การใช้ `HomeContent` ใน `app/(dashboard)/page.tsx` แล้วลบ `HomeContent.tsx` ทิ้ง
  - ไม่เพิ่ม `@ant-design/icons` เป็น dependency ใหม่ — ใช้ข้อความ/emoji แทนไอคอนในปุ่ม (เช่น "+ บทสนทนาใหม่", "☰ บทสนทนา") เพื่อไม่ขยาย scope เกินที่ plan กำหนด

  - [x] FIX #7: local `bun run build` (web) พัง EPERM ตอน copy traced files เข้า `.next/standalone` เพราะสร้าง symlink บน Windows ต้องมีสิทธิ์ admin/เปิด Developer Mode — เพิ่งเกิดหลัง Docker fix ก่อนหน้าเพิ่ม `output: "standalone"` เข้า `next.config.ts` (คนละสาเหตุกับ FIX เดิมเรื่อง `.next/trace` lock จาก `bun run dev` ค้าง) | ยืนยันแล้วว่า type-check + page generation ผ่านหมดก่อนเจอ error (ไม่ใช่บั๊กโค้ด) และ Docker build (Linux container) ไม่เจอปัญหานี้เลยเพราะไม่ต้องสร้าง symlink ข้าม filesystem แบบ Windows | ไม่แก้ตรงนี้เพราะไม่กระทบ deployment path จริง (Docker) — ผู้ใช้ที่ build บน Windows local ต้องเปิด Developer Mode หรือรัน terminal แบบ admin ถ้าต้องการให้ `bun run build` ผ่านสมบูรณ์นอก Docker
    - 🧪 test: `docker compose up -d --build web` → build สำเร็จ, container healthy, `curl http://127.0.0.1:3002/` → 200 พร้อม `<title>LAW-AI — ผู้ช่วยกฎหมายไทย AI</title>` ✅
    - 📝 commit: `docs: note windows standalone-build symlink limitation`

  - 🧪 test: `docker compose up -d --build` (api+web) → ทั้งสอง container healthy ✅ | curl `/api/health` → connected ✅ | curl `/` (web) → 200 ✅ | **ยังไม่ยืนยันด้วย browser จริง** (ไม่มี browser tool ใน environment นี้) — การคลิก/พิมพ์/เห็น token streaming สดในหน้าจอจริงยังไม่ได้ทดสอบ มีแค่ API layer ที่ยืนยันสดผ่าน curl -N แล้วว่า stream ทำงานถูกต้อง (ดู 3.2)
  - 📝 commit: `feat(web): notebooklm-style chat window with conversation history`

  - [x] FIX #8: ผู้ใช้ส่งภาพหน้าจอ NotebookLM จริง (โทนมืด) ขอให้ปรับสีให้ตรง — restyle เฉพาะ chat panel (`ChatWindow` และลูก) ไม่แตะ Sidebar/dashboard chrome ที่เหลือซึ่งยังเป็น antd light theme เดิม เพราะภาพที่ให้มาคือแค่ส่วน chat ไม่ใช่ทั้งแอป | เปลี่ยน `MessageBubble` เป็น pill สีเทาเข้ม (`#333537`) สำหรับ user, plain text ไม่มีกรอบสำหรับ assistant | เปลี่ยน `ChatInput` จาก antd `Input.TextArea`/`Button` เป็น plain `<textarea>`/`<button>` เพราะต้องคุมสีพื้น/ขอบเองทั้งหมดให้ตรงภาพ (pill โค้งมน border ขาวจางๆ บนพื้นเข้ม ปุ่มส่งวงกลม) — antd theme default คุมสีเหล่านี้ยาก | `ChatWindow` ครอบด้วย `bg-[#131314] rounded-2xl` ทำให้เป็น "การ์ดมืด" ลอยอยู่ใน dashboard content area ที่ยังสว่างอยู่ | Drawer (mobile) ใช้ antd `styles` prop (v5.4+) override header/body/mask background แทนการเขียน CSS class ทับ
    - 🧪 test: `docker compose up -d --build web` → build ผ่าน, container ready ✅ | `docker compose logs web` → ไม่มี runtime error ✅ | ข้อมูลใน postgres volume ยังอยู่ครบหลัง rebuild (`Role` 3 แถวเดิม) ✅ | **สีจริงบนหน้าจอยังไม่ยืนยันด้วย browser จริง** เช่นเดิม
    - 📝 commit: `style(web): notebooklm dark theme for chat panel`

  - [x] FIX #9: ผู้ใช้ส่งภาพจริงจาก browser มา — Sidebar (`shared/layouts/Sidebar.tsx`) ยังเป็นสองโทนปนกัน (บนขาว ล่างน้ำเงินเข้ม) เพราะ antd `Menu` default `theme="light"` (พื้นขาว) แต่ `Layout.Sider` ที่ห่ออยู่มี default background เป็นน้ำเงินเข้ม (`#001529`) ของ antd เอง — ไม่ใช่สีเดียวกับ chat panel (`#131314`) เลย | before: ไม่ได้ตั้ง `theme`/`style` ทั้งคู่ → after: `<Menu theme="dark" style={{background:"#131314"}}>` + `<Sider style={{background:"#131314"}}>` ให้ตรงกับโทน chat panel เป๊ะ
    - 🧪 test: `docker compose up -d --build web` → build ผ่าน, container healthy ✅
    - 📝 commit: `style(web): match sidebar background to chat panel dark tone`

  - [x] FIX #10: หลังแก้ FIX #9 ยังเห็น "ขอบขาว" ล้อมรอบ chat panel อยู่ — สาเหตุจริงคือ `DashboardLayout`'s `<Content className="p-6">` ทำให้ `ChatWindow` (การ์ดมืดมี `rounded-2xl`) ถูก inset เข้าไป 24px ทุกด้าน เห็นพื้น Content (สีอ่อน) โผล่เป็นกรอบรอบการ์ด | ไม่แก้ที่ `Content` ตรงๆ เพราะหน้าอื่น (`/library` `/users` `/settings`) ยังต้องการ padding ปกติแบบ light theme เดิม อยู่ — แก้เฉพาะจุดที่ `ChatWindow` แทน: ใช้ `-m-6` (ยกเลิก `p-6` ของ parent เฉพาะหน้านี้) + เปลี่ยน `h-[calc(100vh-3rem)]` เป็น `h-screen` (เพราะไม่ได้พึ่ง padding ลด height อีกแล้ว) และตัด `rounded-2xl` ออกให้ชนขอบเต็มพื้นที่แบบ NotebookLM จริง แทนที่จะลอยเป็นการ์ด
    - 🧪 test: `docker compose up -d --build web` → build ผ่าน, container healthy ✅
    - 📝 commit: `style(web): make chat panel bleed full-bleed instead of inset card`

  - [x] FIX #11: ผู้ใช้ส่งภาพตัวอย่างคำตอบที่จัด format สวย (heading, bullet, bold, code block มีปุ่ม copy) ขอปรับให้ตรงแนวนี้ — ก่อนหน้านี้ `MessageBubble` render `message.content` เป็น plain text ดิบทั้งหมด (`whitespace-pre-wrap`) ทำให้ markdown ที่โมเดลตอบมา (`#`, `**`, `-`, ` ``` `) โชว์เป็นสัญลักษณ์ดิบไม่ถูก render | เพิ่ม `react-markdown` + `remark-gfm` (dependency ใหม่ ยืนยันแล้วว่าไม่มี syntax highlighter ติดมาด้วย — ตั้งใจไม่เพิ่ม rehype-highlight เพื่อลด dependency footprint เพราะภาพตัวอย่างไม่มีสี syntax) สร้าง `modules/chat/components/MarkdownMessage.tsx` พร้อม custom `components` override ให้ตรงโทน dark theme เดิม (heading ตัวหนา, list เว้นระยะ, code block เป็นการ์ดมืดมีปุ่ม "คัดลอก" ผ่าน `navigator.clipboard`) — ใช้เฉพาะข้อความฝั่ง assistant เท่านั้น (ข้อความ user ยังเป็น plain text pill เหมือนเดิม เพราะเป็นแค่คำถามสั้นๆ)
    - หมายเหตุทางเทคนิค: react-markdown v9+ เลิกส่ง prop `inline` ให้ `code` override แล้ว (breaking change จาก v8) — ใช้ heuristic แทน (มี `\n` หรือ `className` มี `language-` → ถือเป็น code block) แล้วให้ `pre` override เป็นแค่ passthrough (`<>{children}</>`) ไม่ห่อซ้ำ เพราะ `CodeBlock` component จัดการ wrapper การ์ดเองแล้ว
    - 🧪 test: `docker compose up -d --build web` → build ผ่าน (type-check ผ่านทั้งไฟล์ใหม่) ✅ | live curl ผ่าน `docker compose` จริง ถามคำถามให้ตอบด้วย heading/bold/bullet/code block → persisted content มี markdown syntax ครบ (`#`, `**...**`, `- ...`, ` ```python `) ยืนยันว่าข้อมูลดิบพร้อมให้ frontend render ✅ | **การ render จริงบนหน้าจอ (สี/spacing/ปุ่ม copy ทำงาน) ยังไม่ยืนยันด้วย browser จริง**
    - 📝 commit: `feat(web): render assistant messages as markdown with styled code blocks`

---

### Phase 4 — คลังกฎหมาย: Browse ตามหมวดหมู่ + TOC รายมาตรา

> หมายเหตุ: Phase นี้คือ **port โค้ดที่ verify กับข้อมูลจริงแล้วจาก branch `chore/trim-schema-phase-1-2`** ไม่ใช่ออกแบบใหม่ตั้งแต่ต้น — branch นั้นเคย ingest จริงและตรวจสอบ raw dataset ของ `ocs-krisdika` ละเอียดจนรู้ gotcha สำคัญหลายจุดแล้ว (ดูรายละเอียดในแต่ละ task ด้านล่าง) งานนี้คือ trim เอาเฉพาะส่วนที่จำเป็นสำหรับ "TOC + หมวดหมู่" มาใช้กับ `main` **ตั้งใจตัดออกไม่ทำรอบนี้**: หัวข้อกฎหมาย/tag (`LegalTopic`/`DocumentTopic` — ตรวจสอบแล้วว่า ocs-krisdika ไม่มี field นี้เลย `category = null` 100% ต้อง classify ด้วย LLM แยกต่างหาก), คำอธิบาย/cross-reference ที่คลิกได้ในเนื้อหา (`InlineReference` — ต้อง derive เองด้วย regex/NLP เป็น batch job แยก ไม่มีใน raw dataset), UI version-timeline slider (schema รองรับอยู่แล้วเพราะ `Passage` ผูกกับ `DocumentVersion` แต่ frontend timeline component ไม่ทำรอบนี้), และ `soc-ratchakitcha` OCR fallback (24.6% ของ records ที่ `sections` ว่างจะถูกข้ามไปก่อน ไม่ fallback)

- [x] 4.1 DB: เพิ่ม `Document`/`DocumentVersion`/`Passage` model (ไม่แตะ `LegalDocument`/`DocumentChunk` เดิมที่ chat/seed ใช้อยู่ — เพิ่มคู่ขนานไปก่อน)
  - Port จาก `chore/trim-schema-phase-1-2`'s `packages/db/prisma/schema.prisma` แบบตัดทอน — **ไม่เอา** `Workspace`/multi-tenancy, `CourtCaseMeta`, `LegalTopic`/`DocumentTopic`/`InlineReference`, `ResearchSession`/`ResearchMessage`/`Citation`, และ**ไม่เอา `embedding`** บน `Passage` ด้วย (scope รอบนี้คือ browse ตามหมวดหมู่ + TOC ไม่ใช่ semantic search)
  - `Document.lawCode` (`@unique`) = `law_code`, `docType` เก็บ prefix ดิบ ไม่เก็บ "หมวดหมู่" เป็น column แยก — คำนวณฝั่ง backend (ดู 4.3)
  - `DocumentVersion.isLatest` / `Passage.sectionType`/`parentId` — ตามที่ verify ไว้จากข้อมูลจริงบน branch เดิม (รายละเอียด gotcha ดู 4.2)
  - migration: `20260729154208_add_document_library`

  - [x] FIX #12: local dev DB drift อีกรอบ — สาเหตุจาก `bun run db:push` ที่รันทดสอบตอนแก้ FIX #env-file ของ `packages/db/package.json` ก่อนหน้า (`db push` sync ตาม schema.prisma แบบ declarative ทำให้ HNSW index ที่สร้างผ่าน raw SQL migration หายไปจาก live DB เพราะไม่ได้ประกาศไว้ใน schema.prisma) ทำให้ `migrate dev` เจอ drift ตอนจะสร้าง migration ของ Phase 4 | แก้ด้วย `prisma migrate reset --force` อีกรอบ (ขอ consent ผู้ใช้ก่อนตาม pattern เดิม, local dev เท่านั้น)
    - 🧪 test: `prisma migrate reset --force` → apply migration เดิม 2 ตัวสำเร็จ + seed ผ่าน ✅ → `migrate dev --name add_document_library` → สร้าง+apply migration ใหม่สำเร็จไม่มี drift ✅ | `\dt` → เห็น `Document`/`DocumentVersion`/`Passage` ครบ ✅ | `bun test` (api) → 36 pass ไม่กระทบของเดิม ✅
    - 📝 commit: `fix(db): reset local dev db to resolve drift from earlier db:push test`

  - 📝 commit: `feat(db): add document/documentversion/passage models for law library browse`

- [x] 4.2 Ingestion script: `packages/ingestion` (ดาวน์โหลด + parse + upsert)
  - Port `packages/ingestion/src/{ingestOcsKrisdika.ts, sources/ocsKrisdika.ts}` เป็น `packages/core` ใหม่ (`documentCategory.ts`, `thai.ts`) จาก `chore/trim-schema-phase-1-2` — ตัด `ratchakitchaFallback.ts` และ embedding logic ทั้งหมดออก (ตาม scope ที่ตัดสินใจไว้ — record ที่ `sections` ว่างถูก skip พร้อมนับใน `passagesSkippedNoSections`)
  - `deriveDocType(title)` + `categorizeDocType()` (เพิ่มใหม่ ไม่มีในต้นฉบับ — ใช้แยก primary/subordinate จาก docType ที่เก็บไว้แล้ว สำหรับ 4.3)
  - CLI runner (`runIngest.ts`) รับ `<year> <month>` — ทดสอบสดจริงกับ `bun run ingest <year> <month>`
  - **verify กับข้อมูลจริงเพิ่มเติม (ไม่ได้อยู่ใน scope เดิมแต่จำเป็นต้องเช็คก่อนเชื่อว่า port ถูก)**: sample เดือน 2024-01/2019-01 ที่ทดสอบตอนแรกบังเอิญมีแต่ `กฎกระทรวง` ซึ่งใช้ `sectionTypeId` คนละชุดกับที่ map ไว้ (ตกไปเป็น `"other"` หมด ไม่ใช่บั๊ก — กฎกระทรวงใช้ "ข้อ" ไม่ใช่ "มาตรา/หมวด") ดาวน์โหลด raw JSONL หลายเดือนมาเช็คตรงจนเจอ `พระราชบัญญัติ` จริง (2018-05, 2021-11) ยืนยันว่า `sectionTypeId` mapping (`1,2,3,4,8,13,14,15`) ถูกต้องตรงกับที่อ้างไว้ — TOC hierarchy ใช้งานได้เต็มรูปแบบเฉพาะ "กฎหมายหลัก" (พ.ร.บ./ประมวลกฎหมาย) ส่วนกฎหมายลำดับรองจะเป็น flat list (ไม่ใช่ regression เพราะปกติกฎหมายลำดับรองก็ไม่มีโครงสร้างหมวด/ส่วนลึกอยู่แล้ว)
  - ingest จริง full year 2019 (12 เดือน) ผ่าน `bun run ingest` เพื่อสร้าง demo corpus — **152 documents, 191 versions, 7,616 passages, 0 errors**

  - 🧪 test: `packages/ingestion/tests/ingestOcsKrisdika.test.ts` (6 pass) — hierarchy ผูก parentId ถูก (มาตราลูกของหมวด), dedupe เห็น contentHash ตรงเดิม, เพิ่มเวอร์ชันใหม่ → isLatest ของเวอร์ชันเก่าถูกตั้ง false อัตโนมัติ, **real-world bug regression test**: raw dataset ประกาศ `is_latest:true` พร้อมกันทุก record → ต้องเหลือ isLatest จริงแค่ 1 ตัวจาก timeline_code suffix สูงสุด ไม่ขึ้นกับลำดับประมวลผล, sections ว่าง/blank ไม่ throw ✅ | `bun test` (root, ทั้ง monorepo) → 42 pass ไม่กระทบ suite เดิม ✅ | ingest จริง 12 เดือนสำเร็จ 0 errors ✅
  - 📝 commit: `feat(ingestion): port ocs-krisdika parser and ingest law library corpus`

- [x] 4.3 API: browse endpoints
  - `documentRepository.ts` (`findMany`/`countByDocType`/`findByIdWithLatestVersion`) → `services/library/documentService.ts` (group `docType` counts เป็น primary/subordinate ผ่าน `categorizeDocType`, `buildToc()` แปลง flat `Passage[]` + `parentId` เป็น nested tree) → `documentController.ts` + `routes/documents.ts`
  - `GET /api/documents?docType=X` — คืน `categories` (สรุป 2 หมวดใหญ่พร้อมจำนวน), `docTypes` (จำนวนต่อ docType ย่อย), `documents` (list, filter ได้)
  - `GET /api/documents/:id` — คืนเอกสาร + `version` (ล่าสุดเท่านั้น, filter `isLatest`) + `toc` (nested tree, ทุก node มี `children: []` เสมอแม้ไม่มีลูก)
  - authGuard เท่านั้น ไม่มี `requirePermission` เพิ่ม (เมนู `library` มี `canView` ให้ทุก role ตาม seed เดิม)
  - เพิ่ม `apps/api` เป็น dependent ของ `@law-ai/core` ใหม่ — ต้องอัปเดต `apps/api/Dockerfile`/`apps/web/Dockerfile` ให้ copy `packages/core/package.json` + `packages/ingestion/package.json` เข้า deps stage ด้วย (workspace member ใหม่ต้องมีครบก่อน `bun install --frozen-lockfile` จะ resolve ได้ — บั๊ก class เดิมที่เจอซ้ำหลายรอบ) แต่ `packages/core` เองไม่มี dependency จึงไม่มี `node_modules` ให้ copy ต่อ (ต่างจาก `packages/db`/`apps/api`)

  - 🧪 test: `apps/api/tests/documents.test.ts` (5 pass) — 401 ไม่มี token, list คืน category counts ครบ 2 หมวด + filter `docType` ได้ถูกต้อง, detail คืน TOC tree ที่ทุก node มี `children` เป็น array, id ไม่มีจริง → 404 ✅ | `bun test` (root) → 41 pass ไม่กระทบของเดิม ✅ | live curl ผ่าน `docker compose` จริง — list เห็น 117/35 หมวดหลัก/รอง, detail ของ พ.ร.บ.สถาบันบัณฑิตพัฒนบริหารศาสตร์ 2562 เห็น `หมวด ๑` ผูกลูกมาตรา 7-18 ถูกต้องครบ 12 มาตรา ✅
  - 📝 commit: `feat(api): law library browse endpoints with category counts and toc tree`

- [x] 4.4 Web: หน้า browse คลังกฎหมาย
  - แทนที่ placeholder `LibraryPageContent.tsx` เดิม — 3 คอลัมน์: `CategorySidebar.tsx` (antd `Tree` 2 ชั้น หมวดใหญ่→docType ย่อยพร้อมจำนวน, คลิก docType เพื่อ filter), `DocumentList.tsx` (antd `List`, คลิกเลือกเอกสาร), `DocumentDetail.tsx` (antd `Tree` เป็น TOC + render เนื้อหาเต็มเอกสารต่อเนื่องเป็น flat list ตามลำดับ ไม่ใช่โชว์ทีละมาตรา — คลิก TOC node แล้ว `scrollIntoView` ไปยัง anchor ของมาตรานั้น ตรงตาม spec "คลิกมาตราแล้วเลื่อนไปเนื้อหา")
  - ใช้ Ant Design ปกติ (light theme) ตาม Dev Standard — ตรงข้ามกับหน้า chat ที่เป็น custom dark component ทั้งหมด ไม่ปนกัน
  - หน้านี้ยังไม่ตัด scope RolePermission เพิ่ม — ใช้ `PermissionGuard menuKey="library"` เดิมที่มีอยู่แล้ว

  - 🧪 test: `bunx tsc --noEmit` → ผ่านไม่มี type error ✅ | `docker compose up -d --build web` → build สำเร็จ, container healthy ✅ | curl `/library` → 200 ไม่มี server-render error ✅ | **การคลิก tree/scroll จริงบนหน้าจอยังไม่ยืนยันด้วย browser จริง** (ไม่มี browser tool ใน environment นี้) — ข้อมูล/hierarchy ที่ endpoint ส่งมาถูกยืนยันถูกต้องแล้วด้วย curl ตรงใน 4.3
  - 📝 commit: `feat(web): law library browse page with category sidebar and toc tree`

---

### Phase 5 — แชทกฎหมาย (แท็บใหม่แยกจากแชททั่วไป, RAG grounding)

> หมายเหตุ: **แชททั่วไป (Phase 3, เมนู "แชท") ไม่แก้พฤติกรรมเดิมเลย** — ยังคงตอบทั่วไปไม่บังคับ citation เหมือนเดิมทุกอย่าง Phase นี้คือเพิ่มแท็บ/เมนูใหม่ **"แชทกฎหมาย"** แยกต่างหาก ที่ค้น `Document`/`Passage` (Phase 4) ก่อนตอบแล้วบังคับอ้างอิง `[n]` ตาม § AI/RAG Architecture — คนละหน้ากับแชททั่วไป ผู้ใช้เลือกเองว่าจะคุยแบบไหน
>
> **แนวทาง reuse**: ใช้ตาราง `Conversation`/`Message` เดิมร่วมกัน (ไม่สร้างตารางซ้ำ — เลี่ยงปัญหา "2 ที่ข้อมูลไม่ sync กัน" ที่โปรเจกต์นี้เจอมาแล้วหลายรอบ เช่น `documentCategory.ts`/`thai.ts` ที่ตั้งใจแยก package ไว้ที่เดียวเพราะเหตุผลเดียวกัน) เพิ่มแค่ column `Conversation.mode` (`"general"` default | `"legal"`) เป็นตัวแยก — เขียนโค้ดใหม่ทั้งหมดของแชทกฎหมายเป็นไฟล์แยก (`legalChatCompletionService.ts`, route/menu ใหม่) ไม่แก้ไฟล์ของ Phase 3 เลยสักบรรทัด นอกจาก 1 จุดคือ `conversationService.create` ต้องรับ `mode` param เพิ่ม (มี default เป็น `"general"` ไม่กระทบของเดิมที่เรียกแบบไม่ส่ง `mode`)
>
> **เรื่องความเร็ว/cache ที่ถามมา** — แยก 2 ประเด็นที่มักปนกัน:
> 1. **Embed/index ข้อมูลทั้งคลัง** ต้องทำแค่ครั้งเดียวตอน ingest (Phase 4.2 ทำไปแล้ว ไม่เกี่ยวกับตอนตอบคำถามเลย) ไม่ใช่สิ่งที่เกิดซ้ำทุกครั้งที่มีคนถามคำถาม — ส่วนนี้ไม่มีอะไรต้องแก้
> 2. **Query ตอนค้นหาคำตอบ (retrieval)** เกิดขึ้นจริง 1 ครั้ง/คำถาม แต่ตัวที่ทำให้ "ช้า" ไม่ใช่เพราะ "อ่านซ้ำ" — เป็นเพราะ**ไม่มี index ที่เหมาะสม** ทำให้ Postgres ต้อง scan ทั้งตารางทุกครั้ง ถ้าใส่ GIN index (full-text) ให้ถูกต้อง query จะเร็วระดับ **มิลลิวินาที** ไม่ว่าคลังจะมีกี่พันมาตราก็ตาม — เร็วกว่าเวลาที่โมเดล LLM ใช้ตอบ (หลักวินาที) หลายพันเท่าอยู่แล้ว **ไม่จำเป็นต้องมี Redis สำหรับปัญหานี้** Redis จะช่วยได้จริงเฉพาะกรณี cache คำตอบของคำถามที่ "เหมือนเดิมทุกตัวอักษร" ซ้ำๆ (hit rate ต่ำสำหรับ chat ที่คำถามหลากหลาย) — ใส่เป็น stretch goal ไว้ท้าย task ไม่ใช่ requirement ของรอบนี้

- [ ] 5.1 DB: `Conversation.mode` column + full-text search index บน `Passage.content` (ไม่ใช้ embedding/semantic search ในรอบนี้)
  - `Conversation.mode String @default("general")` — migration แบบ additive มี default ไม่กระทบแถวเดิมที่มีอยู่แล้ว
  - เพิ่ม `tsvector` generated column (`to_tsvector('simple', content)` — ใช้ `simple` config ไม่ใช่ `thai`/`english` เพราะ Postgres ไม่มี Thai text search config ในตัว, `simple` ยัง tokenize คำ Thai ที่คั่นด้วยช่องว่าง/เครื่องหมายวรรคตอนได้) + GIN index บน column นั้น ผ่าน raw SQL migration (เหมือน pattern เดิมของ HNSW index ใน Phase 1)
  - เพิ่ม `pg_trgm` extension + trigram index เสริมสำหรับกรณีค้นคำที่ติดกัน ไม่มีช่องว่างคั่น (คำไทยส่วนใหญ่ไม่มีช่องว่างระหว่างคำ ตัด tsvector ด้วยช่องว่างอย่างเดียวไม่พอ)
  - ไม่ทำ semantic/embedding search รอบนี้ — คลังกฎหมายไทยเป็น citation-heavy (ผู้ใช้มักถามถึงเลขมาตรา/ชื่อกฎหมายตรงๆ) full-text/trigram พอสำหรับ v1 ถ้าคุณภาพไม่พอค่อยกลับมาเพิ่ม embedding column ทีหลัง (schema เผื่อไว้แล้วจาก design เดิม เพิ่มทีหลังได้โดยไม่ breaking)

- [ ] 5.2 API: retrieval service
  - `services/rag/retrievalService.ts`: รับคำถามผู้ใช้ → full-text query (`plainto_tsquery`) บน `Passage` join `Document`/`DocumentVersion` (filter `isLatest=true` เท่านั้น) → คืน top-K (K=8-10) เรียงตาม `ts_rank`
  - exact-match fast path: ถ้า query มีรูปแบบ "มาตรา <เลข>" หรือชื่อกฎหมายตรงๆ ให้ query ตรงด้วย `sectionNumber`/`lawCode`/`title` (`ILIKE`) ควบคู่กับ full-text แล้ว merge ผลลัพธ์ (แม่นกว่า full-text ranking ล้วนๆ สำหรับ query ที่ระบุมาตราชัดเจน)
  - format แต่ละ passage เป็นข้อความมีเลขกำกับ `[1] มาตรา 420 (พ.ร.บ. xxx): ...` ต่อกันเป็น context block เดียว

- [ ] 5.3 API: `legalChatCompletionService.ts` (ไฟล์ใหม่ ไม่แก้ `chatCompletionService.ts` เดิมของ Phase 3) + citation validation
  - ก่อนเรียก OpenRouter: retrieve top-K passages จากคำถามล่าสุดเสมอ (แชทกฎหมายบังคับค้นทุกครั้ง ต่างจากแชททั่วไปที่ไม่มี retrieval เลย) → ใส่เป็น context message ต่อจาก system prompt (ก่อนประวัติสนทนา — ตาม pattern "system prompt คงที่เป็น prefix, ส่วนที่เปลี่ยนไว้ท้ายสุด" ของ § AI/RAG Architecture ข้อ 5) → ถ้าค้นไม่เจอเลยให้ตอบว่าไม่พบข้อมูลในคลัง (ตาม system prompt ที่ CLAUDE.md กำหนดไว้ — "ห้ามคาดเดาหรือใช้ความรู้ทั่วไปนอก context")
  - system prompt คนละตัวกับแชททั่วไป — บังคับใส่เลข `[n]` กำกับทุกข้อความที่อ้างจาก context ตาม § AI/RAG Architecture ข้อ 3 พร้อม disclaimer ตามเงื่อนไข dataset ต้นทาง
  - Backend parse `[n]` จาก response ที่ stream มา validate กับ passage ที่ retrieve จริงในรอบนั้น (Dev Standard #2) — เลขที่ไม่ตรง/เกินขอบเขตตัดทิ้งก่อนบันทึก
  - เก็บ citations ที่ validate แล้วลง `Message.citations` (field มีอยู่แล้วใน schema เดิม ไม่ต้อง migrate)
  - route แยก `POST /api/legal-conversations/:id/messages` (หรือ reuse `/api/conversations/:id/messages` เดิมแล้ว branch ตาม `conversation.mode` ข้างใน — เลือกตอน implement จริงตามที่ diff เล็กกว่า)

- [ ] 5.4 Web: เมนู + หน้า "แชทกฎหมาย" แยกจาก "แชท"
  - เพิ่มเมนู `legal-chat` ใน `Sidebar.tsx`/`ROUTES` (เมนูใหม่ ต้อง seed `RolePermission` เพิ่มด้วย) + route ใหม่ (เช่น `/legal-chat`) — ไม่แก้ route/หน้า `/` (แชททั่วไป) เลย
  - reuse component จาก `modules/chat/` เท่าที่ทำได้ (`MessageThread`, `MarkdownMessage`, `ChatInput` — UI เหมือนกันแค่ endpoint/mode ต่าง) สร้างเฉพาะส่วนที่ต่างจริงๆ เป็นของใหม่: แสดง `[n]` เป็นลิงก์/badge คลิกไปดู passage ต้นฉบับได้ (เปิด modal หรือลิงก์ไป `/library` ของเอกสารนั้น)

- [ ] 5.5 (stretch, ไม่บังคับรอบนี้) Redis cache สำหรับคำถามซ้ำเป๊ะ
  - เฉพาะกรณีอยาก optimize เพิ่มหลัง 5.1-5.4 ใช้งานจริงแล้วเจอว่าจำเป็น — cache key = hash ของคำถาม (normalize whitespace/case) → cache ผลลัพธ์ retrieval (ไม่ cache คำตอบ LLM ทั้งข้อความ เพราะ context สนทนาก่อนหน้าต่างกันทำให้คำตอบไม่เหมือนกันได้แม้คำถามล่าสุดจะซ้ำ)

---


---

<!--
## วิธีใช้ไฟล์นี้

1. เริ่ม Phase 1 ตามลำดับ — Phase 1-2 (Setup + Auth) เป็น boilerplate มาตรฐาน ปรับน้อย
2. Phase 3-4 คือแกนหลักของระบบ (RAG + Chat) — อ่าน § AI / RAG Architecture ให้เข้าใจก่อนเริ่ม โดยเฉพาะกฎ citation grounding และ prompt caching placement


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
