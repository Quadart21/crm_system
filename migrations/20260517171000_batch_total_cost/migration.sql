ALTER TABLE "Batch" ADD COLUMN "totalBatchCost" REAL NOT NULL DEFAULT 0;

UPDATE "Batch"
SET "totalBatchCost" = "costPerGram" * "weight"
WHERE "totalBatchCost" = 0 AND "costPerGram" > 0 AND "weight" > 0;
