-- CreateTable
CREATE TABLE "AiModel" (
    "id" SERIAL NOT NULL,
    "modelId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AiModel_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AiModel_modelId_key" ON "AiModel"("modelId");

-- CreateIndex
CREATE INDEX "AiModel_isActive_sortOrder_idx" ON "AiModel"("isActive", "sortOrder");
