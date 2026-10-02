import { NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";
import { copyStoredAttachment, removeStoredFiles } from "@/lib/server/attachments";
import { ChatWithMembers, getChatForMember, resolveChatTitle, toClientChatMember } from "@/lib/server/chat-access";
import { serializeMessage } from "@/lib/server/message-serialization";
import { badRequest, forbidden, internalServerError, logServerError, notFound, unauthorized } from "@/lib/server/response";
import { getCurrentSessionUser } from "@/lib/server/session";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{
    chatId: string;
  }>;
};

type PostMessageBody = {
  text?: string;
  replyToMessageId?: string | null;
  forwardMessageIds?: string[];
};

export async function GET(request: Request, context: RouteContext) {
  try {
    const sessionUser = await getCurrentSessionUser();

    if (!sessionUser) {
      return unauthorized();
    }

    const { chatId } = await context.params;
    const { chat, isMember } = await getChatForMember(chatId, sessionUser.user.id);

    if (!chat) {
      return notFound("Chat not found.");
    }

    if (!isMember) {
      return forbidden("You are not a member of this chat.");
    }

    const url = new URL(request.url);
    const limit = Math.min(parseInt(url.searchParams.get("limit") || "50"), 100);
    const before = url.searchParams.get("before") || null;

    let createdAtFilter: { lt: Date } | undefined;
    if (before) {
      const beforeMsg = await prisma.message.findFirst({
        where: { id: before, chatId },
        select: { createdAt: true },
      });
      if (beforeMsg) {
        createdAtFilter = { lt: beforeMsg.createdAt };
      }
    }

    const rawMessages = await prisma.message.findMany({
      where: {
        chatId,
        ...(createdAtFilter ? { createdAt: createdAtFilter } : {}),
      },
      orderBy: { createdAt: "desc" },
      take: limit + 1,
      include: {
        author: {
          select: { id: true, name: true, login: true, displayName: true, lastSeenAt: true },
        },
        attachments: { orderBy: { createdAt: "asc" } },
        reactions: { select: { userId: true, emoji: true } },
      },
    });

    const hasMore = rawMessages.length > limit;
    const messages = (hasMore ? rawMessages.slice(0, limit) : rawMessages).reverse();

    return NextResponse.json({
      chat: {
        id: chat.id,
        title: resolveChatTitle(chat, sessionUser.user.id),
        isGroup: chat.chatType === "GROUP",
        members: chat.members.map((member: ChatWithMembers["members"][number]) => toClientChatMember(member)),
      },
      messages: messages.map((m) => serializeMessage(m, sessionUser.user.id)),
      hasMore,
    });
  } catch (error) {
    logServerError("messages.list", error);
    return internalServerError("Failed to load chat messages.");
  }
}

export async function POST(request: Request, context: RouteContext) {
  const sessionUser = await getCurrentSessionUser();

  if (!sessionUser) {
    return unauthorized();
  }

  const { chatId } = await context.params;
  const { chat, isMember } = await getChatForMember(chatId, sessionUser.user.id);

  if (!chat) {
    return notFound("Chat not found.");
  }

  if (!isMember) {
    return forbidden("You are not a member of this chat.");
  }

  let body: PostMessageBody;

  try {
    body = (await request.json()) as PostMessageBody;
  } catch {
    return badRequest("Invalid JSON body.");
  }

  const text = body.text?.trim() || "";
  const forwardMessageIds = Array.isArray(body.forwardMessageIds)
    ? Array.from(
        new Set(
          body.forwardMessageIds.filter(
            (value): value is string => typeof value === "string" && value.trim().length > 0
          )
        )
      ).slice(0, 20)
    : [];
  const replyToMessageId =
    typeof body.replyToMessageId === "string" && body.replyToMessageId.trim()
      ? body.replyToMessageId.trim()
      : null;

  if (!text && forwardMessageIds.length === 0) {
    return badRequest("Message text is required.");
  }

  try {
    if (forwardMessageIds.length > 0) {
      const sourceMessages = await prisma.message.findMany({
        where: {
          id: {
            in: forwardMessageIds,
          },
          chat: {
            members: {
              some: {
                userId: sessionUser.user.id,
              },
            },
          },
        },
        include: {
          attachments: {
            orderBy: {
              createdAt: "asc",
            },
          },
        },
      });

      const sourceById = new Map(sourceMessages.map((message) => [message.id, message]));
      const orderedSources = forwardMessageIds.map((id) => sourceById.get(id));

      if (orderedSources.some((message) => !message)) {
        return badRequest("One or more forwarded messages are not available.");
      }

      const copiedFilesBySourceId = new Map<
        string,
        Array<{
          originalName: string;
          mimeType: string;
          sizeBytes: number;
          storageKey: string;
        }>
      >();

      try {
        for (const source of orderedSources) {
          if (!source) {
            continue;
          }

          const copiedFiles = [];
          for (const attachment of source.attachments) {
            copiedFiles.push(await copyStoredAttachment(attachment));
          }
          copiedFilesBySourceId.set(source.id, copiedFiles);
        }

        const messages = await prisma.$transaction(async (tx) => {
          const createdIds: string[] = [];

          for (const source of orderedSources) {
            if (!source) {
              continue;
            }

            const createdMessage = await tx.message.create({
              data: {
                chatId,
                authorId: sessionUser.user.id,
                text: source.text,
              },
            });
            createdIds.push(createdMessage.id);

            const copiedFiles = copiedFilesBySourceId.get(source.id) || [];
            if (copiedFiles.length > 0) {
              await tx.attachment.createMany({
                data: copiedFiles.map((file) => ({
                  messageId: createdMessage.id,
                  uploadedByUserId: sessionUser.user.id,
                  originalName: file.originalName,
                  mimeType: file.mimeType,
                  sizeBytes: file.sizeBytes,
                  storageKey: file.storageKey,
                })),
              });
            }
          }

          return tx.message.findMany({
            where: {
              id: {
                in: createdIds,
              },
            },
            orderBy: {
              createdAt: "asc",
            },
            include: {
              author: {
                select: {
                  id: true,
                  name: true,
                  login: true,
                  displayName: true,
                  lastSeenAt: true,
                },
              },
              attachments: {
                orderBy: {
                  createdAt: "asc",
                },
              },
              reactions: { select: { userId: true, emoji: true } },
            },
          });
        });

        const serializedMessages = messages.map((message) => serializeMessage(message, sessionUser.user.id));

        return NextResponse.json(
          {
            message: serializedMessages[0] || null,
            messages: serializedMessages,
          },
          { status: 201 }
        );
      } catch (error) {
        await removeStoredFiles(
          Array.from(copiedFilesBySourceId.values())
            .flat()
            .map((file) => file.storageKey)
        );
        throw error;
      }
    }

    if (replyToMessageId) {
      const replyTarget = await prisma.message.findFirst({
        where: {
          id: replyToMessageId,
          chatId,
        },
        select: {
          id: true,
        },
      });

      if (!replyTarget) {
        return badRequest("Reply target must belong to the same chat.");
      }
    }

    const message = await prisma.message.create({
      data: {
        chatId,
        authorId: sessionUser.user.id,
        text,
        replyToMessageId,
      },
      include: {
        author: {
          select: {
            id: true,
            name: true,
            login: true,
            displayName: true,
            lastSeenAt: true,
          },
        },
        attachments: true,
        reactions: { select: { userId: true, emoji: true } },
      },
    });

    return NextResponse.json(
      {
        message: serializeMessage(message, sessionUser.user.id),
      },
      { status: 201 }
    );
  } catch (error) {
    logServerError("messages.create", error);
    return internalServerError("Failed to send message.");
  }
}
