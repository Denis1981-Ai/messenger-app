import { NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";
import {
  MAX_FILES_PER_MESSAGE,
  removeStoredFiles,
  saveIncomingFile,
} from "@/lib/server/attachments";
import { getChatForMember } from "@/lib/server/chat-access";
import { serializeMessage } from "@/lib/server/message-serialization";
import { badRequest, forbidden, internalServerError, logServerError, notFound, unauthorized } from "@/lib/server/response";
import { getCurrentSessionUser } from "@/lib/server/session";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{
    chatId: string;
  }>;
};

const isUploadValidationError = (message: string) => {
  const knownMessages = [
    "Файл не передан.",
    "пустой.",
    "превышает лимит 10 МБ.",
  ];

  return knownMessages.some((knownMessage) => message.includes(knownMessage));
};

export async function POST(request: Request, context: RouteContext) {
  const sessionUser = await getCurrentSessionUser();

  if (!sessionUser) {
    return unauthorized();
  }

  const { chatId } = await context.params;
  const { chat, isMember } = await getChatForMember(chatId, sessionUser.user.id);

  if (!chat) {
    return notFound("Chat not found.");
  }

  if (!isMember) {
    return forbidden("You are not a member of this chat.");
  }

  let formData: FormData;

  try {
    formData = await request.formData();
  } catch {
    return badRequest("Invalid multipart form data.");
  }

  const text = String(formData.get("text") || "").trim();
  const rawReplyToMessageId = String(formData.get("replyToMessageId") || "").trim();
  const replyToMessageId = rawReplyToMessageId || null;
  const fileEntries = formData.getAll("files").filter((value): value is File => value instanceof File);

  if (fileEntries.length === 0) {
    return badRequest("At least one file is required.");
  }

  if (fileEntries.length > MAX_FILES_PER_MESSAGE) {
    return badRequest(`You can upload up to ${MAX_FILES_PER_MESSAGE} files per message.`);
  }

  if (replyToMessageId) {
    const replyTarget = await prisma.message.findFirst({
      where: {
        id: replyToMessageId,
        chatId,
      },
      select: {
        id: true,
      },
    });

    if (!replyTarget) {
      return badRequest("Reply target must belong to the same chat.");
    }
  }

  const savedFiles: Array<{
    originalName: string;
    mimeType: string;
    sizeBytes: number;
    storageKey: string;
  }> = [];

  try {
    for (const file of fileEntries) {
      savedFiles.push(await saveIncomingFile(file));
    }

    const message = await prisma.$transaction(async (tx) => {
      const createdMessage = await tx.message.create({
        data: {
          chatId,
          authorId: sessionUser.user.id,
          text,
          replyToMessageId,
        },
      });

      await tx.attachment.createMany({
        data: savedFiles.map((file) => ({
          messageId: createdMessage.id,
          uploadedByUserId: sessionUser.user.id,
          originalName: file.originalName,
          mimeType: file.mimeType,
          sizeBytes: file.sizeBytes,
          storageKey: file.storageKey,
        })),
      });

      return tx.message.findUniqueOrThrow({
        where: {
          id: createdMessage.id,
        },
        include: {
          author: {
            select: {
              id: true,
              name: true,
              login: true,
              displayName: true,
            },
          },
          attachments: {
            orderBy: {
              createdAt: "asc",
            },
          },
        },
      });
    });

    return NextResponse.json(
      {
        message: serializeMessage(message),
      },
      { status: 201 }
    );
  } catch (error) {
    await removeStoredFiles(savedFiles.map((file) => file.storageKey));

    if (error instanceof Error && isUploadValidationError(error.message)) {
      return badRequest(error.message);
    }

    logServerError("attachments.upload", error);
    return internalServerError("Upload failed.");
  }
}
