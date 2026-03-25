import { NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";
import { internalServerError, logServerError, unauthorized } from "@/lib/server/response";
import { getCurrentSessionUser } from "@/lib/server/session";
import { toClientUser } from "@/lib/server/user-display";

export const runtime = "nodejs";

export async function GET() {
  try {
    const sessionUser = await getCurrentSessionUser();

    if (!sessionUser) {
      return unauthorized();
    }

    const users = await prisma.user.findMany({
      where: {
        isActive: true,
        NOT: {
          id: sessionUser.user.id,
        },
      },
      select: {
        id: true,
        name: true,
        login: true,
        displayName: true,
        lastSeenAt: true,
      },
    });

    const sortedUsers = users
      .map(toClientUser)
      .sort((left, right) => left.name.localeCompare(right.name, "ru", { sensitivity: "base" }));

    return NextResponse.json({ users: sortedUsers });
  } catch (error) {
    logServerError("users.list", error);
    return internalServerError("Failed to load users.");
  }
}
