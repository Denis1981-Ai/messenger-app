import { NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";
import { verifyPassword } from "@/lib/server/password";
import { badRequest, internalServerError, logServerError, unauthorized } from "@/lib/server/response";
import { createSession } from "@/lib/server/session";
import { toClientUser } from "@/lib/server/user-display";

export const runtime = "nodejs";

type LoginBody = {
  login?: string;
  password?: string;
};

export async function POST(request: Request) {
  let body: LoginBody;

  try {
    body = (await request.json()) as LoginBody;
  } catch {
    return badRequest("Invalid JSON body.");
  }

  const login = body.login?.trim().toLowerCase();
  const password = body.password?.trim() ?? "";

  if (!login || !password) {
    return badRequest("Login and password are required.");
  }

  try {
    const user = await prisma.user.findUnique({
      where: {
        login,
      },
    });

    if (!user || !user.isActive || !verifyPassword(password, user.passwordHash)) {
      return unauthorized("Invalid login or password.");
    }

    const nextSeenAt = new Date();

    const updatedUser = await prisma.user.update({
      where: { id: user.id },
      data: { lastSeenAt: nextSeenAt },
    });

    await createSession(user.id);

    return NextResponse.json({
      user: toClientUser(updatedUser),
    });
  } catch (error) {
    logServerError("auth.login", error);
    return internalServerError("Login failed.");
  }
}
