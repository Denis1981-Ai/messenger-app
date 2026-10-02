const TYPING_EXPIRY_MS = 5000;

type TypingEntry = { userId: string; userName: string; expiresAt: number };

const state = new Map<string, Map<string, TypingEntry>>();

export function updateTyping(chatId: string, userId: string, userName: string): void {
  let chatMap = state.get(chatId);
  if (!chatMap) {
    chatMap = new Map();
    state.set(chatId, chatMap);
  }
  chatMap.set(userId, { userId, userName, expiresAt: Date.now() + TYPING_EXPIRY_MS });
}

export function getTypingUsers(chatId: string, excludeUserId: string): string[] {
  const chatMap = state.get(chatId);
  if (!chatMap) return [];

  const now = Date.now();
  const result: string[] = [];
  for (const [uid, entry] of chatMap.entries()) {
    if (entry.expiresAt <= now) {
      chatMap.delete(uid);
    } else if (uid !== excludeUserId) {
      result.push(entry.userName);
    }
  }
  return result;
}
