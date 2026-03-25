import { NextResponse } from "next/server";

import { internalServerError, logServerError } from "@/lib/server/response";
import { destroyCurrentSession } from "@/lib/server/session";

export const runtime = "nodejs";

export async function POST() {
  try {
    await destroyCurrentSession();
    return NextResponse.json({ ok: true });
  } catch (error) {
    logServerError("auth.logout", error);
    return internalServerError("Logout failed.");
  }
}