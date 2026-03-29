import { NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";
import { logServerError } from "@/lib/server/response";

export const runtime = "nodejs";

export async function GET() {
  try {
    await prisma.$queryRaw`SELECT 1`;

    return NextResponse.json({
      status: "ok",
      app: "up",
      db: "up",
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    logServerError("health", error);

    return NextResponse.json(
      {
        status: "error",
        app: "up",
        db: "down",
        timestamp: new Date().toISOString(),
      },
      { status: 503 },
    );
  }
}
