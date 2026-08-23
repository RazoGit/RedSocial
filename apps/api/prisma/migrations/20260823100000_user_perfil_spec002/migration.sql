-- Spec 002: campos de perfil publico en users + historial de usernames

-- AlterTable
ALTER TABLE "users" ADD COLUMN "username" CITEXT,
ADD COLUMN "display_name" TEXT,
ADD COLUMN "bio" TEXT,
ADD COLUMN "avatar_key" TEXT,
ADD COLUMN "avatar_thumb_key" TEXT,
ADD COLUMN "avatar_blurhash" TEXT,
ADD COLUMN "is_private" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "username_changed_at" TIMESTAMPTZ(3);

-- CreateTable
CREATE TABLE "username_history" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "username" CITEXT NOT NULL,
    "released_at" TIMESTAMPTZ(3) NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "username_history_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_username_key" ON "users"("username");
CREATE INDEX "username_history_username_released_at_idx" ON "username_history"("username", "released_at");
CREATE INDEX "username_history_user_id_idx" ON "username_history"("user_id");

-- AddForeignKey
ALTER TABLE "username_history" ADD CONSTRAINT "username_history_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
