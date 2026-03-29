import { Attachment, Message, MessageStatus } from "../types";

export const createId = () => `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;

export const getCurrentTime = () =>
  new Date().toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });

export const getCurrentDateIso = () => new Date().toISOString();

export const getMessageTimestamp = (message: Message) => {
  const maybeTimestamp = Number(String(message.id).split("-")[0]);
  return Number.isFinite(maybeTimestamp) ? maybeTimestamp : 0;
};

export const getSafeMessageDate = (message: Message) => {
  const fromCreatedAt = message.createdAt ? new Date(message.createdAt) : null;

  if (fromCreatedAt && !Number.isNaN(fromCreatedAt.getTime())) {
    return fromCreatedAt;
  }

  const fromId = new Date(getMessageTimestamp(message));
  if (!Number.isNaN(fromId.getTime()) && fromId.getTime() > 0) {
    return fromId;
  }

  return new Date();
};

export const formatMessageTime = (message: Message) =>
  getSafeMessageDate(message).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });

export const formatMessageDate = (message: Message) =>
  getSafeMessageDate(message).toLocaleDateString("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });

export const getAttachmentLabel = (attachment?: Attachment | null) =>
  attachment?.fileType?.startsWith("image/") ? "🖼 Изображение" : "📎 Файл";

export const formatFileSize = (fileSize?: number) => {
  if (!fileSize || Number.isNaN(fileSize)) {
    return "";
  }

  if (fileSize < 1024) {
    return `${fileSize} Б`;
  }

  if (fileSize < 1024 * 1024) {
    return `${(fileSize / 1024).toFixed(1).replace(".0", "")} КБ`;
  }

  return `${(fileSize / (1024 * 1024)).toFixed(1).replace(".0", "")} МБ`;
};

export const getSerializedSize = (value: string) => new Blob([value]).size;

export const getStatusDisplay = (status: MessageStatus) => {
  if (status === "sent") {
    return {
      text: "✓",
      color: "rgba(255,255,255,0.95)",
    };
  }

  if (status === "delivered") {
    return {
      text: "✓✓",
      color: "#aeb7c2",
    };
  }

  return {
    text: "✓✓",
    color: "#4f8cff",
  };
};
