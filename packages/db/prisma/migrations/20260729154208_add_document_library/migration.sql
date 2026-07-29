-- DropIndex
DROP INDEX "DocumentChunk_embedding_hnsw_idx";

-- CreateTable
CREATE TABLE "Document" (
    "id" SERIAL NOT NULL,
    "lawCode" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "docType" TEXT NOT NULL,
    "citationCode" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Document_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DocumentVersion" (
    "id" SERIAL NOT NULL,
    "documentId" INTEGER NOT NULL,
    "versionLabel" TEXT NOT NULL,
    "externalId" TEXT,
    "sourceUrl" TEXT,
    "effectiveFrom" TIMESTAMP(3),
    "isLatest" BOOLEAN NOT NULL DEFAULT false,
    "contentHash" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DocumentVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Passage" (
    "id" SERIAL NOT NULL,
    "versionId" INTEGER NOT NULL,
    "ordinal" INTEGER NOT NULL,
    "sectionType" TEXT NOT NULL,
    "sectionNumber" TEXT,
    "parentId" INTEGER,
    "content" TEXT NOT NULL,
    "contentHash" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Passage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Document_lawCode_key" ON "Document"("lawCode");

-- CreateIndex
CREATE INDEX "Document_docType_idx" ON "Document"("docType");

-- CreateIndex
CREATE INDEX "DocumentVersion_documentId_isLatest_idx" ON "DocumentVersion"("documentId", "isLatest");

-- CreateIndex
CREATE UNIQUE INDEX "DocumentVersion_documentId_versionLabel_key" ON "DocumentVersion"("documentId", "versionLabel");

-- CreateIndex
CREATE INDEX "Passage_versionId_idx" ON "Passage"("versionId");

-- CreateIndex
CREATE INDEX "Passage_versionId_parentId_idx" ON "Passage"("versionId", "parentId");

-- CreateIndex
CREATE UNIQUE INDEX "Passage_versionId_ordinal_key" ON "Passage"("versionId", "ordinal");

-- AddForeignKey
ALTER TABLE "DocumentVersion" ADD CONSTRAINT "DocumentVersion_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "Document"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Passage" ADD CONSTRAINT "Passage_versionId_fkey" FOREIGN KEY ("versionId") REFERENCES "DocumentVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Passage" ADD CONSTRAINT "Passage_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "Passage"("id") ON DELETE SET NULL ON UPDATE CASCADE;
