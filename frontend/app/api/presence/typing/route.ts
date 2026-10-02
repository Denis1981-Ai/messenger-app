import { NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";
import { updateTyping } from "@/lib/typing-state";
import { badRequest, internalServerError, logServerError, unauthorized } from "@/lib/server/response";
import { getCurrentSessionUser } from "@/lib/server/session";
import { resolveUserDisplayName } from "@/lib/server/user-display";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const sessionUser = await getCurrentSessionUser();
    if (!sessionUser) return unauthorized();

    const body = (await request.json()) as { chatId?: string };
    const chatId = body.chatId?.trim();
    if (!chatId) return badRequest("chatId required");

    const membership = await prisma.chatMember.findUnique({
      where: { chatId_userId: { chatId, userId: sessionUser.user.id } },
      select: { chatId: true },
    });
    if (!membership) return new NextResponse("Forbidden", { status: 403 });

    const userName = resolveUserDisplayName({
      displayName: sessionUser.user.displayName ?? null,
      login: sessionUser.user.login,
    });

    updateTyping(chatId, sessionUser.user.id, userName);

    return NextResponse.json({ ok: true });
  } catch (error) {
    logServerError("presence.typing", error);
    return internalServerError("Failed to update typing state.");
  }
}
