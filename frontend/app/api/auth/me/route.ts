import { NextResponse } from "next/server";

import { internalServerError, logServerError, unauthorized } from "@/lib/server/response";
import { getCurrentSessionUser } from "@/lib/server/session";

export const runtime = "nodejs";

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
    logServerError("auth.me", error);
    return internalServerError("Failed to load current user.");
  }
}