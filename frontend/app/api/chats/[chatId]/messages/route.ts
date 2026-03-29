import { NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";
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
};

export async function GET(_request: Request, context: RouteContext) {
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

    const messages = await prisma.message.findMany({
      where: {
        chatId,
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
      },
    });

    return NextResponse.json({
      chat: {
        id: chat.id,
        title: resolveChatTitle(chat, sessionUser.user.id),
        isGroup: chat.chatType === "GROUP",
        members: chat.members.map((member: ChatWithMembers["members"][number]) => toClientChatMember(member)),
      },
      messages: messages.map(serializeMessage),
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
  const replyToMessageId =
    typeof body.replyToMessageId === "string" && body.replyToMessageId.trim()
      ? body.replyToMessageId.trim()
      : null;

  if (!text) {
    return badRequest("Message text is required.");
  }

  try {
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
      },
    });

    return NextResponse.json(
      {
        message: serializeMessage(message),
      },
      { status: 201 }
    );
  } catch (error) {
    logServerError("messages.create", error);
    return internalServerError("Failed to send message.");
  }
}
