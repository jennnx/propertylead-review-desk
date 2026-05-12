-- CreateEnum
CREATE TYPE "SopDocumentProcessingStatus" AS ENUM ('processing', 'ready', 'failed');

-- CreateTable
CREATE TABLE "sop_documents" (
    "id" TEXT NOT NULL,
    "originalFilename" TEXT NOT NULL,
    "contentType" TEXT NOT NULL,
    "byteSize" INTEGER NOT NULL,
    "storagePath" TEXT NOT NULL,
    "uploadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processingStatus" "SopDocumentProcessingStatus" NOT NULL DEFAULT 'processing',
    "failureMessage" TEXT,

    CONSTRAINT "sop_documents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sop_chunks" (
    "id" TEXT NOT NULL,
    "sopDocumentId" TEXT NOT NULL,
    "ordinal" INTEGER NOT NULL,
    "text" TEXT NOT NULL,
    "embedding" vector(1024) NOT NULL,

    CONSTRAINT "sop_chunks_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "sop_documents_processingStatus_uploadedAt_idx" ON "sop_documents"("processingStatus", "uploadedAt");

-- CreateIndex
CREATE UNIQUE INDEX "sop_chunks_sopDocumentId_ordinal_key" ON "sop_chunks"("sopDocumentId", "ordinal");

-- CreateIndex
CREATE INDEX "sop_chunks_embedding_hnsw_idx" ON "sop_chunks" USING hnsw ("embedding" vector_cosine_ops);

-- AddForeignKey
ALTER TABLE "sop_chunks" ADD CONSTRAINT "sop_chunks_sopDocumentId_fkey" FOREIGN KEY ("sopDocumentId") REFERENCES "sop_documents"("id") ON DELETE CASCADE ON UPDATE CASCADE;
