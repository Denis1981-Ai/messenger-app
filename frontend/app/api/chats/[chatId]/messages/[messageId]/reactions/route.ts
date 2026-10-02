import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { badRequest, forbidden, internalServerError, logServerError, notFound, unauthorized } from "@/lib/server/response";
import { getCurrentSessionUser } from "@/lib/server/session";
import { getChatForMember } from "@/lib/server/chat-access";
import { serializeReactions } from "@/lib/server/message-serialization";

export const runtime = "nodejs";

const ALLOWED_EMOJIS = ["👍", "❤️", "😂", "😮", "😢"];

type Params = { params: Promise<{ chatId: string; messageId: string }> };

export async function POST(request: Request, { params }: Params) {
  try {
    const sessionUser = await getCurrentSessionUser();
    if (!sessionUser) return unauthorized();

    const { chatId, messageId } = await params;
    const { chat, isMember } = await getChatForMember(chatId, sessionUser.user.id);
    if (!chat) return notFound("Chat not found.");
    if (!isMember) return forbidden("You are not a member of this chat.");

    const body = (await request.json()) as { emoji?: string };
    const emoji = body.emoji?.trim();
    if (!emoji || !ALLOWED_EMOJIS.includes(emoji)) return badRequest("Invalid emoji");

    const existing = await prisma.reaction.findUnique({
      where: { messageId_userId_emoji: { messageId, userId: sessionUser.user.id, emoji } },
    });

    if (existing) {
      await prisma.reaction.delete({ where: { id: existing.id } });
    } else {
      await prisma.reaction.create({ data: { messageId, userId: sessionUser.user.id, emoji } });
    }

    const reactions = await prisma.reaction.findMany({ where: { messageId }, select: { userId: true, emoji: true } });
    return NextResponse.json({ reactions: serializeReactions(reactions, sessionUser.user.id) });
  } catch (error) {
    logServerError("reactions.toggle", error);
    return internalServerError("Failed to toggle reaction.");
  }
}
