-- CreateTable
CREATE TABLE "platform_apps" (
    "id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "platform" "Platform" NOT NULL,
    "client_id" TEXT NOT NULL,
    "client_secret_enc" TEXT NOT NULL,
    "options" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "platform_apps_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "platform_apps_workspace_id_platform_key" ON "platform_apps"("workspace_id", "platform");

-- AddForeignKey
ALTER TABLE "platform_apps" ADD CONSTRAINT "platform_apps_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;
