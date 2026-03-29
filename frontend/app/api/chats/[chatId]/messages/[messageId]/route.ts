import { NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";
import { removeStoredFiles } from "@/lib/server/attachments";
import { getChatForMember } from "@/lib/server/chat-access";
import { serializeMessage } from "@/lib/server/message-serialization";
import { badRequest, forbidden, internalServerError, logServerError, notFound, unauthorized } from "@/lib/server/response";
import { getCurrentSessionUser } from "@/lib/server/session";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{
    chatId: string;
    messageId: string;
  }>;
};

type PatchMessageBody = {
  text?: string;
};

export async function PATCH(request: Request, context: RouteContext) {
  const sessionUser = await getCurrentSessionUser();

  if (!sessionUser) {
    return unauthorized();
  }

  const { chatId, messageId } = await context.params;
  const { chat, isMember } = await getChatForMember(chatId, sessionUser.user.id);

  if (!chat) {
    return notFound("Chat not found.");
  }

  if (!isMember) {
    return forbidden("You are not a member of this chat.");
  }

  let body: PatchMessageBody;

  try {
    body = (await request.json()) as PatchMessageBody;
  } catch {
    return badRequest("Invalid JSON body.");
  }

  const text = typeof body.text === "string" ? body.text.trim() : "";

  if (!text) {
    return badRequest("Message text is required.");
  }

  try {
    const existingMessage = await prisma.message.findFirst({
      where: {
        id: messageId,
        chatId,
      },
      include: {
        attachments: {
          orderBy: {
            createdAt: "asc",
          },
        },
      },
    });

    if (!existingMessage) {
      return notFound("Message not found.");
    }

    if (existingMessage.authorId !== sessionUser.user.id) {
      return forbidden("You can edit only your own messages.");
    }

    const message = await prisma.message.update({
      where: {
        id: messageId,
      },
      data: {
        text,
        editedAt: new Date(),
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
      message: serializeMessage(message),
    });
  } catch (error) {
    logServerError("messages.update", error);
    return internalServerError("Failed to update message.");
  }
}

export async function DELETE(_request: Request, context: RouteContext) {
  const sessionUser = await getCurrentSessionUser();

  if (!sessionUser) {
    return unauthorized();
  }

  const { chatId, messageId } = await context.params;
  const { chat, isMember } = await getChatForMember(chatId, sessionUser.user.id);

  if (!chat) {
    return notFound("Chat not found.");
  }

  if (!isMember) {
    return forbidden("You are not a member of this chat.");
  }

  try {
    const existingMessage = await prisma.message.findFirst({
      where: {
        id: messageId,
        chatId,
      },
      include: {
        attachments: {
          select: {
            storageKey: true,
          },
        },
      },
    });

    if (!existingMessage) {
      return notFound("Message not found.");
    }

    const canDeleteAny =
      (sessionUser.user.login || "").toLowerCase() === "weld.info@yandex.ru" ||
      (sessionUser.user.displayName || "").toLowerCase() === "weld.info@yandex.ru";

    if (!canDeleteAny && existingMessage.authorId !== sessionUser.user.id) {
      return forbidden("You can delete only your own messages.");
    }

    const storageKeys = existingMessage.attachments.map((attachment) => attachment.storageKey);

    await prisma.message.delete({
      where: {
        id: messageId,
      },
    });

    await removeStoredFiles(storageKeys);

    return NextResponse.json({ ok: true });
  } catch (error) {
    logServerError("messages.delete", error);
    return internalServerError("Failed to delete message.");
  }
}
