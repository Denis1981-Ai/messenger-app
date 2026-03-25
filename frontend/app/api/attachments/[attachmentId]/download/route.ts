import { NextResponse } from "next/server";

import { resolveAttachmentMimeType } from "@/lib/attachment-mime";
import { prisma } from "@/lib/prisma";
import { readStoredFile } from "@/lib/server/attachments";
import { forbidden, internalServerError, logServerError, notFound, unauthorized } from "@/lib/server/response";
import { getCurrentSessionUser } from "@/lib/server/session";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{
    attachmentId: string;
  }>;
};

const encodeContentDispositionName = (value: string) =>
  encodeURIComponent(value).replace(/['()]/g, escape).replace(/\*/g, "%2A");

export async function GET(request: Request, context: RouteContext) {
  try {
    const sessionUser = await getCurrentSessionUser();

    if (!sessionUser) {
      return unauthorized();
    }

    const { attachmentId } = await context.params;
    const attachment = await prisma.attachment.findUnique({
      where: {
        id: attachmentId,
      },
      include: {
        message: {
          include: {
            chat: {
              include: {
                members: {
                  select: {
                    userId: true,
                  },
                },
              },
            },
          },
        },
      },
    });

    if (!attachment) {
      return notFound("Attachment not found.");
    }

    const isMember = attachment.message.chat.members.some((member) => member.userId === sessionUser.user.id);

    if (!isMember) {
      return forbidden("You are not allowed to access this attachment.");
    }

    let fileBuffer: Buffer;
    try {
      fileBuffer = await readStoredFile(attachment.storageKey);
    } catch (error) {
      if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") {
        return notFound("Stored file not found.");
      }

      throw error;
    }

    const url = new URL(request.url);
    const forceDownload = url.searchParams.get("download") === "1";
    const dispositionType = forceDownload ? "attachment" : "inline";
    const encodedName = encodeContentDispositionName(attachment.originalName);
    const contentType = resolveAttachmentMimeType(attachment.mimeType, attachment.originalName);

    return new NextResponse(new Uint8Array(fileBuffer), {
      status: 200,
      headers: {
        "Content-Type": contentType,
        "Content-Length": String(fileBuffer.byteLength),
        "Content-Disposition": `${dispositionType}; filename*=UTF-8''${encodedName}`,
        "Cache-Control": "private, max-age=60",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    logServerError("attachments.download", error);
    return internalServerError("Download failed.");
  }
}
