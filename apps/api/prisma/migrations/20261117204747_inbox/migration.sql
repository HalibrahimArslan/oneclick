-- AlterTable
ALTER TABLE "conversations" ADD COLUMN     "context" JSONB;

-- AlterTable
ALTER TABLE "messages" ADD COLUMN     "hidden" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "sent_by_id" UUID;

-- AddForeignKey
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_assignee_id_fkey" FOREIGN KEY ("assignee_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "messages" ADD CONSTRAINT "messages_sent_by_id_fkey" FOREIGN KEY ("sent_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
