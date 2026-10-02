import { NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";
import { badRequest, forbidden, internalServerError, logServerError, unauthorized } from "@/lib/server/response";
import { getCurrentSessionUser } from "@/lib/server/session";

export const runtime = "nodejs";

type RouteParams = {
  params: Promise<{
    chatId: string;
  }>;
};

type PreferencesBody = {
  isPinned?: unknown;
  isArchived?: unknown;
  isMuted?: unknown;
};

export async function PATCH(request: Request, { params }: RouteParams) {
  const sessionUser = await getCurrentSessionUser();

  if (!sessionUser) {
    return unauthorized();
  }

  const { chatId } = await params;
  let body: PreferencesBody;

  try {
    body = (await request.json()) as PreferencesBody;
  } catch {
    return badRequest("Invalid JSON body.");
  }

  let nextPinned: boolean | null = null;
  let nextArchived: boolean | null = null;
  let nextMuted: boolean | null = null;

  if (typeof body.isPinned === "boolean") {
    nextPinned = body.isPinned;
  }

  if (typeof body.isArchived === "boolean") {
    nextArchived = body.isArchived;
  }

  if (typeof body.isMuted === "boolean") {
    nextMuted = body.isMuted;
  }

  if (nextPinned === null && nextArchived === null && nextMuted === null) {
    return badRequest("No chat preference fields provided.");
  }

  if (nextArchived === true) {
    nextPinned = false;
  }

  try {
    const updatedCount = await prisma.$executeRaw`
      UPDATE chat_members
      SET
        is_pinned = COALESCE(${nextPinned}, is_pinned),
        is_archived = COALESCE(${nextArchived}, is_archived),
        is_muted = COALESCE(${nextMuted}, is_muted)
      WHERE chat_id = ${chatId}
        AND user_id = ${sessionUser.user.id}
    `;

    if (updatedCount === 0) {
      return forbidden("Chat is not available.");
    }

    const [preferences] = await prisma.$queryRaw<
      Array<{
        chatId: string;
        isPinned: boolean;
        isArchived: boolean;
        isMuted: boolean;
      }>
    >`
      SELECT
        chat_id AS "chatId",
        is_pinned AS "isPinned",
        is_archived AS "isArchived",
        is_muted AS "isMuted"
      FROM chat_members
      WHERE chat_id = ${chatId}
        AND user_id = ${sessionUser.user.id}
      LIMIT 1
    `;

    return NextResponse.json({ preferences });
  } catch (error) {
    logServerError("chat.preferences.update", error);
    return internalServerError("Failed to update chat preferences.");
  }
}
