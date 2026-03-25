import { Attachment, Message } from "@prisma/client";

import { resolveAttachmentMimeType } from "@/lib/attachment-mime";
import { getAttachmentDownloadUrl } from "@/lib/server/attachments";
import { resolveUserDisplayName } from "@/lib/server/user-display";

type AttachmentRecord = Pick<Attachment, "id" | "originalName" | "mimeType" | "sizeBytes">;

type MessageRecord = Pick<Message, "id" | "chatId" | "authorId" | "text" | "createdAt" | "editedAt" | "replyToMessageId"> & {
  author: {
    id: string;
    name: string;
    login: string;
    displayName?: string | null;
  };
  attachments?: AttachmentRecord[];
};

const getAttachmentLabel = (attachment?: AttachmentRecord | null) =>
  resolveAttachmentMimeType(attachment?.mimeType, attachment?.originalName).startsWith("image/")
    ? "\u0418\u0437\u043e\u0431\u0440\u0430\u0436\u0435\u043d\u0438\u0435"
    : "\u0424\u0430\u0439\u043b";

export const getLastMessagePreviewText = (message: {
  text: string;
  attachments?: AttachmentRecord[];
}) => {
  const text = message.text?.trim();
  if (text) {
    return text;
  }

  const attachments = Array.isArray(message.attachments) ? message.attachments : [];
  if (attachments.length === 0) {
    return "";
  }

  if (attachments.length === 1) {
    return `\u{1F4CE} ${getAttachmentLabel(attachments[0])}`;
  }

  return `\u{1F4CE} \u0424\u0430\u0439\u043b\u044b (${attachments.length})`;
};

export const serializeAttachment = (attachment: AttachmentRecord) => ({
  id: attachment.id,
  fileName: attachment.originalName,
  fileType: resolveAttachmentMimeType(attachment.mimeType, attachment.originalName),
  fileSize: attachment.sizeBytes,
  fileData: getAttachmentDownloadUrl(attachment.id),
});

export const serializeMessage = (message: MessageRecord) => ({
  id: message.id,
  chatId: message.chatId,
  authorId: message.authorId,
  authorName: resolveUserDisplayName(message.author),
  text: message.text,
  createdAt: message.createdAt,
  editedAt: message.editedAt,
  replyToMessageId: message.replyToMessageId,
  attachments: Array.isArray(message.attachments)
    ? message.attachments.map(serializeAttachment)
    : [],
});
