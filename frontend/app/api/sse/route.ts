import { prisma } from "@/lib/prisma";
import { serializeMessage } from "@/lib/server/message-serialization";
import { unauthorized } from "@/lib/server/response";
import { getCurrentSessionUser } from "@/lib/server/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SERVER_POLL_INTERVAL_MS = 2000;
const HEARTBEAT_INTERVAL_MS = 25000;

export async function GET(request: Request) {
  const sessionUser = await getCurrentSessionUser();
  if (!sessionUser) {
    return unauthorized();
  }

  const { searchParams } = new URL(request.url);
  const chatId = searchParams.get("chatId") ?? null;
  const sinceParam = searchParams.get("since");

  let lastChecked = sinceParam ? new Date(sinceParam) : new Date();
  if (isNaN(lastChecked.getTime())) {
    lastChecked = new Date();
  }

  // Validate chat membership if chatId provided
  if (chatId) {
    const membership = await prisma.chatMember.findUnique({
      where: { chatId_userId: { chatId, userId: sessionUser.user.id } },
      select: { chatId: true },
    });
    if (!membership) {
      return new Response("Forbidden", { status: 403 });
    }
  }

  const encoder = new TextEncoder();
  let closed = false;

  const stream = new ReadableStream({
    start(controller) {
      // Send initial connection confirmation
      controller.enqueue(encoder.encode(`event: connected\ndata: {}\n\n`));

      const pollInterval = setInterval(async () => {
        if (closed) return;

        try {
          const newMessages = await prisma.message.findMany({
            where: {
              createdAt: { gt: lastChecked },
              ...(chatId
                ? { chatId }
                : { chat: { members: { some: { userId: sessionUser.user.id } } } }),
            },
            orderBy: { createdAt: "asc" },
            include: {
              author: {
                select: {
                  id: true,
                  name: true,
                  login: true,
                  displayName: true,
                  lastSeenAt: true,
                },
              },
              attachments: { orderBy: { createdAt: "asc" } },
            },
          });

          if (newMessages.length > 0) {
            lastChecked = newMessages[newMessages.length - 1].createdAt;
            const data = JSON.stringify({ messages: newMessages.map(serializeMessage) });
            controller.enqueue(encoder.encode(`event: messages\ndata: ${data}\n\n`));
          }
        } catch {
          // Keep connection alive on DB errors — best-effort
        }
      }, SERVER_POLL_INTERVAL_MS);

      const heartbeatInterval = setInterval(() => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(`: heartbeat\n\n`));
        } catch {
          closed = true;
          clearInterval(pollInterval);
          clearInterval(heartbeatInterval);
        }
      }, HEARTBEAT_INTERVAL_MS);

      request.signal.addEventListener("abort", () => {
        closed = true;
        clearInterval(pollInterval);
        clearInterval(heartbeatInterval);
      });
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
