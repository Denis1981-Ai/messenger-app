import { NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";
import { resolveChatTitle, toClientChatMember } from "@/lib/server/chat-access";
import { getLastMessagePreviewText } from "@/lib/server/message-serialization";
import { badRequest, internalServerError, logServerError, unauthorized } from "@/lib/server/response";
import { getCurrentSessionUser } from "@/lib/server/session";
import { resolveUserDisplayName } from "@/lib/server/user-display";

export const runtime = "nodejs";

type CreateChatBody = {
  title?: string;
  memberIds?: string[];
};

type ChatListQueryResult = {
  id: string;
  title: string | null;
  chatType: "DIRECT" | "GROUP";
  createdAt: Date;
  members: Array<{
    userId: string;
    lastReadAt?: Date | null;
    user: {
      id: string;
      name: string;
      login: string;
      displayName?: string | null;
      lastSeenAt?: Date | null;
    };
  }>;
  messages: Array<{
    id: string;
    text: string;
    createdAt: Date;
    author: {
      name: string;
      login: string;
      displayName?: string | null;
    };
    attachments: Array<{
      id: string;
      mimeType: string;
      originalName: string;
      sizeBytes: number;
    }>;
  }>;
};

const memberSelect = {
  id: true,
  name: true,
  login: true,
  displayName: true,
  lastSeenAt: true,
} as const;

const lastMessageSelect = {
  name: true,
  login: true,
  displayName: true,
} as const;

const toChatListItem = (chat: ChatListQueryResult, currentUserId: string, unreadCount = 0) => {
  const lastMessage = chat.messages[0] ?? null;

  return {
    id: chat.id,
    title: resolveChatTitle(chat, currentUserId),
    isGroup: chat.chatType === "GROUP",
    updatedAt: lastMessage?.createdAt ?? chat.createdAt,
    members: chat.members.map(toClientChatMember),
    unreadCount,
    lastMessage: lastMessage
      ? {
          id: lastMessage.id,
          text: getLastMessagePreviewText(lastMessage),
          createdAt: lastMessage.createdAt,
          authorName: resolveUserDisplayName(lastMessage.author),
        }
      : null,
  };
};

export async function GET() {
  try {
    const sessionUser = await getCurrentSessionUser();

    if (!sessionUser) {
      return unauthorized();
    }

    const chats = await prisma.chat.findMany({
      where: {
        members: {
          some: {
            userId: sessionUser.user.id,
          },
        },
      },
      include: {
        members: {
          include: {
            user: {
              select: memberSelect,
            },
          },
        },
        messages: {
          orderBy: {
            createdAt: "desc",
          },
          take: 1,
          include: {
            author: {
              select: lastMessageSelect,
            },
            attachments: {
              select: {
                id: true,
                mimeType: true,
                originalName: true,
                sizeBytes: true,
              },
            },
          },
        },
      },
    });

    const unreadCounts = await Promise.all(
      chats.map(async (chat: ChatListQueryResult) => {
        const membership = chat.members.find((member) => member.userId === sessionUser.user.id);
        const count = await prisma.message.count({
          where: {
            chatId: chat.id,
            authorId: {
              not: sessionUser.user.id,
            },
            ...(membership?.lastReadAt
              ? {
                  createdAt: {
                    gt: membership.lastReadAt,
                  },
                }
              : {}),
          },
        });

        return [chat.id, count] as const;
      })
    );

    const unreadByChatId = Object.fromEntries(unreadCounts);

    const items = chats
      .map((chat: ChatListQueryResult) =>
        toChatListItem(chat, sessionUser.user.id, unreadByChatId[chat.id] || 0)
      )
      .sort((left, right) => new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime());

    return NextResponse.json({ chats: items });
  } catch (error) {
    logServerError("chats.list", error);
    return internalServerError("Failed to load chats.");
  }
}

export async function POST(request: Request) {
  const sessionUser = await getCurrentSessionUser();

  if (!sessionUser) {
    return unauthorized();
  }

  let body: CreateChatBody;

  try {
    body = (await request.json()) as CreateChatBody;
  } catch {
    return badRequest("Invalid JSON body.");
  }

  const requestedMembers = Array.isArray(body.memberIds)
    ? body.memberIds.filter((value): value is string => typeof value === "string" && value.trim().length > 0)
    : [];

  const participantIds = Array.from(
    new Set([sessionUser.user.id, ...requestedMembers.map((value) => value.trim())])
  );

  if (participantIds.length < 2) {
    return badRequest("At least two chat members are required.");
  }

  const title = body.title?.trim() || null;
  const isGroup = requestedMembers.length > 1 || Boolean(title);

  if (isGroup && !title) {
    return badRequest("Group conversation title is required.");
  }

  if (isGroup && participantIds.length < 3) {
    return badRequest("Group conversation requires at least two invited participants.");
  }

  const isDirect = !isGroup;
  const directKey = isDirect ? [...participantIds].sort().join(":") : null;

  try {
    const existingUsers = await prisma.user.findMany({
      where: {
        id: {
          in: participantIds,
        },
        isActive: true,
      },
      select: {
        id: true,
      },
    });

    if (existingUsers.length !== participantIds.length) {
      return badRequest("One or more users do not exist or are inactive.");
    }

    if (isDirect && directKey) {
      const existingChat = await prisma.chat.findUnique({
        where: {
          directKey,
        },
        include: {
          members: {
            include: {
              user: {
                select: memberSelect,
              },
            },
          },
          messages: {
            orderBy: {
              createdAt: "desc",
            },
            take: 1,
            include: {
              author: {
                select: lastMessageSelect,
              },
              attachments: {
                select: {
                  id: true,
                  mimeType: true,
                  originalName: true,
                  sizeBytes: true,
                },
              },
            },
          },
        },
      });

      if (existingChat) {
        return NextResponse.json(
          {
            chat: toChatListItem(existingChat, sessionUser.user.id, 0),
          },
          { status: 200 }
        );
      }
    }

    const chat = await prisma.chat.create({
      data: {
        title,
        chatType: isDirect ? "DIRECT" : "GROUP",
        directKey,
        createdByUserId: sessionUser.user.id,
        members: {
          createMany: {
            data: participantIds.map((userId) => ({
              userId,
              ...(userId === sessionUser.user.id ? { lastReadAt: new Date() } : {}),
            })),
          },
        },
      },
      include: {
        members: {
          include: {
            user: {
              select: memberSelect,
            },
          },
        },
        messages: {
          orderBy: {
            createdAt: "desc",
          },
          take: 1,
          include: {
            author: {
              select: lastMessageSelect,
            },
            attachments: {
              select: {
                id: true,
                mimeType: true,
                originalName: true,
                sizeBytes: true,
              },
            },
          },
        },
      },
    });

    return NextResponse.json(
      {
        chat: toChatListItem(chat, sessionUser.user.id, 0),
      },
      { status: 201 }
    );
  } catch (error) {
    logServerError("chats.create", error);
    return internalServerError("Failed to create chat.");
  }
}
