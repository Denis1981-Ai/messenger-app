import { NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";
import { badRequest, internalServerError, logServerError, unauthorized } from "@/lib/server/response";
import { getCurrentSessionUser } from "@/lib/server/session";
import { normalizeDisplayNameInput, toClientUser } from "@/lib/server/user-display";

export const runtime = "nodejs";

type UpdateBody = {
  displayName?: string | null;
};

export async function GET() {
  try {
    const sessionUser = await getCurrentSessionUser();

    if (!sessionUser) {
      return unauthorized();
    }

    return NextResponse.json({
      user: sessionUser.user,
    });
  } catch (error) {
    logServerError("settings.displayName.get", error);
    return internalServerError("Failed to load display name settings.");
  }
}

export async function PATCH(request: Request) {
  const sessionUser = await getCurrentSessionUser();

  if (!sessionUser) {
    return unauthorized();
  }

  let body: UpdateBody;

  try {
    body = (await request.json()) as UpdateBody;
  } catch {
    return badRequest("Invalid JSON body.");
  }

  let displayName: string | null;

  try {
    displayName = normalizeDisplayNameInput(body.displayName ?? "");
  } catch (error) {
    return badRequest(error instanceof Error ? error.message : "Invalid display name.");
  }

  try {
    const user = await prisma.user.update({
      where: {
        id: sessionUser.user.id,
      },
      data: {
        displayName,
      },
      select: {
        id: true,
        name: true,
        login: true,
        displayName: true,
        lastSeenAt: true,
      },
    });

    return NextResponse.json({
      user: toClientUser(user),
    });
  } catch (error) {
    logServerError("settings.displayName.patch", error);
    return internalServerError("Failed to update display name.");
  }
}
