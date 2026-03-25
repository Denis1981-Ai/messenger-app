import { DEFAULT_USERS, REMOVED_CHAT_NAMES } from "../constants";
import { Chats, Message, MessageStatus, QuotePreview, User } from "../types";
import { getAttachmentLabel } from "./format";
import { normalizeAttachment } from "./storage";

const isValidStatus = (status: unknown): status is MessageStatus =>
  status === "sent" || status === "delivered" || status === "read";

const isNonNullableAttachment = <T,>(value: T | null): value is T => value !== null;

export const sanitizeChats = (source: Chats, fallbackChats: Chats): Chats => {
  if (!source || typeof source !== "object" || Array.isArray(source)) {
    return fallbackChats;
  }

  const normalizedEntries = Object.entries(source)
    .filter(([chatName]) => typeof chatName === "string" && !REMOVED_CHAT_NAMES.includes(chatName))
    .map(([chatName, messages]) => {
      const safeMessages = Array.isArray(messages) ? messages : [];

      return [
        chatName,
        safeMessages
          .filter((message) => message && typeof message === "object")
          .map((message, index) => {
            const rawMessage = message as Partial<Message> & {
              authorId?: string;
              sender?: "me" | "other";
              text?: unknown;
              attachments?: unknown;
              createdAt?: string;
              time?: string;
              id?: string;
              isEdited?: boolean;
              edited?: boolean;
              editedAt?: string;
              replyToMessageId?: string | null;
              status?: MessageStatus;
            };

            const sender = rawMessage.sender === "me" ? "me" : "other";
            const attachments = Array.isArray(rawMessage.attachments)
              ? rawMessage.attachments.map(normalizeAttachment).filter(isNonNullableAttachment)
              : [];
            const text =
              typeof rawMessage.text === "string"
                ? rawMessage.text
                : rawMessage.text == null
                  ? ""
                  : String(rawMessage.text);

            return {
              ...rawMessage,
              id:
                typeof rawMessage.id === "string" && rawMessage.id.trim()
                  ? rawMessage.id
                  : `${Date.now()}-${chatName}-${index}`,
              sender,
              text,
              authorId:
                typeof rawMessage.authorId === "string" && rawMessage.authorId.trim()
                  ? rawMessage.authorId
                  : sender === "me"
                    ? "me"
                    : chatName === "Марина"
                      ? "marina"
                      : "ivan",
              time:
                typeof rawMessage.time === "string" && rawMessage.time.trim()
                  ? rawMessage.time
                  : new Date().toLocaleTimeString([], {
                      hour: "2-digit",
                      minute: "2-digit",
                    }),
              createdAt:
                typeof rawMessage.createdAt === "string" && rawMessage.createdAt.trim()
                  ? rawMessage.createdAt
                  : new Date().toISOString(),
              isEdited:
                typeof rawMessage.isEdited === "boolean"
                  ? rawMessage.isEdited
                  : Boolean(rawMessage.edited),
              edited: Boolean(rawMessage.edited ?? rawMessage.isEdited),
              editedAt:
                typeof rawMessage.editedAt === "string" && rawMessage.editedAt.trim()
                  ? rawMessage.editedAt
                  : undefined,
              replyToMessageId:
                typeof rawMessage.replyToMessageId === "string" && rawMessage.replyToMessageId.trim()
                  ? rawMessage.replyToMessageId
                  : null,
              attachments,
              status:
                sender === "other"
                  ? "read"
                  : isValidStatus(rawMessage.status)
                    ? rawMessage.status
                    : "read",
            } satisfies Message;
          }),
      ] as const;
    });

  if (normalizedEntries.length === 0) {
    return fallbackChats;
  }

  return Object.fromEntries(normalizedEntries);
};

export const getQuotePreview = (
  message: Message | null,
  users: User[] = DEFAULT_USERS
): QuotePreview => {
  if (!message) {
    return {
      authorName: "Сообщение",
      text: "Исходное сообщение не найдено",
    };
  }

  const authorName = users.find((user) => user.id === message.authorId)?.name || message.authorId;
  const text = typeof message.text === "string" ? message.text : "";

  if (text.trim()) {
    return {
      authorName,
      text: text.length > 90 ? `${text.slice(0, 90)}...` : text,
    };
  }

  if (Array.isArray(message.attachments) && message.attachments.length > 0) {
    return {
      authorName,
      text: getAttachmentLabel(message.attachments[0]),
    };
  }

  return {
    authorName,
    text: "Сообщение",
  };
};

export const markMessagesAsRead = (messages: Message[], userId: string) => {
  const safeMessages = Array.isArray(messages) ? messages : [];
  let changed = false;

  const nextMessages = safeMessages.map((message) => {
    if (message.authorId === userId && message.status !== "read") {
      changed = true;
      return { ...message, status: "read" as MessageStatus };
    }

    return message;
  });

  return { changed, nextMessages };
};
