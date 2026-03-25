import { STORAGE_SOFT_LIMIT_BYTES } from "../constants";
import { Attachment, Chats } from "../types";
import { createId, getCurrentTime, getMessageTimestamp, getSerializedSize } from "./format";

export const pruneOldestAttachmentData = (sourceChats: Chats): Chats | null => {
  const candidates: Array<{ chatName: string; messageId: string; timestamp: number }> = [];

  Object.entries(sourceChats).forEach(([chatName, messages]) => {
    messages.forEach((message) => {
      if (message.attachments && message.attachments.length > 0) {
        candidates.push({
          chatName,
          messageId: message.id,
          timestamp: getMessageTimestamp(message),
        });
      }
    });
  });

  if (candidates.length === 0) {
    return null;
  }

  candidates.sort((a, b) => a.timestamp - b.timestamp);
  const oldest = candidates[0];

  return Object.fromEntries(
    Object.entries(sourceChats).map(([chatName, messages]) => [
      chatName,
      chatName === oldest.chatName
        ? messages.map((message) =>
            message.id !== oldest.messageId
              ? message
              : {
                  ...message,
                  text: message.text || "Файл удален из памяти",
                  attachments: [],
                }
          )
        : messages,
    ])
  );
};

export const normalizeAttachment = (attachment: unknown): Attachment | null => {
  if (!attachment || typeof attachment !== "object") {
    return null;
  }

  const source = attachment as {
    id?: string;
    fileName?: string;
    fileType?: string;
    fileData?: string;
    fileSize?: number;
    name?: string;
    type?: string;
    url?: string;
  };

  const fileData = source.fileData || source.url;

  if (!fileData) {
    return null;
  }

  return {
    id: source.id || createId(),
    fileName: source.fileName || source.name || `file-${Date.now()}`,
    fileType: source.fileType || source.type || "application/octet-stream",
    fileData,
    fileSize: typeof source.fileSize === "number" ? source.fileSize : undefined,
  };
};

export const persistChatsSafely = (
  storageKey: string,
  nextChats: Chats,
  onWarning: () => void
) => {
  let preparedChats = nextChats;
  let serialized = JSON.stringify(preparedChats);

  while (getSerializedSize(serialized) > STORAGE_SOFT_LIMIT_BYTES) {
    const prunedChats = pruneOldestAttachmentData(preparedChats);

    if (!prunedChats) {
      break;
    }

    preparedChats = prunedChats;
    serialized = JSON.stringify(preparedChats);
  }

  while (true) {
    try {
      localStorage.setItem(storageKey, serialized);
      return preparedChats;
    } catch {
      const prunedChats = pruneOldestAttachmentData(preparedChats);

      if (!prunedChats) {
        onWarning();
        return null;
      }

      preparedChats = prunedChats;
      serialized = JSON.stringify(preparedChats);
    }
  }
};

export const createDefaultChats = (): Chats => ({
  Иван: [
    {
      id: createId(),
      text: "Привет!",
      sender: "other",
      authorId: "ivan",
      time: getCurrentTime(),
      createdAt: new Date().toISOString(),
      status: "read",
    },
    {
      id: createId(),
      text: "Как дела?",
      sender: "other",
      authorId: "ivan",
      time: getCurrentTime(),
      createdAt: new Date().toISOString(),
      status: "read",
    },
  ],
  "Общий чат": [],
});
