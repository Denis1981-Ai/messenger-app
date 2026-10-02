import { NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";
import { resolveChatTitle } from "@/lib/server/chat-access";
import { getLastMessagePreviewText } from "@/lib/server/message-serialization";
import { internalServerError, logServerError, unauthorized } from "@/lib/server/response";
import { getCurrentSessionUser } from "@/lib/server/session";
import { resolveUserDisplayName } from "@/lib/server/user-display";

export const runtime = "nodejs";

const MAX_QUERY_LENGTH = 80;
const MAX_RESULTS = 20;

export async function GET(request: Request) {
  const sessionUser = await getCurrentSessionUser();

  if (!sessionUser) {
    return unauthorized();
  }

  const url = new URL(request.url);
  const query = (url.searchParams.get("q") || "").trim().slice(0, MAX_QUERY_LENGTH);

  if (query.length < 2) {
    return NextResponse.json({ results: [] });
  }

  const rawLimit = Number(url.searchParams.get("limit") || MAX_RESULTS);
  const limit = Number.isFinite(rawLimit) ? Math.min(Math.max(Math.trunc(rawLimit), 1), MAX_RESULTS) : MAX_RESULTS;

  try {
    const messages = await prisma.message.findMany({
      where: {
        chat: {
          members: {
            some: {
              userId: sessionUser.user.id,
            },
          },
        },
        OR: [
          {
            text: {
              contains: query,
              mode: "insensitive",
            },
          },
          {
            attachments: {
              some: {
                originalName: {
                  contains: query,
                  mode: "insensitive",
                },
              },
            },
          },
        ],
      },
      orderBy: {
        createdAt: "desc",
      },
      take: limit,
      include: {
        author: {
          select: {
            name: true,
            login: true,
            displayName: true,
          },
        },
        attachments: {
          select: {
            id: true,
            mimeType: true,
            originalName: true,
            sizeBytes: true,
          },
        },
        chat: {
          select: {
            id: true,
            title: true,
            chatType: true,
            createdAt: true,
            members: {
              include: {
                user: {
                  select: {
                    id: true,
                    name: true,
                    login: true,
                    displayName: true,
                    lastSeenAt: true,
                  },
                },
              },
            },
          },
        },
      },
    });

    const results = messages.map((message) => ({
      id: message.id,
      chatId: message.chatId,
      chatTitle: resolveChatTitle(message.chat, sessionUser.user.id),
      authorName: resolveUserDisplayName(message.author),
      createdAt: message.createdAt,
      preview: getLastMessagePreviewText(message),
    }));

    return NextResponse.json({ results });
  } catch (error) {
    logServerError("search.messages", error);
    return internalServerError("Failed to search messages.");
  }
}
