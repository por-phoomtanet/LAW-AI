import { describe, expect, test, beforeAll } from "bun:test";
import { app } from "../src/app";

async function login(email: string, password: string): Promise<string> {
  const response = await app.handle(
    new Request("http://localhost/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    }),
  );
  const body = await response.json();
  return body.data.token as string;
}

function authedRequest(path: string, token: string) {
  return app.handle(
    new Request(`http://localhost${path}`, {
      headers: { Authorization: `Bearer ${token}` },
    }),
  );
}

describe("Document browse API (Phase 4.3)", () => {
  let token: string;

  beforeAll(async () => {
    token = await login(
      process.env.SEED_ADMIN_EMAIL ?? "admin@law-ai.local",
      process.env.SEED_ADMIN_PASSWORD ?? "ChangeMe123!",
    );
  });

  test("no token → 401", async () => {
    const response = await app.handle(new Request("http://localhost/api/documents"));
    expect(response.status).toBe(401);
  });

  test("list returns category counts and documents", async () => {
    const response = await authedRequest("/api/documents", token);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.data.categories).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ category: "primary", label: "กฎหมายหลัก" }),
        expect.objectContaining({ category: "subordinate", label: "กฎหมายลำดับรอง" }),
      ]),
    );
    expect(Array.isArray(body.data.docTypes)).toBe(true);
    expect(Array.isArray(body.data.documents)).toBe(true);
    expect(body.data.documents.length).toBeGreaterThan(0);
  });

  test("list filtered by docType only returns matching documents", async () => {
    const response = await authedRequest("/api/documents?docType=พระราชบัญญัติ", token);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.data.documents.length).toBeGreaterThan(0);
    expect(
      body.data.documents.every((d: { docType: string }) => d.docType === "พระราชบัญญัติ"),
    ).toBe(true);
  });

  test("get detail returns nested TOC tree for a document with chapters", async () => {
    const listResponse = await authedRequest("/api/documents?docType=พระราชบัญญัติ", token);
    const listBody = await listResponse.json();
    const target = listBody.data.documents[0];

    const response = await authedRequest(`/api/documents/${target.id}`, token);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.data.id).toBe(target.id);
    expect(body.data.version).toBeDefined();
    expect(Array.isArray(body.data.toc)).toBe(true);
    expect(body.data.toc.length).toBeGreaterThan(0);
    // ทุก node ต้องมี children array (แม้จะว่าง) ไม่ใช่ undefined
    expect(body.data.toc.every((node: { children: unknown }) => Array.isArray(node.children))).toBe(
      true,
    );
  });

  test("get detail for nonexistent id → 404", async () => {
    const response = await authedRequest("/api/documents/999999999", token);
    expect(response.status).toBe(404);
  });

  test("get detail includes versions list, and requesting a specific versionId returns that version", async () => {
    const listResponse = await authedRequest("/api/documents?docType=พระราชบัญญัติ", token);
    const listBody = await listResponse.json();
    const target = listBody.data.documents[0];

    const defaultResponse = await authedRequest(`/api/documents/${target.id}`, token);
    const defaultBody = await defaultResponse.json();

    expect(Array.isArray(defaultBody.data.versions)).toBe(true);
    expect(defaultBody.data.versions.length).toBeGreaterThan(0);
    // ไม่ระบุ versionId → ต้องได้เวอร์ชันที่ isLatest=true
    const latestMeta = defaultBody.data.versions.find((v: { isLatest: boolean }) => v.isLatest);
    expect(defaultBody.data.version.id).toBe(latestMeta.id);

    // ระบุ versionId ตรงๆ (เอาตัวแรกในลิสต์ ไม่ว่าจะเป็นเวอร์ชันไหน) → ต้องได้เวอร์ชันนั้นกลับมาจริง
    const someVersionId = defaultBody.data.versions[0].id;
    const specificResponse = await authedRequest(
      `/api/documents/${target.id}?versionId=${someVersionId}`,
      token,
    );
    const specificBody = await specificResponse.json();
    expect(specificResponse.status).toBe(200);
    expect(specificBody.data.version.id).toBe(someVersionId);
  });

  test("get detail with versionId belonging to a different document → 404", async () => {
    const listResponse = await authedRequest("/api/documents?docType=พระราชบัญญัติ", token);
    const listBody = await listResponse.json();
    const [docA, docB] = listBody.data.documents;

    const docBDetail = await (await authedRequest(`/api/documents/${docB.id}`, token)).json();
    const foreignVersionId = docBDetail.data.version.id;

    const response = await authedRequest(
      `/api/documents/${docA.id}?versionId=${foreignVersionId}`,
      token,
    );
    expect(response.status).toBe(404);
  });
});
