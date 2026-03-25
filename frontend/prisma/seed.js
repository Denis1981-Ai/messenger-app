/* eslint-disable @typescript-eslint/no-require-imports */
const { PrismaClient, ChatType } = require("@prisma/client");
const { randomBytes, scryptSync } = require("node:crypto");

if (process.env.ALLOW_DEV_SEED !== "true") {
  console.error("Seed is blocked. This command wipes data and is allowed only for explicit dev/test bootstrap with ALLOW_DEV_SEED=true.");
  process.exit(1);
}

const prisma = new PrismaClient();

const hashPassword = (password) => {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(password, salt, 64).toString("hex");
  return `${salt}:${hash}`;
};

async function main() {
  await prisma.session.deleteMany();
  await prisma.attachment.deleteMany();
  await prisma.message.deleteMany();
  await prisma.chatMember.deleteMany();
  await prisma.chat.deleteMany();
  await prisma.user.deleteMany();

  const users = await prisma.$transaction([
    prisma.user.create({
      data: {
        name: "Денис",
        login: "denis",
        passwordHash: hashPassword("password123"),
      },
    }),
    prisma.user.create({
      data: {
        name: "Иван",
        login: "ivan",
        passwordHash: hashPassword("password123"),
      },
    }),
    prisma.user.create({
      data: {
        name: "Марина",
        login: "marina",
        passwordHash: hashPassword("password123"),
      },
    }),
  ]);

  const [denis, ivan, marina] = users;

  const directChat = await prisma.chat.create({
    data: {
      chatType: ChatType.DIRECT,
      directKey: [denis.id, ivan.id].sort().join(":"),
      createdByUserId: denis.id,
      members: {
        createMany: {
          data: [{ userId: denis.id }, { userId: ivan.id }],
        },
      },
    },
  });

  const groupChat = await prisma.chat.create({
    data: {
      title: "Общий чат",
      chatType: ChatType.GROUP,
      createdByUserId: denis.id,
      members: {
        createMany: {
          data: [{ userId: denis.id }, { userId: ivan.id }, { userId: marina.id }],
        },
      },
    },
  });

  const firstMessage = await prisma.message.create({
    data: {
      chatId: directChat.id,
      authorId: ivan.id,
      text: "Привет! Это тестовый direct chat.",
    },
  });

  await prisma.message.create({
    data: {
      chatId: directChat.id,
      authorId: denis.id,
      text: "Привет, Иван. Проверяем text pilot.",
      replyToMessageId: firstMessage.id,
    },
  });

  await prisma.message.createMany({
    data: [
      {
        chatId: groupChat.id,
        authorId: denis.id,
        text: "Добро пожаловать в общий чат.",
      },
      {
        chatId: groupChat.id,
        authorId: marina.id,
        text: "Готова к проверке этапа 1.",
      },
    ],
  });
}

main()
  .catch(async (error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
