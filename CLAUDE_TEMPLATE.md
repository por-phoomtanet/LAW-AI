# {{PROJECT_NAME}} — {{COMPANY_NAME}}

{{PROJECT_DESCRIPTION}}

---

## ขอบเขตระบบ (Scope)

### ✅ ทำได้ใน Phase นี้
| ระบบ | Feature |
|---|---|
| {{MODULE_1}} | {{FEATURES_1}} |
| {{MODULE_2}} | {{FEATURES_2}} |
| Auth | Login/JWT, Role (admin/manager/staff), User Management |

### 🔜 Phase ถัดไป (ทำทีหลัง)
| ระบบ | เหตุผลที่เลื่อน |
|---|---|
| {{FUTURE_MODULE_1}} | {{REASON_1}} |
| {{FUTURE_MODULE_2}} | {{REASON_2}} |

---

## Tech Stack

- **Docker** — containerize ทุก service
- **PostgreSQL** — relational database หลัก
- **Prisma ORM** — schema, migration, type-safe query
- **Next.js 15** (App Router) — dashboard UI
- **Tailwind CSS** — utility-first styling
- **Ant Design** — UI component library (Table, Form, Modal, etc.)
- **Axios** — HTTP client (single instance, interceptors)
- **Zustand** — lightweight global state management
- **Bun + Elysia** — runtime + web framework สำหรับ REST API (Bun แทน Node.js, Elysia แทน Express)
- **JWT + bcrypt** — Authentication / Authorization (`@elysiajs/jwt` สำหรับ JWT plugin)
- **ExcelJS** — Export รายงานเป็น Excel (.xlsx) และ CSV
- **Bun test (native)** — Unit & Integration test (API) — built-in test runner ของ Bun ไม่ต้องพึ่ง Jest/Supertest
- **Git Monorepo** — จัดการ codebase

---

## Monorepo Structure

```
{{PROJECT_FOLDER}}/
├── apps/
│   ├── api/
│   │   ├── src/
│   │   │   ├── routes/         # Elysia route definitions — chains plugin + controller
│   │   │   ├── controllers/    # รับ Elysia context ({ body, params, set }) — calls service, returns response
│   │   │   ├── services/       # business logic — calls repository, ไม่รู้จัก Elysia context
│   │   │   ├── repositories/   # data access — Prisma queries only, ไม่มี business logic
│   │   │   ├── plugins/        # Elysia plugins — authGuard, roleGuard, errorHandler (แทน Express middleware)
│   │   │   ├── types/          # TypeScript declarations (schema types, DTO)
│   │   │   └── utils/          # pure helpers (errors.ts, etc.)
│   │   ├── tests/
│   │   ├── app.ts              # สร้าง Elysia instance — ไม่เรียก .listen() ที่นี่ (import ได้ตรงใน test)
│   │   ├── index.ts            # import app.ts แล้วเรียก .listen() จริง
│   │   └── package.json
│   └── web/
│       ├── app/                        # Next.js App Router — routing ONLY
│       │   ├── (auth)/
│       │   │   └── login/page.tsx
│       │   ├── (dashboard)/
│       │   │   ├── layout.tsx
│       │   │   ├── page.tsx
│       │   │   ├── {{page_1}}/page.tsx
│       │   │   ├── {{page_2}}/page.tsx
│       │   │   └── users/page.tsx
│       │   ├── layout.tsx
│       │   └── globals.css
│       ├── modules/                    # Feature modules — domain logic per feature
│       │   ├── auth/
│       │   │   ├── components/         # LoginForm
│       │   │   ├── hooks/              # useLogin
│       │   │   ├── services/           # authApi.ts
│       │   │   └── types.ts
│       │   ├── {{feature_1}}/
│       │   │   ├── components/
│       │   │   ├── hooks/
│       │   │   ├── services/           # {{feature_1}}Api.ts
│       │   │   └── types.ts
│       │   └── users/
│       │       ├── components/
│       │       ├── hooks/
│       │       ├── services/           # usersApi.ts
│       │       └── types.ts
│       ├── shared/                     # Cross-feature reusable code
│       │   ├── components/             # PageHeader, DataTable, ConfirmModal
│       │   ├── layouts/                # DashboardLayout (Sidebar + Header)
│       │   └── guards/                 # AuthGuard, PermissionGuard
│       ├── services/                   # Global HTTP layer
│       │   └── api.ts                  # Axios instance — baseURL, token interceptor
│       ├── store/                      # Global state (Zustand)
│       │   ├── authStore.ts            # user, token, setAuth, clearAuth
│       │   ├── permissionStore.ts      # permissions, canView/canCreate/canUpdate/canDelete
│       │   ├── rolesStore.ts           # roles list + getLabelByName, clear ตอน logout
│       │   └── masterStore.ts          # master data (types, units, etc.) active-only, clear ตอน logout
│       ├── types/                      # Global TypeScript types
│       │   └── index.ts                # ApiResponse<T>, PaginatedResponse<T>, User
│       ├── constants/                  # App-wide constants
│       │   └── index.ts                # ROUTES, API_BASE_URL
│       └── lib/                        # Pure utilities
│           └── utils.ts
├── packages/
│   └── db/
│       ├── prisma/
│       │   ├── schema.prisma
│       │   └── migrations/
│       ├── src/
│       │   └── index.ts
│       └── package.json
├── docker-compose.yml
└── package.json
```

---

## User Roles

Role คือแค่ชื่อ — สิทธิ์จริง (canView/canCreate/canUpdate/canDelete per menu) กำหนดใน `RolePermission` ใน DB ผ่านหน้า `/settings/roles`

| Role | คำอธิบาย |
|---|---|
| `admin` || Role เริ่มต้น — {{MANAGER_DEFAULT_PERMISSIONS}} |
| `manager` | Role เริ่มต้น — {{MANAGER_DEFAULT_PERMISSIONS}} |
| `staff` | Role เริ่มต้น — {{STAFF_DEFAULT_PERMISSIONS}} |

---

## Data Models (Prisma Schema)

```prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider  = "postgresql"
  url       = env("DATABASE_URL")
  directUrl = env("DIRECT_URL")
}

// Role เป็น table ไม่ใช่ enum — เพื่อให้ admin สร้าง role ใหม่ได้
model Role {
  id          Int              @id @default(autoincrement())
  name        String           @unique   // ใช้เป็น identifier (admin, manager, staff)
  label       String                     // ชื่อแสดงผล (ผู้ดูแลระบบ, ผู้จัดการ, พนักงาน)
  createdAt   DateTime         @default(now())
  users       User[]
  permissions RolePermission[]
}

model RolePermission {
  id        Int      @id @default(autoincrement())
  roleId    Int
  role      Role     @relation(fields: [roleId], references: [id])
  menuKey   String   // "dashboard" | "products" | "reports" | "users" | "settings" | ...
  canView   Boolean  @default(true)
  canCreate Boolean  @default(false)
  canUpdate Boolean  @default(false)
  canDelete Boolean  @default(false)
  updatedAt DateTime @updatedAt

  @@unique([roleId, menuKey])
}

model User {
  id           Int       @id @default(autoincrement())
  name         String
  email        String    @unique
  passwordHash String
  roleId       Int
  role         Role      @relation(fields: [roleId], references: [id])
  isActive     Boolean   @default(true)
  createdAt    DateTime  @default(now())
  deletedAt    DateTime?
}

// model {{ModelName}} {
//   id        Int       @id @default(autoincrement())
//   name      String
//   isActive  Boolean   @default(true)   // toggle สถานะโดยไม่ลบ
//   createdAt DateTime  @default(now())
//   updatedAt DateTime  @updatedAt
//   deletedAt DateTime?                  // Soft Delete
// }
```

---

## API Endpoints

| Method | Path | Auth | คำอธิบาย |
|---|---|---|---|
| POST | `/api/auth/login` | * | Login รับ JWT |
| GET | `/api/auth/me` | auth | ดูข้อมูลตัวเอง |
| GET | `/api/health` | * | Health check (status + db + uptime) |
| GET/POST | `/api/{{resource}}` | auth | รายการ / เพิ่ม |
| GET/PUT/DELETE | `/api/{{resource}}/:id` | auth | ดู / แก้ไข / ลบ |
| PATCH | `/api/{{resource}}/:id/status` | auth | toggle isActive |
| GET | `/api/reports/export` | auth | Export Excel / CSV |
| GET/POST | `/api/users` | auth | จัดการ user |
| PUT/DELETE | `/api/users/:id` | auth | แก้ไข / ลบ user |
| GET | `/api/roles` | auth | ดึง role ทั้งหมด |
| POST/PUT/DELETE | `/api/roles` / `/api/roles/:id` | auth | สร้าง / แก้ไข / ลบ role |
| GET | `/api/role-permissions` | auth | ดึง permission ทั้งหมด |
| GET | `/api/role-permissions/:role` | auth | ดึง permission ของ role นั้น |
| PUT | `/api/role-permissions/:role/:menuKey` | auth | อัปเดต permission |
| GET | `/api/master/{{type}}` | auth | Master data (active only by default) |
| POST/PUT/DELETE | `/api/master/{{type}}/:id` | auth | CRUD master data |
| PATCH | `/api/master/{{type}}/:id/status` | auth | toggle master data status |

---

## Dev Standards (บังคับใช้ทุก Phase)

> กฎเหล่านี้ป้องกันบัคที่พบบ่อยที่สุด — ต้องทำก่อนเขียน feature จริง

### 1. Input Validation — Elysia schema (`t.Object`)
ทุก route ที่รับ body/query ต้อง validate ด้วย Elysia's built-in TypeBox schema — Elysia validate ให้อัตโนมัติก่อนเข้า controller (ไม่ต้องเขียน validate middleware แยกแบบ Express+Zod)
```ts
app.post('/resource', controller.create, {
  body: t.Object({ name: t.String({ minLength: 1 }), qty: t.Integer({ minimum: 1 }) }),
})
// validation fail → throw ที่ Elysia ดักเป็น code: 'VALIDATION' → global .onError() จัดการ
```
ใช้ Zod เฉพาะ validation logic ที่ซับซ้อนเกินกว่า TypeBox จะแสดงออกได้ (เช่น cross-field business rule) — ไม่ใช่ default ทุก route

### 2. Global Error Handler — Elysia `.onError()`
hook เดียวใน `apps/api/src/app.ts` — format error response สม่ำเสมอ
```ts
app.onError(({ code, error, set }) => {
  if (code === 'VALIDATION') { set.status = 400; return { error: error.message } }
  if (error instanceof HttpError) { set.status = error.status; return { error: error.message } }
  set.status = 500
  return { error: 'Internal server error' }
})
```

### 3. Prisma Transaction สำหรับ operation ที่ต้องทำพร้อมกัน
Operation ที่ต้อง update หลาย record พร้อมกัน (เช่น stock + log) ต้องใช้ `$transaction`
```ts
await prisma.$transaction([
  prisma.resource.update({ where: { id }, data: { ... } }),
  prisma.log.create({ data: { ... } }),
])
```

### 4. Env Validation ตอน Startup
validate ทุก required env var ก่อน server เริ่ม
```ts
const required = ['DATABASE_URL', 'JWT_SECRET']
required.forEach(k => { if (!process.env[k]) throw new Error(`Missing env: ${k}`) })
```

### 5. Consistent API Response Format
```ts
return { data: result, message: 'ok' }              // Success — return object ตรงๆ, Elysia serialize ให้
set.status = 400; return { error: 'message' }       // Error — ตั้ง set.status ก่อน return
```

### 6. ESLint + Prettier
- `@typescript-eslint/no-explicit-any` — ห้ามใช้ `any`
- `@typescript-eslint/no-unused-vars` — ห้ามมี unused variables
- Prettier format ก่อน commit (ผ่าน lint-staged + Husky)
- หมายเหตุ: ห้ามใช้ `eslint-config-next` เพราะดึง ESLint 10 ซึ่ง conflict กับ v8 — ใช้ `@typescript-eslint` โดยตรงแทน

### 7. Controller-Service-Repository Pattern

| ชั้น | ความรับผิดชอบ | รู้จัก | ไม่รู้จัก |
|---|---|---|---|
| **Route** | HTTP path + plugin chain (`.use(authGuard)`) | Elysia plugins, controller | business logic, DB |
| **Controller** | รับ Elysia context (`{ body, params, set }` ที่ validate แล้ว) → เรียก service → return ค่า | service | Prisma, business rules |
| **Service** | business logic | repository | Elysia context (`set`, `Request`), HTTP status |
| **Repository** | Prisma query เท่านั้น | PrismaClient | business rules, HTTP |

**กฎข้าม:** Controller ห้าม import Prisma | Service ห้าม import Elysia context | Repository ห้ามมี if/else business logic

### 8. Feature-Based Frontend Architecture (Web)
Next.js App Router ใช้เป็น routing layer เท่านั้น

```ts
// app/(dashboard)/products/page.tsx — routing ONLY
import ProductsPage from '@/modules/products/components/ProductsPage'
export default function Page() { return <ProductsPage /> }
```

**กฎข้าม:**
- `app/` ห้ามมี useState / useEffect / fetch
- `modules/[feature]/services/` ห้าม import จาก modules อื่น — ใช้ `services/api.ts`
- ห้ามสร้าง Axios instance มากกว่า 1 ตัว

### 9. Soft Delete
Record ที่ "ลบ" ต้องใช้ Soft Delete — set `deletedAt DateTime?` แทน DELETE จริง

```ts
// Repository: ทุก findAll ต้อง filter
where: { deletedAt: null }

// findById ต้องใช้ findFirst ไม่ใช่ findUnique — เพราะต้องใส่ deletedAt: null ด้วย
// (findUnique รับแค่ unique fields ใน where — ถ้าใส่ deletedAt จะ error)
findFirst({ where: { id, deletedAt: null } })   // ✅ ถูก
findUnique({ where: { id } })                    // ❌ ไม่ filter soft-deleted record

// Service: deleteById → update({ deletedAt: new Date() })
// API: DELETE /:id ยัง return 200 เหมือนเดิม — client ไม่รู้ว่าเป็น soft delete
```

### 10. Role Permission (Dynamic RBAC)
สิทธิ์การเข้าถึง menu และ CRUD action ต้องอ่านจาก `RolePermission` ใน DB

**กฎ Frontend:**
- หลัง login → `GET /api/role-permissions/:role` → เก็บใน `permissionStore` (Zustand, persist)
- Sidebar: render เฉพาะ menu ที่ `canView: true`
- ปุ่ม action แสดงตาม `canCreate / canUpdate / canDelete`
- ทุกหน้าใช้ `<PermissionGuard menuKey="...">` — ห้ามใช้ `RoleGuard` ที่ hardcode role name
- `permissionStore` ต้อง clear ตอน logout

```tsx
// ✅ ถูก — ตรวจสิทธิ์ผ่าน permissionStore
<PermissionGuard menuKey="products">
  <ProductsPage />
</PermissionGuard>

// ❌ ผิด — hardcode role name
<RoleGuard roles={['admin', 'manager']}>
  <ProductsPage />
</RoleGuard>
```

**`PermissionGuard`** ต้องใช้ `mounted` state เพื่อรอ Zustand rehydrate ก่อน check:
```tsx
function PermissionGuard({ children, menuKey }) {
  const canView = usePermissionStore((s) => s.canView(menuKey))
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])
  if (!mounted) return <Spin />
  if (!canView) return <Page403 />
  return <>{children}</>
}
```

### 11. Role Table (ไม่ใช่ enum)
Role เป็น DB table เพื่อให้ admin สร้าง role ใหม่ได้
- Repository flatten `role: { name: 'admin' }` → `role: 'admin'` ก่อน return เสมอ
- JWT payload ยังคง `role: string` ไม่เปลี่ยน
- migration: ต้อง `ALTER TYPE "Role" RENAME TO "RoleEnum"` ก่อน CREATE TABLE ชื่อ "Role"

### 12. isActive — Toggle Status (ไม่ใช่ Soft Delete)
Record ที่ต้องการ enable/disable (master data, products) ใช้ `isActive Boolean` แยกต่างหากจาก Soft Delete

- API: `PATCH /:id/status` รับ `{ isActive: boolean }`
- GET list: ปกติ default filter `isActive: true` (`?status=active`) | เพิ่ม `?status=all` สำหรับหน้า admin
- Web Table: Tag สถานะ (success=ใช้งาน, default=ไม่ใช้งาน) + Switch ใน edit modal (ไม่ใช่ปุ่มแยก)
- Dropdown ทั่วระบบ: ดึงเฉพาะ active items เสมอ

**Repository filter ที่ถูกต้อง** — ต้อง filter ทั้ง isActive และ deletedAt พร้อมกัน:
```ts
// ✅ ถูก — filter ทั้ง isActive และ soft delete
where: status === 'active' ? { isActive: true, deletedAt: null } : { deletedAt: null }

// ❌ ผิด — ลืม deletedAt ทำให้ soft-deleted record ปรากฏใน list
where: { isActive: true }
```

### 13. Responsive Design (Mobile-first)
UI ต้องใช้งานได้บนหน้าจอมือถือ (≥ 375px) — ใช้ Ant Design utilities ที่มีอยู่แล้ว

- **Sidebar**: ใช้ `useBreakpoint()` — ถ้า `!screens.md` ให้แทน `<Sider>` ด้วย `<Drawer>`
- **Table**: ทุกตารางต้องมี `scroll={{ x: 'max-content' }}`
- **Form/Modal**: ใช้ `layout="vertical"` เสมอ
- **Button group**: ใช้ `<Space wrap>` แทน `<Space>`

### 14. Page Layout Template (บังคับทุกหน้า)

**ปุ่มเพิ่ม**: ต้องอยู่ขวาบนผ่าน `PageHeader extra={...}` เสมอ

```tsx
// ✅ ถูก — ปุ่มขวาบน
<PageHeader
  title="ชื่อหน้า"
  subtitle="คำอธิบาย"
  extra={
    canCreate ? (
      <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>
        เพิ่ม...
      </Button>
    ) : undefined
  }
/>

// ❌ ผิด — ปุ่มชิดซ้าย
<PageHeader title="ชื่อหน้า" />
<div style={{ marginBottom: 12 }}><Button>เพิ่ม...</Button></div>
```

**ปุ่ม action ในตาราง (แก้ไข/ลบ)**: ต้องใช้ `type="text"` เสมอ — ห้ามใช้ default (มีกรอบ)

```tsx
// ✅ ถูก
<Button type="text" icon={<EditOutlined />} onClick={...} />
<Button type="text" danger icon={<DeleteOutlined />} />

// ❌ ผิด — มีกรอบ
<Button size="small" icon={<EditOutlined />} />
```

**App/useApp pattern**: outer component wrap `<App>`, inner component call `App.useApp()`

```tsx
// ✅ ถูก — inner component อยู่ใน App context
function PageContent() {
  const { message } = App.useApp()  // ✅ อยู่ใน <App>
  ...
}
export default function Page() {
  return <App><PageContent /></App>
}

// ❌ ผิด — useApp() ถูกเรียกนอก <App>
export default function Page() {
  const { message } = App.useApp()  // ❌ ยังไม่มี <App> context
  return <App>...</App>
}
```

**Form per component**: ถ้ามีหลาย mode (types/units) ให้แยก component แยกกัน — ห้ามสร้าง `useForm()` แล้วไม่ connect กับ `<Form>`

### 15. Table Standard (บังคับทุกตาราง)

**1. คอลัมน์ "ลำดับ" เป็นคอลัมน์แรกเสมอ**
```tsx
// ตารางที่มี pagination — นับต่อเนื่องข้ามหน้า
{ title: 'ลำดับ', key: 'index', width: 60, align: 'center' as const,
  render: (_: unknown, __: unknown, index: number) => (page - 1) * pageSize + index + 1 }

// ตารางที่ pagination={false} — นับ 1, 2, 3...
{ title: 'ลำดับ', key: 'index', width: 60, align: 'center' as const,
  render: (_: unknown, __: unknown, index: number) => index + 1 }
```

**2. คอลัมน์ action ต้องมี `title: 'จัดการ'` เสมอ** — ห้ามใช้ `title: ''` เพราะ header จะหาย

**3. Controlled pagination + showSizeChanger**
```tsx
const [page, setPage] = useState(1)
const [pageSize, setPageSize] = useState(10)

pagination={{
  current: page,
  pageSize,
  showSizeChanger: true,
  pageSizeOptions: [10, 20, 50, 100],
  showTotal: (total: number) => `ทั้งหมด ${total} รายการ`,
  onChange: (p: number) => setPage(p),
  onShowSizeChange: (_: number, size: number) => { setPageSize(size); setPage(1) },
}}
```

**กฎเพิ่มเติม:**
- filter/sort เปลี่ยน → `setPage(1)` เสมอ
- ตาราง master data (ข้อมูลน้อย) → ใช้ `pagination={false}` ได้ แต่ยังต้องมีคอลัมน์ลำดับ
- ทุกตารางต้องมี `scroll={{ x: 'max-content' }}` สำหรับ mobile

### 16. Modal + Form Pattern

ทุก Modal ที่มี Form ต้องใช้รูปแบบนี้เสมอ:

```tsx
<Modal
  open={modal.open}
  destroyOnHidden           // ทำลาย DOM ตอนปิด — ป้องกัน state ค้างจากครั้งก่อน
  afterOpenChange={(open: boolean) => {
    if (open) {
      form.resetFields()                              // reset ก่อนเสมอ
      if (modal.editing) form.setFieldsValue({ ...modal.editing })  // แล้วค่อย set
    }
  }}
  onCancel={() => setModal({ open: false, editing: null })}
>
  <Form form={form} layout="vertical">...</Form>
</Modal>
```

**หมายเหตุ**: ห้ามใช้ `useEffect` ดูการเปลี่ยน `modal.open` เพื่อ resetFields — ใช้ `afterOpenChange` แทน เพราะ effect อาจ run ก่อน Modal animate เสร็จ

**isActive switch ใน edit modal เท่านั้น** — ตอน create ไม่ต้องแสดง (default `isActive: true`):
```tsx
{modal.editing && (
  <Form.Item name="isActive" label="สถานะ" valuePropName="checked">
    <Switch checkedChildren="ใช้งาน" unCheckedChildren="ปิด" />
  </Form.Item>
)}
```

### 17. Error Message Handling (API + Frontend)

**API**: service ต้อง throw error เป็นภาษาไทยที่ user เข้าใจได้ (ไม่ใช่ technical message):
```ts
// ✅ ถูก — Thai user-facing message
throw new ConflictError('ชื่อหน่วยนี้มีอยู่แล้ว')
throw new NotFoundError('ไม่พบหน่วยนับ')

// ❌ ผิด — technical message
throw new ConflictError('Unit name already exists')
```

**Frontend**: ต้อง extract error message จาก API response ก่อน fallback:
```tsx
// ✅ ถูก — แสดง API error message ถ้ามี
} catch (err) {
  const msg = axios.isAxiosError(err) ? err.response?.data?.error : undefined
  message.error(msg ?? 'เกิดข้อผิดพลาด')
}

// ❌ ผิด — แสดง generic message เสมอ ทำให้ user ไม่รู้สาเหตุ
} catch (err) {
  message.error('เกิดข้อผิดพลาด')
}
```

### 18. Audit Fields (บังคับสำหรับทุก table ที่ผู้ใช้ CRUD)

ทุก table ที่ผู้ใช้ CRUD ต้องมี audit fields ครบ — เพื่อ traceability และ soft delete:

```prisma
model {{ModelName}} {
  id          Int       @id @default(autoincrement())
  name        String
  isActive    Boolean   @default(true)
  createdAt   DateTime  @default(now())
  updatedAt   DateTime  @updatedAt
  deletedAt   DateTime?
  createdById Int?
  updatedById Int?
  createdBy   User?     @relation("{{Model}}CreatedBy", fields: [createdById], references: [id])
  updatedBy   User?     @relation("{{Model}}UpdatedBy", fields: [updatedById], references: [id])
}
```

**Repository pattern**:
```ts
const auditInclude = {
  createdBy: { select: { name: true } },
  updatedBy: { select: { name: true } },
} as const

findAll(status: 'active' | 'all' = 'active') {
  return prisma.model.findMany({
    where: status === 'active' ? { isActive: true, deletedAt: null } : { deletedAt: null },
    include: auditInclude,
  })
},
create(data: { name: string; createdById?: number }) {
  return prisma.model.create({ data, include: auditInclude })
},
update(id: number, data: { name?: string; updatedById?: number }) {
  return prisma.model.update({ where: { id }, data, include: auditInclude })
},
delete(id: number) {
  return prisma.model.update({ where: { id }, data: { deletedAt: new Date() } })
},
```

**Controller**: ส่ง `user.userId` (จาก context ที่ auth plugin `.derive()` แนบมาให้) ไปยัง service ทุก create/update:
```ts
async createItem({ body, user }: Context) {
  const item = await Service.createItem(body, user.userId)  // ✅ userId ทุกครั้ง
}
```

**Web**: แสดงคอลัมน์ "สร้างโดย" + "แก้ไขล่าสุด" ในตาราง:
```tsx
{ title: 'สร้างโดย', key: 'createdBy', width: 130,
  render: (_: unknown, r: ItemType) => r.createdBy?.name ?? '-' },
{ title: 'แก้ไขล่าสุด', key: 'updatedAt', width: 160,
  render: (_: unknown, r: ItemType) =>
    r.updatedAt ? `${new Date(r.updatedAt).toLocaleDateString('th-TH')}${r.updatedBy?.name ? ` (${r.updatedBy.name})` : ''}` : '-' },
```

**⚠️ Migration กับ `@updatedAt` บน existing table ที่มีข้อมูล:**
`prisma db push` จะล้มเหลวเพราะ Prisma เพิ่ม NOT NULL column โดยไม่มี DEFAULT
วิธีแก้: รัน SQL ด้วย `prisma db execute --file` ก่อน แล้วค่อย db push:
```sql
-- migration.sql
ALTER TABLE "{{ModelName}}"
  ADD COLUMN IF NOT EXISTS "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ADD COLUMN IF NOT EXISTS "deletedAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "createdById" INTEGER,
  ADD COLUMN IF NOT EXISTS "updatedById" INTEGER;
ALTER TABLE "{{ModelName}}"
  ADD CONSTRAINT "{{ModelName}}_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT "{{ModelName}}_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
```

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
| `FIX #N:` | sub-task แก้ปัญหา (สร้างอัตโนมัติ) |
| `before/after:` | แสดงก่อน-หลังแก้ (ถ้าสั้นพอ) |
| `fix:` | สรุปวิธีแก้สั้นๆ (ถ้ายาวเกิน) |
| `🧪 test:` | วิธีทดสอบ + ผลที่ควรเห็น |
| `📝 commit:` | ชื่อ git commit ที่แนะนำ |

**โครงสร้าง:**

```
- [x] 1.1 task หลัก
  - 🧪 test: <คำสั่ง> → <ผลที่ควรเห็น>
  - 📝 commit: `feat(1.1): ...`

  - [x] FIX #1: <ปัญหา> | before: ... → after: ...
    - 🧪 test: <คำสั่ง> → <ผลที่ควรเห็น>
    - 📝 commit: `fix(1.1): ...`
```

---

## Tasks

### Phase 1 — Project Setup

- [ ] 1.0 สร้างไฟล์ `.gitignore` ที่ root
  - 🧪 test: `git status` → node_modules, .env, dist ไม่ติด tracked
  - 📝 commit: `chore: add gitignore`

- [ ] 1.1 สร้าง Monorepo structure + ตั้งค่า Bun workspaces
  - 🧪 test: `bun install` root → ไม่มี error
  - 📝 commit: `chore: init monorepo workspace`

- [ ] 1.2 ตั้งค่า Docker Compose (PostgreSQL + API + Web)
  - หมายเหตุ: API service ใช้ base image `oven/bun` แทน `node`
  - 🧪 test: `docker compose up` → ทุก container ขึ้นปกติ
  - 📝 commit: `chore: add docker-compose`

- [ ] 1.3 ตั้งค่า Prisma ใน packages/db + เขียน schema.prisma + migrate
  - 🧪 test: `bunx prisma migrate dev` → migration สำเร็จ, tables ตรงกับ schema
  - 📝 commit: `feat(db): add prisma schema and initial migration`

- [ ] 1.4 ตั้งค่า Elysia API พื้นฐาน + เชื่อม PostgreSQL ผ่าน Prisma + Health endpoint
  - 🧪 test: `GET /api/health` → `{ status: "ok", db: "connected", uptime: 123 }`
  - 📝 commit: `feat(api): setup elysia with prisma and health endpoint`

- [ ] 1.5 ตั้งค่า Next.js + Tailwind CSS + Ant Design + Axios + Zustand
  - 🧪 test: `bun run dev` → หน้าแรกแสดงผลได้ | `bun run build` → pass
  - 📝 commit: `feat(web): setup nextjs tailwind antd axios zustand`

- [ ] 1.6 ตั้งค่า Bun test สำหรับ API test
  - หมายเหตุ: แยก `src/app.ts` (สร้าง Elysia instance, ไม่เรียก `.listen()`) ออกจาก `src/index.ts` (เรียก `.listen()` จริง) เพื่อให้ test เรียก `app.handle(new Request(...))` ได้โดยไม่ bind port ซ้ำ
  - 🧪 test: `bun test --filter apps/api` → PASS tests/health.test.ts ✅
  - 📝 commit: `chore(api): setup bun test`

- [ ] 1.7 สร้าง `.dockerignore` (api + web)
  - 🧪 test: `docker build` → context ขนาดเล็ก (node_modules ไม่ถูก copy)
  - 📝 commit: `chore: add dockerignore`

- [ ] 1.8 ตั้งค่า ESLint + Prettier + lint-staged + Husky
  - 🧪 test: `bun run lint` → ไม่มี error | commit ไฟล์ที่มี `any` → hook บล็อก
  - 📝 commit: `chore: add eslint prettier lint-staged`

- [ ] 1.9 เพิ่ม Env Validation + Global Error Handler ใน API
  - 🧪 test: ไม่มี JWT_SECRET → crash พร้อม error ชัดเจน | validation error → 400 format ถูกต้อง
  - 📝 commit: `feat(api): env validation and global error handler`

- [ ] 1.10 ใช้ Elysia schema (`t.Object`) กับทุก route ที่รับ body/query
  - 🧪 test: POST body ขาด field required → 400 (Elysia validation error format)
  - 📝 commit: `feat(api): add elysia schema validation`

- [ ] 1.11 สร้าง Seed script (roles + admin user + ข้อมูลตัวอย่าง)
  - หมายเหตุ: seed ใช้ `upsert` ต้องมี `update: { field: value }` จริงๆ — ถ้าใช้ `update: {}` จะไม่ sync ค่าใหม่เมื่อ seed รันซ้ำ
  - 🧪 test: `bunx prisma db seed` → roles + users + ข้อมูลตัวอย่าง ✅ | รันซ้ำไม่ error (upsert)
  - 📝 commit: `chore(db): add seed script`

---

### Phase 2 — ระบบ Authentication & User Management

- [ ] 2.1 API: Login + ออก JWT (`POST /api/auth/login`) + seed admin user
  - 🧪 test: credentials ถูก → 200 + JWT | password ผิด → 401 | missing field → 400
  - 📝 commit: `feat(api): auth login with jwt`

- [ ] 2.2 API: Elysia plugin ตรวจสอบ JWT + Role Guard (`plugins/authGuard.ts`, `plugins/roleGuard.ts`)
  - หมายเหตุ: ใช้ `@elysiajs/jwt` + `.derive()` แนบ `user` เข้า context, `.macro()`/`.resolve()` สำหรับเช็ค role ก่อนเข้า handler
  - 🧪 test: ไม่มี token → 401 | token ผิด → 401 | role ไม่ถึง → 403
  - 📝 commit: `feat(api): auth plugin and role guard`

- [ ] 2.3 API: CRUD user + เปลี่ยน role + Soft Delete
  - 🧪 test: admin list/create/update/delete ✅ | manager/staff → 403 | duplicate email → 409 | DELETE sets deletedAt
  - 📝 commit: `feat(api): user management with soft delete`

- [ ] 2.4 Web: หน้า Login (form email/password → JWT → Zustand authStore)
  - หมายเหตุ: เก็บ JWT ใน localStorage ผ่าน Zustand persist (ไม่ใช่ httpOnly cookie เพื่อให้ Axios interceptor อ่านได้)
  - 🧪 test: login สำเร็จ → redirect dashboard | error state แสดง Alert
  - 📝 commit: `feat(web): login page with jwt`

- [ ] 2.5 Web: ป้องกัน route (redirect ถ้าไม่ได้ login)
  - หมายเหตุ: ใช้ `mounted` state เพื่อรอ Zustand rehydrate จาก localStorage ก่อน check token
  - 🧪 test: เปิด `/` โดยไม่มี token → redirect `/login` | refresh → ยังอยู่หน้าเดิม
  - 📝 commit: `feat(web): protected routes with auth guard`

- [ ] 2.6 Web: หน้าจัดการ User
  - 🧪 test: admin เห็นตาราง user | PermissionGuard menuKey="users" → non-admin 403 | เพิ่ม/แก้ไข/ลบผ่าน modal
  - 📝 commit: `feat(web): user management page`

- [ ] 2.7 Auto test: ครอบคลุม auth flow ทั้งหมด
  - 🧪 test: `bun test` → login, invalid token, role guard ผ่านทั้งหมด
  - 📝 commit: `test(api): auth and role guard tests`

- [ ] 2.8 DB + API: ระบบ Role Permission — กำหนดสิทธิ์ per role per menu
  - เพิ่ม model `RolePermission { roleId, menuKey, canView, canCreate, canUpdate, canDelete }`
  - Seed default permissions ตาม role เริ่มต้น
  - `GET /api/role-permissions` (admin) | `GET /api/role-permissions/:role` (auth) | `PUT .../:role/:menuKey` (admin)
  - 🧪 test: GET all (admin-only) | GET/:role (all auth) | PUT (admin-only + validation)
  - 📝 commit: `feat(api): role permission management`

- [ ] 2.9 Web: หน้าตั้งค่า Role Permission
  - ตาราง roles × menu — กดแถวเปิด Modal แก้ไข permission
  - 🧪 test: build pass | PermissionGuard menuKey="settings" → non-admin 403
  - 📝 commit: `feat(web): role permission settings page`

- [ ] 2.10 Web: ใช้ Role Permission จาก server ใน UI
  - หลัง login → `GET /api/role-permissions/:role` → เก็บใน `permissionStore` (Zustand, persist)
  - Sidebar render เฉพาะ menu ที่ `canView: true` | ปุ่มแสดงตาม canCreate/canUpdate/canDelete
  - Clear permissionStore ตอน logout
  - 🧪 test: build pass | เปลี่ยน permission ใน DB → menu/ปุ่มหาย-ปรากฏตาม config
  - 📝 commit: `feat(web): dynamic menu and action visibility from role permissions`

- [ ] 2.11 DB + API: สร้าง Role table แทน enum
  - ลบ `enum Role` + สร้าง `model Role { id, name, label, createdAt }`
  - ปรับ User/RolePermission ให้ใช้ `roleId Int` (FK)
  - migration: rename enum → insert roles → populate FK → drop enum
  - Repository flatten `role: { name }` → `role: string` ก่อน return
  - เพิ่ม `GET/POST/PUT/DELETE /api/roles`
  - 🧪 test: API tests ผ่านทั้งหมด | role: 'admin' ยังเป็น string เหมือนเดิมใน response
  - 📝 commit: `feat(api): role table replaces enum`

- [ ] 2.12 Web: ดึง Role list + label จาก API แทน hardcode
  - สร้าง `rolesStore` (Zustand) | ลบ `ROLE_LABELS` hardcode
  - `UserFormModal` select options ดึงจาก `rolesStore`
  - `useLogin` fetch roles + permissions พร้อมกัน (`Promise.all`) หลัง login
  - 🧪 test: build ผ่าน | เปลี่ยน label ใน DB → UI แสดงตาม
  - 📝 commit: `feat(web): role labels from api instead of hardcode`

- [ ] 2.13 Web: เปลี่ยน access control ทุกหน้าให้ใช้ `permissionStore` แทน `RoleGuard` hardcode
  - สร้าง `PermissionGuard` ที่ check `canView(menuKey)` จาก permissionStore (พร้อม mounted state)
  - แทน `<RoleGuard roles={[...]}>` ทุกหน้าด้วย `<PermissionGuard menuKey="...">`
  - 🧪 test: build ผ่าน | staff เข้า `/users` ไม่ได้ (403) | admin เข้าได้ทุกหน้า
  - 📝 commit: `feat(web): replace RoleGuard with PermissionGuard for all pages`

---

### Phase 3 — {{CORE_MODULE_NAME}}

- [ ] 3.1 API: CRUD {{resource}} + ค้นหา/filter + Soft Delete + isActive toggle
  - 🧪 test: POST/GET/PUT/DELETE `/api/{{resource}}` → ทำงานถูกต้อง | DELETE soft-delete | PATCH status toggle
  - 📝 commit: `feat(api): {{resource}} CRUD with soft delete and status toggle`

- [ ] 3.2 API: Upload รูปภาพ (multer) — ถ้ามี
  - 🧪 test: POST with image → ได้ URL รูปกลับมา
  - 📝 commit: `feat(api): {{resource}} image upload`

- [ ] 3.3 Web: หน้ารายการ (ค้นหา, filter, pagination, Tag สถานะ)
  - 🧪 test: แสดงรายการ, ค้นหาได้, Tag สถานะแสดงถูก
  - 📝 commit: `feat(web): {{resource}} list page`

- [ ] 3.4 Web: ฟอร์มเพิ่ม/แก้ไข (Modal) + Switch isActive ใน edit modal
  - 🧪 test: กรอกฟอร์ม → บันทึก → list อัปเดต | Switch toggle isActive ได้
  - 📝 commit: `feat(web): {{resource}} add/edit form`

- [ ] 3.5 Auto test: ครอบคลุม CRUD + filter + soft delete + status toggle
  - 🧪 test: `bun test` → ทุก case ผ่าน
  - 📝 commit: `test(api): {{resource}} CRUD tests`

- [ ] 3.6 Master Data — ข้อมูลอ้างอิง (DB → API → Web dropdown)
  - DB: tables `{{MasterType}}` + `{{MasterUnit}}` + seed ค่าเริ่มต้น + `isActive Boolean`
  - API: GET (default active only, `?status=all` สำหรับ admin) + CRUD + toggle status
  - Web: `masterStore` (Zustand, persist) — active-only | ใช้ใน dropdown ทั่วระบบ
  - 🧪 test: dropdown แสดงเฉพาะ active | master page CRUD + toggle ทำงานได้
  - 📝 commit: `feat: master data tables, api, and web integration`

---

### Phase N — ระบบรายงาน (Reports)

- [ ] N.1 API: รายงานสรุป
  - 🧪 test: GET `/api/reports/summary` → ข้อมูลถูกต้อง
  - 📝 commit: `feat(api): summary report`

- [ ] N.2 API: Export Excel (.xlsx)
  - 🧪 test: GET `?format=xlsx` → ดาวน์โหลด .xlsx ได้
  - 📝 commit: `feat(api): export excel`

- [ ] N.3 API: Export CSV
  - 🧪 test: GET `?format=csv` → ดาวน์โหลด .csv ได้
  - 📝 commit: `feat(api): export csv`

- [ ] N.4 Web: หน้ารายงาน (filter, ดูตาราง, ปุ่ม Export)
  - 🧪 test: filter → ข้อมูลถูกต้อง, กด Export → ไฟล์โหลดได้
  - 📝 commit: `feat(web): reports page with export`

---

### Phase Last — Dashboard & UI Polish

- [ ] L.1 Dashboard หน้าแรก (สรุปยอด, การ์ดสถิติ, รายการล่าสุด)
  - 🧪 test: เปิด dashboard → เห็นข้อมูลสรุปถูกต้อง
  - 📝 commit: `feat(web): dashboard summary`

- [ ] L.2 Responsive design — รองรับมือถือทุกหน้า (Dev Standard #13)
  - Sidebar → Drawer บน mobile (`!screens.md`)
  - ทุกตาราง `scroll={{ x: 'max-content' }}`
  - ปุ่ม toolbar ใช้ `<Space wrap>`
  - 🧪 test: Chrome DevTools iPhone SE (375px) → ทุกหน้าไม่แตก ใช้งานได้
  - 📝 commit: `feat(web): responsive layout`

- [ ] L.3 รวม test suite ทั้งหมด
  - 🧪 test: `bun test` root → ผ่านทุก test ใน monorepo
  - 📝 commit: `chore: unified test suite`

---

<!--
## วิธีใช้ Template นี้

1. Copy ไฟล์นี้เป็น CLAUDE.md ในโปรเจกต์ใหม่
2. แทนที่ placeholder ทั้งหมด:
   - {{PROJECT_NAME}}        → ชื่อระบบ
   - {{COMPANY_NAME}}        → ชื่อบริษัท
   - {{PROJECT_DESCRIPTION}} → คำอธิบายโปรเจกต์
   - {{PROJECT_FOLDER}}      → ชื่อ folder root
   - {{MODULE_N}}            → ชื่อระบบหลัก
   - {{FEATURES_N}}          → feature list
   - {{FUTURE_MODULE_N}}     → ระบบ phase ถัดไป
   - {{REASON_N}}            → เหตุผลที่เลื่อน
   - {{page_N}}              → หน้า dashboard (เช่น products, orders)
   - {{feature_N}}           → ชื่อ feature module
   - {{resource}}            → ชื่อ resource (เช่น products, orders)
   - {{CORE_MODULE_NAME}}    → ชื่อ Phase หลัก (เช่น ระบบสินค้า)
   - {{MasterType}}          → ชื่อ master type model (เช่น ProductTypeItem, Category)
   - {{MasterUnit}}          → ชื่อ master unit model (เช่น Unit)
   - {{MANAGER_PERMISSIONS}} → สิทธิ์ manager
   - {{STAFF_PERMISSIONS}}   → สิทธิ์ staff
3. อัปเดต Data Models ให้ตรงกับ schema ของระบบ
4. เพิ่ม/ลบ Phase ตาม feature ที่ต้องการ
5. Phase 1 และ Phase 2 (Setup + Auth + RBAC) ใช้ได้เกือบทุกโปรเจกต์ ไม่ต้องแก้มาก

## Lessons Learned จากโปรเจกต์ cpd-woodcore

### Ant Design + React 19
- **antd Menu**: ห้ามใส่ custom prop (เช่น menuKey) ใน item objects ที่ส่งให้ `items={}` เพราะ antd forward ลง DOM → React warning
  - แก้: destructure prop ออกก่อน map: `const { menuKey: _mk, ...rest } = item`
- **antd Image / Card / Result**: มี type conflict กับ React 19 types — ใช้ plain `<img>`, `<div>`, `Typography` แทน
- **antd Tag ใน table render**: เกิด CSS-in-JS warning เมื่อใช้ `<Tag>` ซ้ำๆ ใน render function — ใช้ `<span style={{ ... }}>` inline แทน
- **App.useApp()**: ต้องเรียกใน inner component ที่อยู่ใต้ `<App>` — ห้ามเรียกใน component เดียวกับที่ render `<App>`
- **useForm() per component**: ถ้ามีหลาย mode แต่ render แค่ mode เดียว ต้องแยก component — ไม่เช่นนั้น "useForm not connected" warning

### Zustand
- **Zustand persist + AuthGuard/PermissionGuard**: ต้องใช้ `mounted` state เพื่อรอ rehydrate ก่อน check token/permission — ถ้าไม่รอจะ flash redirect ผิดหน้า
- **useLogin ต้อง fetch ทุกอย่างพร้อมกัน**: ใช้ `Promise.all` ดึง permissions + roles + master data พร้อมกัน ทันทีหลัง login — ถ้าดึงแยกจะมี waterfall หรือ store ยังไม่พร้อมตอน render หน้าแรก

### Prisma + Database
- **Prisma `@updatedAt` บน existing table**: `db push` ล้มเหลวเพราะไม่มี DEFAULT — ต้องรัน `prisma db execute --file migration.sql` (ที่มี `DEFAULT CURRENT_TIMESTAMP`) ก่อน แล้วค่อย `db push`
- **`prisma generate` EPERM บน Windows**: เกิดเมื่อ node.exe กำลัง lock `.dll.node` file อยู่ — แก้: `taskkill /F /IM node.exe` แล้วรัน generate ใหม่
- **`findById` + Soft Delete ต้องใช้ `findFirst`**: `findUnique` รับแค่ unique fields ใน where — ถ้าต้องใส่ `deletedAt: null` ด้วย ต้องใช้ `findFirst({ where: { id, deletedAt: null } })`
- **Seed `upsert` ต้องมี `update` จริงๆ**: `update: {}` จะไม่ sync ค่าใหม่ — ต้องใส่ field ที่ต้องการ update: `update: { canView: perm.canView, ... }`
- **PostgreSQL + Prisma rename enum → table**: ต้อง `ALTER TYPE "Role" RENAME TO "RoleOld"` ก่อน `CREATE TABLE "Role"` — ไม่เช่นนั้น name conflict
- **Stale enum imports**: หลัง remove enum จาก schema ให้ `grep` หา import ทันที — TypeScript อาจไม่แจ้ง error ถ้า enum ถูก import แต่ไม่ได้ใช้ค่า แต่จะ runtime error

### Frontend Architecture
- **PermissionGuard vs RoleGuard**: ใช้ `<PermissionGuard menuKey="...">` เสมอ — ห้าม hardcode role name ใน component (`roles={['admin']}`)
- **isActive vs deletedAt**: isActive = toggle enable/disable (ยังแสดงใน admin view, filter ได้) | deletedAt = soft delete (ซ่อนทุกที่, ถือว่าไม่มีอยู่)
- **action column ต้องมี title**: ใช้ `title: 'จัดการ'` เสมอ — ถ้าใช้ `title: ''` header cell จะหายทำให้ layout ดูไม่สมดุล

### Dev Tools
- **eslint-config-next**: ดึง ESLint 10 ซึ่ง conflict กับ v8 — ใช้ `@typescript-eslint` โดยตรงแทน
- **Zod 3.25+**: param เปลี่ยนจาก `required_error` เป็น `error` → ใช้ `{ error: 'Required' }` แทน `{ required_error: 'Required' }`
- **Windows + Next.js build**: EPERM บน `.next/trace` เกิดจาก VS Code TypeScript server lock file — ใช้ `npx tsc --noEmit` แทน build เพื่อตรวจ type errors
-->
