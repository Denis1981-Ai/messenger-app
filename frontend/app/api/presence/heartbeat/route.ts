import { NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";
import { internalServerError, logServerError, unauthorized } from "@/lib/server/response";
import { getCurrentSessionUser } from "@/lib/server/session";
import { toClientUser } from "@/lib/server/user-display";

export const runtime = "nodejs";

export async function POST() {
  try {
    const sessionUser = await getCurrentSessionUser();

    if (!sessionUser) {
      return unauthorized();
    }

    const user = await prisma.user.update({
      where: { id: sessionUser.user.id },
      data: { lastSeenAt: new Date() },
    });

    return NextResponse.json({ user: toClientUser(user) });
  } catch (error) {
    logServerError("presence.heartbeat", error);
    return internalServerError("Failed to update presence.");
  }
}
