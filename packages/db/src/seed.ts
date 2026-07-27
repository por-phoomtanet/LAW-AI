import { prisma } from "./index";

async function main() {
  // Roles — upsert ต้องมี update: { field: value } จริงๆ ไม่ใช่ update: {}
  // ไม่งั้นรันซ้ำจะไม่ sync ค่า label ใหม่เข้าไป
  const roles = [
    { name: "admin", label: "ผู้ดูแลระบบ" },
    { name: "researcher", label: "นักวิจัย/ทนายความ" },
    { name: "subscriber", label: "ผู้ใช้งานทั่วไป" },
  ];

  for (const role of roles) {
    await prisma.role.upsert({
      where: { name: role.name },
      create: role,
      update: { label: role.label },
    });
  }

  const adminRole = await prisma.role.findUniqueOrThrow({ where: { name: "admin" } });
  const researcherRole = await prisma.role.findUniqueOrThrow({ where: { name: "researcher" } });
  const subscriberRole = await prisma.role.findUniqueOrThrow({ where: { name: "subscriber" } });

  // Default permissions per role per menu — เมนู settings (role permission management)
  // ให้เฉพาะ admin, users management ให้เฉพาะ admin, chat/library ให้ทุก role ที่ login แล้ว
  type PermissionRow = {
    roleId: number;
    menuKey: string;
    canView: boolean;
    canCreate?: boolean;
    canUpdate?: boolean;
    canDelete?: boolean;
  };

  const permissions: PermissionRow[] = [
    { roleId: adminRole.id, menuKey: "chat", canView: true },
    {
      roleId: adminRole.id,
      menuKey: "library",
      canView: true,
      canCreate: true,
      canUpdate: true,
      canDelete: true,
    },
    {
      roleId: adminRole.id,
      menuKey: "users",
      canView: true,
      canCreate: true,
      canUpdate: true,
      canDelete: true,
    },
    {
      roleId: adminRole.id,
      menuKey: "settings",
      canView: true,
      canCreate: true,
      canUpdate: true,
      canDelete: true,
    },
    { roleId: researcherRole.id, menuKey: "chat", canView: true },
    { roleId: researcherRole.id, menuKey: "library", canView: true },
    { roleId: subscriberRole.id, menuKey: "chat", canView: true },
    { roleId: subscriberRole.id, menuKey: "library", canView: true },
  ];

  for (const permission of permissions) {
    await prisma.rolePermission.upsert({
      where: { roleId_menuKey: { roleId: permission.roleId, menuKey: permission.menuKey } },
      create: {
        roleId: permission.roleId,
        menuKey: permission.menuKey,
        canView: permission.canView,
        canCreate: permission.canCreate ?? false,
        canUpdate: permission.canUpdate ?? false,
        canDelete: permission.canDelete ?? false,
      },
      update: {
        canView: permission.canView,
        canCreate: permission.canCreate ?? false,
        canUpdate: permission.canUpdate ?? false,
        canDelete: permission.canDelete ?? false,
      },
    });
  }

  const adminEmail = process.env.SEED_ADMIN_EMAIL ?? "admin@law-ai.local";
  const adminPassword = process.env.SEED_ADMIN_PASSWORD ?? "ChangeMe123!";
  const passwordHash = await Bun.password.hash(adminPassword, { algorithm: "bcrypt" });

  await prisma.user.upsert({
    where: { email: adminEmail },
    create: {
      name: "System Admin",
      email: adminEmail,
      passwordHash,
      roleId: adminRole.id,
    },
    update: {
      passwordHash,
      roleId: adminRole.id,
      isActive: true,
    },
  });

  // เอกสารกฎหมายตัวอย่าง — สำหรับทดสอบ schema/relation เท่านั้น ไม่ใช่ ingestion จริง
  // ข้อมูลจริงจาก Open Law Data Thailand มาจาก ingestion pipeline ใน Phase 3
  const sampleDocuments = [
    {
      type: "statute",
      title: "ประมวลกฎหมายแพ่งและพาณิชย์ มาตรา 420",
      citationCode: "มาตรา 420 ป.พ.พ.",
      content:
        "ผู้ใดจงใจหรือประมาทเลินเล่อ ทำต่อบุคคลอื่นโดยผิดกฎหมายให้เขาเสียหายถึงแก่ชีวิตก็ดี แก่ร่างกายก็ดี อนามัยก็ดี เสรีภาพก็ดี ทรัพย์สินหรือสิทธิอย่างหนึ่งอย่างใดก็ดี ท่านว่าผู้นั้นทำละเมิด จำต้องใช้ค่าสินไหมทดแทนเพื่อการนั้น",
    },
    {
      type: "statute",
      title: "ประมวลกฎหมายอาญา มาตรา 288",
      citationCode: "มาตรา 288 ป.อ.",
      content:
        "ผู้ใดฆ่าผู้อื่น ต้องระวางโทษประหารชีวิต จำคุกตลอดชีวิต หรือจำคุกตั้งแต่สิบห้าปีถึงยี่สิบปี",
    },
    {
      type: "regulation",
      title: "พระราชบัญญัติคุ้มครองข้อมูลส่วนบุคคล พ.ศ. 2562 มาตรา 4",
      citationCode: "มาตรา 4 พ.ร.บ.คุ้มครองข้อมูลส่วนบุคคล",
      content:
        "พระราชบัญญัตินี้ไม่ใช้บังคับแก่การเก็บรวบรวม ใช้ หรือเปิดเผยข้อมูลส่วนบุคคลของบุคคลที่ทำการเก็บรวบรวมข้อมูลเพื่อประโยชน์ส่วนตนหรือเพื่อกิจกรรมในครอบครัวของบุคคลนั้นเท่านั้น",
    },
  ];

  for (const doc of sampleDocuments) {
    let document = await prisma.legalDocument.findFirst({
      where: { citationCode: doc.citationCode },
    });

    if (!document) {
      document = await prisma.legalDocument.create({
        data: {
          type: doc.type,
          title: doc.title,
          citationCode: doc.citationCode,
          isActive: true,
        },
      });
    }

    const contentHash = new Bun.CryptoHasher("sha256").update(doc.content).digest("hex");

    // embedding เป็น Unsupported("vector(1536)") — Prisma Client ไม่มี field นี้ใน
    // create/update type ต้อง insert ผ่าน raw SQL เท่านั้น
    // หมายเหตุ: นี่คือ placeholder vector (ศูนย์ทั้งหมด) ไม่ใช่ embedding จริงจาก OpenAI
    const placeholderVector = `[${Array.from({ length: 1536 }, () => 0).join(",")}]`;

    await prisma.$executeRaw`
      INSERT INTO "DocumentChunk" ("documentId", "content", "chunkIndex", "contentHash", "embedding")
      VALUES (${document.id}, ${doc.content}, 0, ${contentHash}, ${placeholderVector}::vector)
      ON CONFLICT ("documentId", "chunkIndex")
      DO UPDATE SET "content" = EXCLUDED."content", "contentHash" = EXCLUDED."contentHash"
    `;
  }

  console.log("Seed completed:");
  console.log(`  roles: ${roles.length}`);
  console.log(`  role permissions: ${permissions.length}`);
  console.log(`  admin user: ${adminEmail}`);
  console.log(`  sample documents: ${sampleDocuments.length}`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
