import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function run() {
  console.log("=== Chat Evolution Migration ===\n");

  // 1a. Create enum ChatChannelType
  console.log("1a. Creating enum chat.channel_type...");
  try {
    await prisma.$executeRawUnsafe(`
      DO $$ BEGIN
        CREATE TYPE chat.channel_type AS ENUM ('INSTALLATION', 'GROUP');
      EXCEPTION WHEN duplicate_object THEN
        NULL;
      END $$;
    `);
    console.log("   ✓ Done");
  } catch (e: any) {
    console.log("   ⚠ " + e.message);
  }

  // 1b. Alter chat.channels — add channelType, groupId, make installationId nullable
  console.log("1b. Altering chat.channels...");
  try {
    // Add channel_type column
    await prisma.$executeRawUnsafe(`
      ALTER TABLE chat.channels
        ADD COLUMN IF NOT EXISTS channel_type chat.channel_type NOT NULL DEFAULT 'INSTALLATION';
    `);
    console.log("   ✓ channel_type added");
  } catch (e: any) {
    console.log("   ⚠ channel_type: " + e.message);
  }

  try {
    // Add group_id column
    await prisma.$executeRawUnsafe(`
      ALTER TABLE chat.channels
        ADD COLUMN IF NOT EXISTS group_id TEXT;
    `);
    console.log("   ✓ group_id added");
  } catch (e: any) {
    console.log("   ⚠ group_id: " + e.message);
  }

  try {
    // Make installation_id nullable
    await prisma.$executeRawUnsafe(`
      ALTER TABLE chat.channels
        ALTER COLUMN installation_id DROP NOT NULL;
    `);
    console.log("   ✓ installation_id now nullable");
  } catch (e: any) {
    console.log("   ⚠ installation_id: " + e.message);
  }

  try {
    // Create unique index on group_id (partial, where not null)
    await prisma.$executeRawUnsafe(`
      CREATE UNIQUE INDEX IF NOT EXISTS uq_chat_channels_group
        ON chat.channels (group_id) WHERE group_id IS NOT NULL;
    `);
    console.log("   ✓ uq_chat_channels_group index created");
  } catch (e: any) {
    console.log("   ⚠ group index: " + e.message);
  }

  try {
    // Create index for tenant+type filtering
    await prisma.$executeRawUnsafe(`
      CREATE INDEX IF NOT EXISTS idx_chat_channels_tenant_type
        ON chat.channels (tenant_id, channel_type);
    `);
    console.log("   ✓ idx_chat_channels_tenant_type created");
  } catch (e: any) {
    console.log("   ⚠ tenant_type index: " + e.message);
  }

  try {
    await prisma.$executeRawUnsafe(`
      CREATE INDEX IF NOT EXISTS idx_chat_channels_group
        ON chat.channels (group_id);
    `);
    console.log("   ✓ idx_chat_channels_group created");
  } catch (e: any) {
    console.log("   ⚠ group index: " + e.message);
  }

  // 1c. Alter chat.messages — thread support
  console.log("1c. Altering chat.messages for threads...");
  try {
    await prisma.$executeRawUnsafe(`
      ALTER TABLE chat.messages
        ADD COLUMN IF NOT EXISTS thread_root_id UUID REFERENCES chat.messages(id) ON DELETE CASCADE,
        ADD COLUMN IF NOT EXISTS reply_count INT NOT NULL DEFAULT 0,
        ADD COLUMN IF NOT EXISTS last_reply_at TIMESTAMPTZ;
    `);
    console.log("   ✓ thread columns added");
  } catch (e: any) {
    console.log("   ⚠ thread columns: " + e.message);
  }

  try {
    await prisma.$executeRawUnsafe(`
      CREATE INDEX IF NOT EXISTS idx_chat_messages_thread_root
        ON chat.messages (thread_root_id, created_at);
    `);
    console.log("   ✓ idx_chat_messages_thread_root created");
  } catch (e: any) {
    console.log("   ⚠ thread index: " + e.message);
  }

  // 1d. Create chat.mentions table
  console.log("1d. Creating chat.mentions table...");
  try {
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS chat.mentions (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        tenant_id TEXT NOT NULL,
        message_id UUID NOT NULL REFERENCES chat.messages(id) ON DELETE CASCADE,
        mention_type TEXT NOT NULL,
        mentioned_user_id TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);
    console.log("   ✓ chat.mentions created");
  } catch (e: any) {
    console.log("   ⚠ mentions table: " + e.message);
  }

  try {
    await prisma.$executeRawUnsafe(`
      CREATE INDEX IF NOT EXISTS idx_chat_mentions_message ON chat.mentions (message_id);
      CREATE INDEX IF NOT EXISTS idx_chat_mentions_user ON chat.mentions (mentioned_user_id, created_at DESC);
    `);
    console.log("   ✓ mentions indexes created");
  } catch (e: any) {
    console.log("   ⚠ mentions indexes: " + e.message);
  }

  // 1e. Create chat.notification_preferences table
  console.log("1e. Creating chat.notification_preferences table...");
  try {
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS chat.notification_preferences (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        tenant_id TEXT NOT NULL,
        channel_id UUID NOT NULL REFERENCES chat.channels(id) ON DELETE CASCADE,
        user_type TEXT NOT NULL,
        user_id TEXT NOT NULL,
        preference TEXT NOT NULL DEFAULT 'ALL',
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        UNIQUE (channel_id, user_type, user_id)
      );
    `);
    console.log("   ✓ chat.notification_preferences created");
  } catch (e: any) {
    console.log("   ⚠ notification_preferences table: " + e.message);
  }

  try {
    await prisma.$executeRawUnsafe(`
      CREATE INDEX IF NOT EXISTS idx_chat_notif_prefs_user
        ON chat.notification_preferences (user_id, user_type);
    `);
    console.log("   ✓ notification_preferences index created");
  } catch (e: any) {
    console.log("   ⚠ notif prefs index: " + e.message);
  }

  console.log("\n=== Migration complete ===");
  await prisma.$disconnect();
}

run().catch((e) => {
  console.error("FATAL:", e);
  process.exit(1);
});
