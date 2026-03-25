import { NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";
import { forbidden, internalServerError, logServerError, notFound, unauthorized } from "@/lib/server/response";
import { getCurrentSessionUser } from "@/lib/server/session";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{
    chatId: string;
  }>;
};

export async function POST(_request: Request, context: RouteContext) {
  try {
    const sessionUser = await getCurrentSessionUser();

    if (!sessionUser) {
      return unauthorized();
    }

    const { chatId } = await context.params;

    const membership = await prisma.chatMember.findUnique({
      where: {
        chatId_userId: {
          chatId,
          userId: sessionUser.user.id,
        },
      },
      select: {
        chatId: true,
        userId: true,
      },
    });

    if (!membership) {
      const chatExists = await prisma.chat.findUnique({
        where: { id: chatId },
        select: { id: true },
      });

      return chatExists ? forbidden("You are not a member of this chat.") : notFound("Chat not found.");
    }

    await prisma.chatMember.update({
      where: {
        chatId_userId: {
          chatId,
          userId: sessionUser.user.id,
        },
      },
      data: {
        lastReadAt: new Date(),
      },
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    logServerError("chats.read", error);
    return internalServerError("Failed to update read state.");
  }
}
