import { User } from "./types";

export const STORAGE_KEY = "messenger-chats-v13";
export const USERS_STORAGE_KEY = "messenger-users-v1";
export const CURRENT_USER_STORAGE_KEY = "messenger-current-user-v1";
export const CURRENT_CHAT_STORAGE_KEY = "messenger-current-chat-v1";
export const CURRENT_CHAT_BY_USER_STORAGE_KEY = "messenger-current-chat-by-user-v1";
export const UNREAD_STORAGE_KEY = "messenger-unread-v1";
export const MAX_FILE_SIZE_BYTES = 500 * 1024;
export const MAX_IMAGE_WIDTH = 800;
export const STORAGE_WARNING_MESSAGE = "Файл слишком большой или недостаточно памяти";
export const STORAGE_SOFT_LIMIT_BYTES = 4.4 * 1024 * 1024;
export const LEGACY_STORAGE_KEYS = [
  "messenger-chats-v12",
  "messenger-chats-v11",
  "messenger-chats-v10",
  "messenger-chats-v9",
  "messenger-chats-v8",
  "messenger-chats-v7",
  "messenger-chats-v6",
  "messenger-chats-v5",
  "messenger-chats-v4",
  "messenger-chats-v3",
];
export const REMOVED_CHAT_NAMES = ["AI ассистент", "AI Р°СЃСЃРёСЃС‚РµРЅС‚"];

export const DEFAULT_USERS: User[] = [
  { id: "me", name: "Я" },
  { id: "ivan", name: "Иван" },
  { id: "marina", name: "Марина" },
];

export const EMOJIS = [
  "😀",
  "😁",
  "😂",
  "🤣",
  "😊",
  "😍",
  "😘",
  "😎",
  "🤔",
  "😴",
  "🥳",
  "😇",
  "😡",
  "😭",
  "👍",
  "👎",
  "👏",
  "🙏",
  "🔥",
  "❤️",
  "💙",
  "💚",
  "🎉",
  "✅",
];
