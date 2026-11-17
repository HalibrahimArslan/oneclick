-- AlterTable
ALTER TABLE "post_targets" ADD COLUMN     "last_metrics" JSONB,
ADD COLUMN     "metrics_at" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "post_targets_published_at_idx" ON "post_targets"("published_at");
