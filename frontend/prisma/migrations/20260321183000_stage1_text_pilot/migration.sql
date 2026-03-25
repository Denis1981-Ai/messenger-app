CREATE TYPE "ChatType" AS ENUM ('DIRECT', 'GROUP');

CREATE TABLE "users" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "login" TEXT NOT NULL,
  "password_hash" TEXT NOT NULL,
  "is_active" BOOLEAN NOT NULL DEFAULT true,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "chats" (
  "id" TEXT NOT NULL,
  "title" TEXT,
  "chat_type" "ChatType" NOT NULL DEFAULT 'DIRECT',
  "direct_key" TEXT,
  "created_by_user_id" TEXT NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "chats_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "chat_members" (
  "chat_id" TEXT NOT NULL,
  "user_id" TEXT NOT NULL,
  "joined_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "chat_members_pkey" PRIMARY KEY ("chat_id","user_id")
);

CREATE TABLE "messages" (
  "id" TEXT NOT NULL,
  "chat_id" TEXT NOT NULL,
  "author_id" TEXT NOT NULL,
  "text" TEXT NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "edited_at" TIMESTAMP(3),
  "reply_to_message_id" TEXT,
  CONSTRAINT "messages_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "sessions" (
  "id" TEXT NOT NULL,
  "user_id" TEXT NOT NULL,
  "expires_at" TIMESTAMP(3) NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "sessions_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "users_login_key" ON "users"("login");
CREATE UNIQUE INDEX "chats_direct_key_key" ON "chats"("direct_key");
CREATE INDEX "chats_created_at_idx" ON "chats"("created_at");
CREATE INDEX "chats_created_by_user_id_idx" ON "chats"("created_by_user_id");
CREATE INDEX "chat_members_user_id_idx" ON "chat_members"("user_id");
CREATE INDEX "messages_chat_id_created_at_idx" ON "messages"("chat_id", "created_at");
CREATE INDEX "messages_author_id_idx" ON "messages"("author_id");
CREATE INDEX "messages_reply_to_message_id_idx" ON "messages"("reply_to_message_id");
CREATE INDEX "sessions_user_id_idx" ON "sessions"("user_id");
CREATE INDEX "sessions_expires_at_idx" ON "sessions"("expires_at");

ALTER TABLE "chats"
  ADD CONSTRAINT "chats_created_by_user_id_fkey"
  FOREIGN KEY ("created_by_user_id")
  REFERENCES "users"("id")
  ON DELETE RESTRICT
  ON UPDATE CASCADE;

ALTER TABLE "chat_members"
  ADD CONSTRAINT "chat_members_chat_id_fkey"
  FOREIGN KEY ("chat_id")
  REFERENCES "chats"("id")
  ON DELETE CASCADE
  ON UPDATE CASCADE;

ALTER TABLE "chat_members"
  ADD CONSTRAINT "chat_members_user_id_fkey"
  FOREIGN KEY ("user_id")
  REFERENCES "users"("id")
  ON DELETE CASCADE
  ON UPDATE CASCADE;

ALTER TABLE "messages"
  ADD CONSTRAINT "messages_chat_id_fkey"
  FOREIGN KEY ("chat_id")
  REFERENCES "chats"("id")
  ON DELETE CASCADE
  ON UPDATE CASCADE;

ALTER TABLE "messages"
  ADD CONSTRAINT "messages_author_id_fkey"
  FOREIGN KEY ("author_id")
  REFERENCES "users"("id")
  ON DELETE RESTRICT
  ON UPDATE CASCADE;

ALTER TABLE "messages"
  ADD CONSTRAINT "messages_reply_to_message_id_fkey"
  FOREIGN KEY ("reply_to_message_id")
  REFERENCES "messages"("id")
  ON DELETE SET NULL
  ON UPDATE CASCADE;

ALTER TABLE "sessions"
  ADD CONSTRAINT "sessions_user_id_fkey"
  FOREIGN KEY ("user_id")
  REFERENCES "users"("id")
  ON DELETE CASCADE
  ON UPDATE CASCADE;
