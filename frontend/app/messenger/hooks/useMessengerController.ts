"use client";

import {
  ChangeEvent,
  ClipboardEvent,
  DragEvent,
  MouseEvent as ReactMouseEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import {
  Attachment,
  ChatListFilter,
  ChatSummary,
  GlobalSearchResult,
  Message,
  MessageContextMenuState,
  Reaction,
  UploadingAttachment,
  User,
} from "../types";
import { PRESENCE_HEARTBEAT_INTERVAL_MS } from "@/lib/presence";
import { getDesktopNotificationsBridge } from "../utils/desktopNotifications";
import { playIncomingMessageSound, prepareIncomingMessageSound } from "../utils/incomingMessageSound";
import { formatMessageDate, formatMessageTime } from "../utils/format";
import { triggerAttachmentDownload } from "../utils/attachmentDownload";

const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024;
const MAX_FILES_PER_MESSAGE = 5;
const NOT_AVAILABLE_MESSAGE = "Недоступно в text pilot.";
const ACTIVE_CHAT_POLL_INTERVAL_MS = 30 * 1000; // fallback when SSE is unavailable
const CHAT_LIST_POLL_INTERVAL_MS = 8 * 1000;
const APP_TITLE = "Svarka Weld Messenger";
const FLASHING_APP_TITLE = "Новое сообщение — Svarka Weld Messenger";
const UNREAD_ATTENTION_DEBUG_KEY = "messenger:debug-unread-attention";

type SessionUser = {
  id: string;
  name: string;
  login?: string;
  displayName?: string | null;
  lastSeenAt?: string | null;
  presence?: "online" | "offline";
};

type ServerAttachment = {
  id: string;
  fileName: string;
  fileType: string;
  fileSize?: number;
  fileData: string;
};

type ServerChatSummary = ChatSummary;

type ServerMessage = {
  id: string;
  chatId: string;
  authorId: string;
  authorName: string;
  text: string;
  createdAt: string;
  editedAt?: string | null;
  replyToMessageId?: string | null;
  isPinned?: boolean;
  attachments?: ServerAttachment[];
  reactions?: Reaction[];
};

type ServerChatResponse = {
  chat: {
    id: string;
    title: string;
    isGroup: boolean;
    members: User[];
  };
  messages: ServerMessage[];
  hasMore?: boolean;
};

type LoginResponse = {
  user: SessionUser;
};

type PresenceHeartbeatResponse = {
  user: SessionUser;
};

type ReadResponse = {
  ok: true;
};

type UnreadAttentionDebugEntry = {
  at: string;
  event: string;
  details?: Record<string, string | number | boolean | null>;
};

type NotificationSnapshot = {
  messageId: string | null;
  unreadCount: number;
};

type DesktopViewState = {
  bridge: Awaited<ReturnType<typeof getDesktopNotificationsBridge>>;
  isFocused: boolean;
  isMinimized: boolean;
  isDocumentVisible: boolean;
  hasDocumentFocus: boolean;
  isViewingChat: boolean;
};

type UsersResponse = {
  users: User[];
};

type ChatsResponse = {
  chats: ServerChatSummary[];
};

type DesktopUploadFile = {
  fileName?: string;
  file_name?: string;
  fileType?: string;
  file_type?: string;
  bytes?: number[];
};

const hasTauriRuntime = () =>
  typeof window !== "undefined" &&
  typeof (window as Window & { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__ !== "undefined";

type FailedSendDraft = {
  id: string;
  chatId: string;
  text: string;
  replyToMessageId?: string | null;
  createdAt: string;
  error: string;
};

const createLocalId = () => `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;

const focusComposerInput = (
  inputRef: React.RefObject<HTMLTextAreaElement | null>,
  nextValue = ""
) => {
  requestAnimationFrame(() => {
    inputRef.current?.focus();
    const length = nextValue.length;
    inputRef.current?.setSelectionRange(length, length);
  });
};

const attachmentLabel = (fileType?: string, count = 1) => {
  if (count > 1) {
    return `📎 Файлы (${count})`;
  }

  return fileType?.startsWith("image/") ? "\u{1F5BC} \u0418\u0437\u043e\u0431\u0440\u0430\u0436\u0435\u043d\u0438\u0435" : "\u{1F4CE} \u0424\u0430\u0439\u043b";
};

const buildMessagePreviewText = (message: { text?: string; attachments?: Attachment[] | ServerAttachment[] }) => {
  const text = message.text?.trim();
  if (text) {
    return text;
  }

  const attachments = Array.isArray(message.attachments) ? message.attachments : [];
  if (attachments.length === 0) {
    return "Сообщение";
  }

  const firstAttachment = attachments[0] as Attachment | ServerAttachment;
  const fileType = "fileType" in firstAttachment ? firstAttachment.fileType : "application/octet-stream";
  return attachmentLabel(fileType, attachments.length);
};

const buildMessageCopyText = (message: { text?: string; attachments?: Attachment[] | ServerAttachment[] }) => {
  if (typeof message.text === "string" && message.text.length > 0) {
    return message.text;
  }

  return buildMessagePreviewText(message);
};

const toClientAttachment = (attachment: ServerAttachment): Attachment => ({
  id: attachment.id,
  fileName: attachment.fileName,
  fileType: attachment.fileType,
  fileData: attachment.fileData,
  fileSize: attachment.fileSize,
});

const toClientMessage = (message: ServerMessage, currentUserId: string): Message => ({
  id: message.id,
  text: message.text || "",
  sender: message.authorId === currentUserId ? "me" : "other",
  authorId: message.authorId,
  time: new Date(message.createdAt).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  }),
  createdAt: message.createdAt,
  isEdited: Boolean(message.editedAt),
  edited: Boolean(message.editedAt),
  editedAt: message.editedAt || undefined,
  replyToMessageId: message.replyToMessageId || null,
  isPinned: message.isPinned ?? false,
  attachments: Array.isArray(message.attachments)
    ? message.attachments.map(toClientAttachment)
    : [],
  reactions: Array.isArray(message.reactions) ? message.reactions : [],
  status: "delivered",
});

const getMessageTimeValue = (message: Message) => {
  const value = new Date(message.createdAt || message.time).getTime();
  return Number.isFinite(value) ? value : 0;
};

const mergeFetchedMessagesWithVisible = (
  fetchedMessages: Message[],
  visibleMessages: Message[],
  requestStartedAt: number
) => {
  const fetchedIds = new Set(fetchedMessages.map((message) => message.id));
  const latestFetchedTime = fetchedMessages.reduce(
    (latest, message) => Math.max(latest, getMessageTimeValue(message)),
    0
  );

  const preservedMessages = visibleMessages.filter((message) => {
    if (fetchedIds.has(message.id)) {
      return false;
    }

    if (message.id.startsWith("local-")) {
      return true;
    }

    const messageTime = getMessageTimeValue(message);
    return messageTime > latestFetchedTime && messageTime >= requestStartedAt - 1000;
  });

  if (preservedMessages.length === 0) {
    return fetchedMessages;
  }

  return [...fetchedMessages, ...preservedMessages]
    .sort((left, right) => getMessageTimeValue(left) - getMessageTimeValue(right))
    .filter((message, index, messages) => messages.findIndex((item) => item.id === message.id) === index);
};

const getQuotePreview = (message: Message | null, users: User[]) => {
  if (!message) {
    return {
      authorName: "Сообщение",
      text: "Исходное сообщение не найдено",
    };
  }

  const authorName = users.find((user) => user.id === message.authorId)?.name || message.authorId;
  const previewText = buildMessagePreviewText(message);

  return {
    authorName,
    text: previewText.length > 90 ? `${previewText.slice(0, 90)}...` : previewText,
  };
};

const readFileAsDataUrl = (file: File) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(typeof reader.result === "string" ? reader.result : "");
    reader.onerror = () => reject(new Error(`Не удалось прочитать файл ${file.name}.`));
    reader.readAsDataURL(file);
  });

async function fetchJson<T>(input: string, init?: RequestInit): Promise<T> {
  const isFormData = typeof FormData !== "undefined" && init?.body instanceof FormData;
  const response = await fetch(input, {
    ...init,
    headers: {
      ...(isFormData ? {} : { "Content-Type": "application/json" }),
      ...(init?.headers || {}),
    },
    credentials: "same-origin",
    cache: "no-store",
  });

  if (!response.ok) {
    const payload = await response.json().catch(() => null);
    const message =
      payload && typeof payload === "object" && "error" in payload && typeof payload.error === "string"
        ? payload.error
        : `Request failed with status ${response.status}`;
    throw new Error(message);
  }

  return response.json() as Promise<T>;
}

function recordUnreadAttentionEvent(
  event: string,
  details?: Record<string, string | number | boolean | null>
) {
  if (typeof window === "undefined") {
    return;
  }

  try {
    if (window.localStorage.getItem(UNREAD_ATTENTION_DEBUG_KEY) !== "1") {
      return;
    }
  } catch {
    return;
  }

  const target = window as typeof window & {
    __messengerUnreadAttention?: UnreadAttentionDebugEntry[];
  };

  const entry: UnreadAttentionDebugEntry = {
    at: new Date().toISOString(),
    event,
    details,
  };

  const nextEntries = [...(target.__messengerUnreadAttention || []), entry];
  target.__messengerUnreadAttention = nextEntries.slice(-100);
}

const buildNotificationSnapshot = (chats: ChatSummary[]) =>
  Object.fromEntries(
    chats
      .filter((chat) => !chat.isVirtual)
      .map((chat) => [
        chat.id,
        {
          messageId: chat.lastMessage?.id || null,
          unreadCount: typeof chat.unreadCount === "number" ? Math.max(0, chat.unreadCount) : 0,
        } satisfies NotificationSnapshot,
      ])
  );

const getDesktopNotificationTitle = (chat: ChatSummary) => {
  const authorName = chat.lastMessage?.authorName || chat.title;
  return chat.isGroup ? `${authorName} · ${chat.title}` : authorName;
};

const getDesktopNotificationBody = (chat: ChatSummary) => {
  const preview = chat.lastMessage?.text?.trim();

  if (!preview) {
    return chat.isGroup ? `${chat.title}: Новое сообщение` : "Новое сообщение";
  }

  return chat.isGroup ? `${chat.title}: ${preview}` : preview;
};

export const useMessengerController = () => {
  const [isLoaded, setIsLoaded] = useState(false);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [loginName, setLoginName] = useState("denis");
  const [loginPassword, setLoginPassword] = useState("password123");
  const [loginPending, setLoginPending] = useState(false);
  const [authError, setAuthError] = useState("");
  const [isDisplayNameSettingsOpen, setIsDisplayNameSettingsOpen] = useState(false);
  const [displayNameDraft, setDisplayNameDraft] = useState("");
  const [displayNameSavePending, setDisplayNameSavePending] = useState(false);
  const [displayNameError, setDisplayNameError] = useState("");
  const [isCreateConversationOpen, setIsCreateConversationOpen] = useState(false);
  const [createConversationTitle, setCreateConversationTitle] = useState("");
  const [createConversationMemberIds, setCreateConversationMemberIds] = useState<string[]>([]);
  const [createConversationPending, setCreateConversationPending] = useState(false);
  const [createConversationError, setCreateConversationError] = useState("");
  const [forwardingMessages, setForwardingMessages] = useState<Message[]>([]);

  const [currentUser, setCurrentUser] = useState<SessionUser | null>(null);
  const [availableUsers, setAvailableUsers] = useState<User[]>([]);
  const [chatSummaries, setChatSummaries] = useState<ChatSummary[]>([]);
  const [messagesByChat, setMessagesByChat] = useState<Record<string, Message[]>>({});
  const [currentChat, setCurrentChatState] = useState("");
  const [draftsByChat, setDraftsByChat] = useState<Record<string, string>>({});
  const [typingUsers, setTypingUsers] = useState<string[]>([]);
  const typingThrottleRef = useRef<number | null>(null);

  const [input, setInput] = useState("");
  const [newChatName, setNewChatName] = useState("");
  const [search, setSearch] = useState("");
  const [globalSearchResults, setGlobalSearchResults] = useState<GlobalSearchResult[]>([]);
  const [globalSearchPending, setGlobalSearchPending] = useState(false);
  const [chatListFilter, setChatListFilterState] = useState<ChatListFilter>("all");
  const [copySuccess, setCopySuccess] = useState("");
  const [editingMessageId, setEditingMessageId] = useState<string | null>(null);
  const [replyingToMessageId, setReplyingToMessageId] = useState<string | null>(null);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [highlightedMessageId, setHighlightedMessageId] = useState<string | null>(null);
  const [storageWarning, setStorageWarning] = useState("");
  const [isChatDragOver, setIsChatDragOver] = useState(false);
  const [isSelectionMode, setIsSelectionMode] = useState(false);
  const [selectedMessageIds, setSelectedMessageIds] = useState<string[]>([]);
  const [contextMenu, setContextMenu] = useState<MessageContextMenuState | null>(null);
  const [pendingAttachments, setPendingAttachments] = useState<Attachment[]>([]);
  const [uploadingAttachments, setUploadingAttachments] = useState<UploadingAttachment[]>([]);
  const [failedSendDrafts, setFailedSendDrafts] = useState<FailedSendDraft[]>([]);

  const [hasMoreByChat, setHasMoreByChat] = useState<Record<string, boolean>>({});
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const oldestMessageIdRef = useRef<Record<string, string | null>>({});

  const pendingFilesRef = useRef<Record<string, File>>({});
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const textInputRef = useRef<HTMLTextAreaElement | null>(null);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const emojiPickerRef = useRef<HTMLDivElement | null>(null);
  const contextMenuRef = useRef<HTMLDivElement | null>(null);
  const messageRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const highlightTimeoutRef = useRef<number | null>(null);
  const feedbackTimeoutRef = useRef<number | null>(null);
  const lastReadMarkerRef = useRef<Record<string, string>>({});
  const latestFetchedMessageIdRef = useRef<Record<string, string | null>>({});
  const desktopNotificationSnapshotRef = useRef<Record<string, NotificationSnapshot>>({});
  const desktopNotificationSessionReadyRef = useRef(false);
  const desktopNotificationCleanupRef = useRef<(() => Promise<void>) | null>(null);
  const currentChatRef = useRef("");
  const triggerActiveChatRefreshRef = useRef<(() => void) | null>(null);
  const currentUserIdRef = useRef("");
  const currentChatSummaryRef = useRef<ChatSummary | null>(null);

  const currentUserId = currentUser?.id || "";
  const canDeleteAnyMessages =
    (currentUser?.login || "").toLowerCase() === "weld.info@yandex.ru" ||
    (currentUser?.displayName || "").toLowerCase() === "weld.info@yandex.ru";
  const users = useMemo(() => (currentUser ? [currentUser, ...availableUsers] : availableUsers), [availableUsers, currentUser]);

  useEffect(() => {
    if (!currentUserId) {
      setChatListFilterState("all");
    }
  }, [currentUserId]);

  const visibleChatSummaries = useMemo(() => {
    if (!currentUser) {
      return chatSummaries;
    }

    const existingDirectUserIds = new Set(
      chatSummaries
        .filter((chat) => !chat.isGroup)
        .flatMap((chat) => chat.members)
        .map((member) => member.id)
        .filter((memberId) => memberId && memberId !== currentUser.id)
    );

    const virtualDirectChats: ChatSummary[] = availableUsers
      .filter((user) => user.id !== currentUser.id && !existingDirectUserIds.has(user.id))
      .map((user) => ({
        id: `virtual:${user.id}`,
        title: user.name,
        isGroup: false,
        updatedAt: "1970-01-01T00:00:00.000Z",
        members: [currentUser, user],
        lastMessage: null,
        isVirtual: true,
        directUserId: user.id,
      }));

    return [...chatSummaries, ...virtualDirectChats];
  }, [availableUsers, chatSummaries, currentUser]);

  const currentChatMessages = useMemo(() => messagesByChat[currentChat] || [], [messagesByChat, currentChat]);
  const currentFailedSendDrafts = useMemo(
    () => failedSendDrafts.filter((draft) => draft.chatId === currentChat),
    [currentChat, failedSendDrafts]
  );

  const messagesById = useMemo(
    () => Object.fromEntries(currentChatMessages.map((message) => [message.id, message])),
    [currentChatMessages]
  );

  const replyingToMessage = replyingToMessageId ? messagesById[replyingToMessageId] || null : null;
  const contextMenuMessage = contextMenu ? messagesById[contextMenu.messageId] || null : null;
  const pinnedMessage = useMemo(
    () => currentChatMessages.find((m) => m.isPinned) ?? null,
    [currentChatMessages]
  );
  const selectedMessages = useMemo(
    () => currentChatMessages.filter((message) => selectedMessageIds.includes(message.id)),
    [currentChatMessages, selectedMessageIds]
  );

  const pinnedChatIds = useMemo(
    () => visibleChatSummaries.filter((chat) => !chat.isVirtual && chat.isPinned).map((chat) => chat.id),
    [visibleChatSummaries]
  );
  const archivedChatIds = useMemo(
    () => visibleChatSummaries.filter((chat) => !chat.isVirtual && chat.isArchived).map((chat) => chat.id),
    [visibleChatSummaries]
  );
  const mutedChatIds = useMemo(
    () => visibleChatSummaries.filter((chat) => !chat.isVirtual && chat.isMuted).map((chat) => chat.id),
    [visibleChatSummaries]
  );

  const chatFilterCounts = useMemo(() => {
    const realChats = visibleChatSummaries.filter((chat) => !chat.isVirtual);
    const activeChats = realChats.filter((chat) => !chat.isArchived);

    return {
      all: activeChats.length + visibleChatSummaries.filter((chat) => chat.isVirtual).length,
      unread: activeChats.filter((chat) => (chat.unreadCount || 0) > 0).length,
      pinned: activeChats.filter((chat) => chat.isPinned).length,
      archive: realChats.filter((chat) => chat.isArchived).length,
    } satisfies Record<ChatListFilter, number>;
  }, [visibleChatSummaries]);

  const filteredChatSummaries = useMemo(() => {
    const query = search.trim().toLowerCase();
    const compareByUpdatedAt = (left: ChatSummary, right: ChatSummary) =>
      new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime();
    const compareForList = (left: ChatSummary, right: ChatSummary) => {
      const leftPinned = Boolean(left.isPinned);
      const rightPinned = Boolean(right.isPinned);

      if (leftPinned !== rightPinned) {
        return leftPinned ? -1 : 1;
      }

      return compareByUpdatedAt(left, right);
    };

    const visibleByFilter = visibleChatSummaries.filter((chat) => {
      const isArchived = Boolean(chat.isArchived);
      const isPinned = Boolean(chat.isPinned);
      const unreadCount = chat.unreadCount || 0;

      if (chat.isVirtual) {
        return chatListFilter === "all" && !isArchived;
      }

      if (chatListFilter === "archive") {
        return isArchived;
      }

      if (isArchived) {
        return false;
      }

      if (chatListFilter === "unread") {
        return unreadCount > 0;
      }

      if (chatListFilter === "pinned") {
        return isPinned;
      }

      return true;
    });

    const searched = !query
      ? visibleByFilter
      : visibleByFilter.filter((chat) => {
          const inTitle = chat.title.toLowerCase().includes(query);
          const inLastMessage = chat.lastMessage?.text?.toLowerCase().includes(query) || false;
          const inAuthor = chat.lastMessage?.authorName?.toLowerCase().includes(query) || false;
          const inMembers = chat.members.some(
            (member) =>
              member.name.toLowerCase().includes(query) ||
              member.login?.toLowerCase().includes(query) ||
              member.displayName?.toLowerCase().includes(query)
          );

          return inTitle || inLastMessage || inAuthor || inMembers;
        });

    if (chatListFilter === "archive") {
      return [...searched].sort(compareByUpdatedAt);
    }

    return [...searched].sort(compareForList);
  }, [chatListFilter, search, visibleChatSummaries]);

  const filteredChats = useMemo(() => filteredChatSummaries.map((chat) => chat.id), [filteredChatSummaries]);
  const createConversationCandidates = useMemo(() => availableUsers, [availableUsers]);

  const currentChatTitle = useMemo(
    () => visibleChatSummaries.find((chat) => chat.id === currentChat)?.title || currentChat,
    [visibleChatSummaries, currentChat]
  );

  const chats = useMemo(
    () => Object.fromEntries(visibleChatSummaries.map((chat) => [chat.id, messagesByChat[chat.id] || []])),
    [visibleChatSummaries, messagesByChat]
  );

  const unreadByChat = useMemo<Record<string, number>>(
    () =>
      Object.fromEntries(
        visibleChatSummaries.map((chat) => [chat.id, typeof chat.unreadCount === "number" ? chat.unreadCount : 0])
      ),
    [visibleChatSummaries]
  );
  const totalUnreadCount = useMemo(
    () => Object.values(unreadByChat).reduce((total, count) => total + Math.max(0, count), 0),
    [unreadByChat]
  );
  const currentChatSummary = useMemo(
    () => visibleChatSummaries.find((chat) => chat.id === currentChat) || null,
    [visibleChatSummaries, currentChat]
  );

  const applyUpdatedCurrentUser = useCallback((nextUser: SessionUser) => {
    setCurrentUser(nextUser);
    setChatSummaries((prev) =>
      prev.map((chat) =>
        chat.lastMessage && currentUserId && chat.lastMessage.authorName && chat.members.some((member) => member.id === currentUserId)
          ? {
              ...chat,
              lastMessage:
                chat.lastMessage && chat.members.some((member) => member.id === currentUserId)
                  ? {
                      ...chat.lastMessage,
                      authorName:
                        chat.lastMessage.authorName === (currentUser?.name || currentUser?.login || "")
                          ? nextUser.name
                          : chat.lastMessage.authorName,
                    }
                  : chat.lastMessage,
            }
          : chat
      )
    );
  }, [currentUser?.login, currentUser?.name, currentUserId]);

  const setFeedback = useCallback((message: string) => {
    setCopySuccess(message);
    if (feedbackTimeoutRef.current) {
      window.clearTimeout(feedbackTimeoutRef.current);
    }
    feedbackTimeoutRef.current = window.setTimeout(() => setCopySuccess(""), 2200);
  }, []);

  const showWarning = useCallback((message: string) => {
    setStorageWarning(message);
    if (feedbackTimeoutRef.current) {
      window.clearTimeout(feedbackTimeoutRef.current);
    }
    feedbackTimeoutRef.current = window.setTimeout(() => setStorageWarning(""), 3200);
  }, []);

  const syncDirectoryState = useCallback((usersResponse: UsersResponse, chatsResponse: ChatsResponse) => {
    setAvailableUsers(Array.isArray(usersResponse.users) ? usersResponse.users : []);
    setChatSummaries(Array.isArray(chatsResponse.chats) ? chatsResponse.chats : []);
  }, []);

  const refreshDirectoryState = useCallback(async () => {
    const [usersResponse, chatsResponse] = await Promise.all([
      fetchJson<UsersResponse>("/api/users", { method: "GET" }),
      fetchJson<ChatsResponse>("/api/chats", { method: "GET" }),
    ]);

    syncDirectoryState(usersResponse, chatsResponse);
    return { usersResponse, chatsResponse };
  }, [syncDirectoryState]);

  const resetComposer = useCallback(() => {
    setInput("");
    setEditingMessageId(null);
    setReplyingToMessageId(null);
    setShowEmojiPicker(false);
    setPendingAttachments([]);
    setUploadingAttachments([]);
    pendingFilesRef.current = {};
  }, []);

  const scrollActiveChatToBottom = useCallback(() => {
    const scroll = () => {
      messagesEndRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
    };

    requestAnimationFrame(() => {
      scroll();
      requestAnimationFrame(scroll);
    });
    window.setTimeout(scroll, 80);
    window.setTimeout(scroll, 260);
  }, []);

  const markChatRead = useCallback(async (chatId: string, latestMessageId?: string | null) => {
    if (!chatId || !latestMessageId || lastReadMarkerRef.current[chatId] === latestMessageId) {
      return;
    }

    await fetchJson<ReadResponse>(`/api/chats/${chatId}/read`, {
      method: "POST",
    });

    lastReadMarkerRef.current[chatId] = latestMessageId;
    setChatSummaries((prev) =>
      prev.map((chat) =>
        chat.id === chatId
          ? {
              ...chat,
              unreadCount: 0,
            }
          : chat
      )
    );
  }, []);

  const refreshMessages = useCallback(
    async (chatId: string, userId: string, options?: { markAsRead?: boolean }) => {
      if (!chatId) {
        return;
      }

      const requestStartedAt = Date.now();
      const response = await fetchJson<ServerChatResponse>(`/api/chats/${chatId}/messages?limit=50`, {
        method: "GET",
      });

      const clientMessages = Array.isArray(response.messages)
        ? response.messages.map((message) => toClientMessage(message, userId))
        : [];

      setMessagesByChat((prev) => ({
        ...prev,
        [chatId]: mergeFetchedMessagesWithVisible(clientMessages, prev[chatId] || [], requestStartedAt),
      }));
      latestFetchedMessageIdRef.current[chatId] = response.messages.at(-1)?.id || null;
      oldestMessageIdRef.current[chatId] = response.messages[0]?.id || null;
      setHasMoreByChat((prev) => ({ ...prev, [chatId]: response.hasMore ?? false }));

      if (options?.markAsRead) {
        const latestMessageId = response.messages.at(-1)?.id || null;
        await markChatRead(chatId, latestMessageId);
      }

      return response;
    },
    [markChatRead]
  );

  const loadMoreMessages = useCallback(async () => {
    if (!currentChat || !currentUserId || isLoadingMore) return;
    const oldestId = oldestMessageIdRef.current[currentChat];
    if (!oldestId || !hasMoreByChat[currentChat]) return;

    setIsLoadingMore(true);
    try {
      const response = await fetchJson<ServerChatResponse>(
        `/api/chats/${currentChat}/messages?limit=50&before=${encodeURIComponent(oldestId)}`,
        { method: "GET" }
      );
      const olderMessages = Array.isArray(response.messages)
        ? response.messages.map((m) => toClientMessage(m, currentUserId))
        : [];
      setMessagesByChat((prev) => ({
        ...prev,
        [currentChat]: [...olderMessages, ...(prev[currentChat] || [])],
      }));
      oldestMessageIdRef.current[currentChat] = response.messages[0]?.id || null;
      setHasMoreByChat((prev) => ({ ...prev, [currentChat]: response.hasMore ?? false }));
    } catch {
      // Keep load-more best-effort.
    } finally {
      setIsLoadingMore(false);
    }
  }, [currentChat, currentUserId, hasMoreByChat, isLoadingMore]);

  const getDesktopViewState = useCallback(
    async (chatId: string): Promise<DesktopViewState> => {
      const isDocumentVisible =
        typeof document !== "undefined" ? document.visibilityState === "visible" : true;
      const hasDocumentFocus =
        typeof document !== "undefined" && typeof document.hasFocus === "function"
          ? document.hasFocus()
          : false;

      const bridge = await getDesktopNotificationsBridge();
      const windowState = await bridge?.getWindowState();
      const isFocused = windowState ? windowState.focused : hasDocumentFocus;
      const isMinimized = windowState ? windowState.minimized : false;
      const isViewingChat =
        isDocumentVisible &&
        hasDocumentFocus &&
        isFocused &&
        !isMinimized &&
        currentChatRef.current === chatId;

      return {
        bridge,
        isFocused,
        isMinimized,
        isDocumentVisible,
        hasDocumentFocus,
        isViewingChat,
      };
    },
    []
  );

  const refreshActiveChat = useCallback(async () => {
    if (!isAuthenticated || !currentChat || !currentUserId || currentChatSummary?.isVirtual) {
      return;
    }

    await refreshMessages(currentChat, currentUserId, { markAsRead: true });
  }, [currentChat, currentChatSummary?.isVirtual, currentUserId, isAuthenticated, refreshMessages]);

  const bootstrap = useCallback(async () => {
    try {
      const me = await fetchJson<{ user: SessionUser }>("/api/auth/me", { method: "GET" });
      const { chatsResponse } = await refreshDirectoryState();

      setCurrentUser(me.user);
      setDisplayNameDraft(me.user.displayName || "");
      const nextChats = Array.isArray(chatsResponse.chats) ? chatsResponse.chats : [];
      setIsAuthenticated(true);

      const initialChatId = nextChats[0]?.id || "";
      setCurrentChatState(initialChatId);
      setMessagesByChat({});

      if (initialChatId) {
        await refreshMessages(initialChatId, me.user.id, { markAsRead: true });
      }
    } catch {
      setCurrentUser(null);
      setDisplayNameDraft("");
      setDisplayNameError("");
      setIsDisplayNameSettingsOpen(false);
      setIsCreateConversationOpen(false);
      setCreateConversationTitle("");
      setCreateConversationMemberIds([]);
      setCreateConversationError("");
      setAvailableUsers([]);
      setChatSummaries([]);
      setMessagesByChat({});
      setCurrentChatState("");
      setIsAuthenticated(false);
    } finally {
      setIsLoaded(true);
    }
  }, [refreshDirectoryState, refreshMessages]);

  useEffect(() => {
    void bootstrap();
  }, [bootstrap]);

  useEffect(() => {
    currentChatRef.current = currentChat;
  }, [currentChat]);

  useEffect(() => {
    currentUserIdRef.current = currentUserId;
  }, [currentUserId]);

  useEffect(() => {
    currentChatSummaryRef.current = currentChatSummary;
  }, [currentChatSummary]);

  useEffect(() => {
    if (typeof document === "undefined") {
      return;
    }

    const nextTitle = isAuthenticated && totalUnreadCount > 0 ? `(${totalUnreadCount}) ${APP_TITLE}` : APP_TITLE;
    document.title = nextTitle;
    recordUnreadAttentionEvent("attention-state-updated", {
      totalUnreadCount,
      isAuthenticated,
      visibilityState: document.visibilityState,
      hasFocus: typeof document.hasFocus === "function" ? document.hasFocus() : false,
    });

    if (typeof navigator === "undefined") {
      return;
    }

    const badgeNavigator = navigator as Navigator & {
      setAppBadge?: (contents?: number) => Promise<void>;
      clearAppBadge?: () => Promise<void>;
    };

    if (!isAuthenticated || totalUnreadCount <= 0) {
      void badgeNavigator.clearAppBadge?.().catch(() => {
        // Badge API is best-effort only.
      });
      recordUnreadAttentionEvent("attention-cleared", {
        totalUnreadCount,
        badgeSupported: typeof badgeNavigator.clearAppBadge === "function",
      });
      return;
    }

    void badgeNavigator.setAppBadge?.(totalUnreadCount).catch(() => {
      // Badge API is best-effort only.
    });
    recordUnreadAttentionEvent("attention-badge-set", {
      totalUnreadCount,
      badgeSupported: typeof badgeNavigator.setAppBadge === "function",
    });
  }, [isAuthenticated, totalUnreadCount]);

  useEffect(() => {
    if (typeof document === "undefined" || typeof window === "undefined") {
      return;
    }

    const isHidden = document.visibilityState !== "visible";
    const hasFocus = typeof document.hasFocus === "function" ? document.hasFocus() : true;
    const shouldFlash = isAuthenticated && totalUnreadCount > 0 && (isHidden || !hasFocus);

    if (!shouldFlash) {
      document.title = isAuthenticated && totalUnreadCount > 0 ? `(${totalUnreadCount}) ${APP_TITLE}` : APP_TITLE;
      recordUnreadAttentionEvent("attention-flash-stop", {
        totalUnreadCount,
        isHidden,
        hasFocus,
      });
      return;
    }

    let showAlertTitle = true;
    document.title = FLASHING_APP_TITLE;
    recordUnreadAttentionEvent("attention-flash-start", {
      totalUnreadCount,
      isHidden,
      hasFocus,
    });

    const intervalId = window.setInterval(() => {
      showAlertTitle = !showAlertTitle;
      document.title = showAlertTitle
        ? FLASHING_APP_TITLE
        : `(${totalUnreadCount}) ${APP_TITLE}`;
    }, 900);

    return () => {
      window.clearInterval(intervalId);
      document.title = isAuthenticated && totalUnreadCount > 0 ? `(${totalUnreadCount}) ${APP_TITLE}` : APP_TITLE;
    };
  }, [isAuthenticated, totalUnreadCount]);

  useEffect(() => {
    void getDesktopNotificationsBridge().then((bridge) =>
      bridge?.setUnreadOverlay(isAuthenticated ? totalUnreadCount : 0)
    );
  }, [isAuthenticated, totalUnreadCount]);

  useEffect(() => {
    if (!isAuthenticated) {
      desktopNotificationSessionReadyRef.current = false;
      desktopNotificationSnapshotRef.current = {};
      latestFetchedMessageIdRef.current = {};

      const cleanup = desktopNotificationCleanupRef.current;
      desktopNotificationCleanupRef.current = null;
      if (cleanup) {
        void cleanup().catch(() => {});
      }

      void getDesktopNotificationsBridge().then(async (bridge) => {
        await bridge?.clearAll();
        await bridge?.setUnreadOverlay(0);
      });
      return;
    }

    let disposed = false;

    void getDesktopNotificationsBridge().then(async (bridge) => {
      if (!bridge || disposed) {
        return;
      }

      const cleanup = await bridge.onAction(async ({ chatId }) => {
        await bridge.focusApp();

        if (!chatId || !currentUserIdRef.current) {
          return;
        }

        setCurrentChatState(chatId);

        try {
          await refreshMessages(chatId, currentUserIdRef.current, { markAsRead: true });
        } catch {
          // Keep notification click handling best-effort.
        }
      });

      if (disposed) {
        await cleanup().catch(() => {});
        return;
      }

      desktopNotificationCleanupRef.current = cleanup;
    });

    return () => {
      disposed = true;
      const cleanup = desktopNotificationCleanupRef.current;
      desktopNotificationCleanupRef.current = null;
      if (cleanup) {
        void cleanup().catch(() => {});
      }
    };
  }, [isAuthenticated, refreshMessages]);

  useEffect(() => {
    prepareIncomingMessageSound();
  }, []);

  useEffect(() => {
    if (!isAuthenticated || !currentUserId) {
      desktopNotificationSessionReadyRef.current = false;
      desktopNotificationSnapshotRef.current = {};
      latestFetchedMessageIdRef.current = {};
      return;
    }

    const nextSnapshot = buildNotificationSnapshot(visibleChatSummaries);

    if (!desktopNotificationSessionReadyRef.current) {
      desktopNotificationSnapshotRef.current = nextSnapshot;
      desktopNotificationSessionReadyRef.current = true;
      return;
    }

    const notificationCandidates = visibleChatSummaries.filter((chat) => {
      if (chat.isVirtual || !chat.lastMessage) {
        return false;
      }

      const unreadCount = typeof chat.unreadCount === "number" ? Math.max(0, chat.unreadCount) : 0;
      if (unreadCount <= 0) {
        return false;
      }

      const previous = desktopNotificationSnapshotRef.current[chat.id];
      const isNewIncomingMessage = !previous || previous.messageId !== chat.lastMessage.id;

      if (!isNewIncomingMessage) {
        return false;
      }
      return true;
    });

    desktopNotificationSnapshotRef.current = nextSnapshot;

    if (notificationCandidates.length === 0) {
      return;
    }

    let disposed = false;

    void getDesktopViewState(currentChatRef.current).then(async (viewState) => {
      if (disposed) {
        return;
      }

      const notificationsToSend = notificationCandidates.filter((chat) => {
        if (chat.isMuted) {
          recordUnreadAttentionEvent("desktop-notification-suppressed", {
            chatId: chat.id,
            reason: "chat-muted",
            isFocused: viewState.isFocused,
            isMinimized: viewState.isMinimized,
            isDocumentVisible: viewState.isDocumentVisible,
            hasDocumentFocus: viewState.hasDocumentFocus,
          });
          return false;
        }

        const shouldSuppress = viewState.isViewingChat && currentChatRef.current === chat.id;
        if (shouldSuppress) {
          recordUnreadAttentionEvent("desktop-notification-suppressed", {
            chatId: chat.id,
            reason: "chat-visible-in-focused-window",
            isFocused: viewState.isFocused,
            isMinimized: viewState.isMinimized,
            isDocumentVisible: viewState.isDocumentVisible,
            hasDocumentFocus: viewState.hasDocumentFocus,
          });
        }

        return !shouldSuppress;
      });

      if (notificationsToSend.length === 0) {
        return;
      }

      await playIncomingMessageSound().catch(() => false);

      const bridge = viewState.bridge;
      if (!bridge) {
        return;
      }

      for (const chat of notificationsToSend) {
        recordUnreadAttentionEvent("desktop-notification-send", {
          chatId: chat.id,
          unreadCount: typeof chat.unreadCount === "number" ? chat.unreadCount : 0,
          isGroup: chat.isGroup,
        });

        await bridge.send({
          title: getDesktopNotificationTitle(chat),
          body: getDesktopNotificationBody(chat),
          chatId: chat.id,
        });
      }
    });

    return () => {
      disposed = true;
    };
  }, [currentUserId, getDesktopViewState, isAuthenticated, visibleChatSummaries]);

  useEffect(() => {
    if (!isAuthenticated || !currentChat || currentChatSummary?.isVirtual) {
      return;
    }

    void refreshMessages(currentChat, currentUserId, { markAsRead: true });
  }, [currentChat, currentChatSummary?.isVirtual, currentUserId, isAuthenticated, refreshMessages]);

  useEffect(() => {
    if (!isAuthenticated) {
      return;
    }

    let isRefreshing = false;

    const pollChatList = async () => {
      if (isRefreshing) {
        return;
      }

      recordUnreadAttentionEvent("chat-list-poll-start", {
        visibilityState: document.visibilityState,
        hasFocus: typeof document.hasFocus === "function" ? document.hasFocus() : false,
      });
      isRefreshing = true;
      try {
        const { chatsResponse } = await refreshDirectoryState();
        const unreadTotal = (Array.isArray(chatsResponse.chats) ? chatsResponse.chats : []).reduce(
          (total, chat) => total + (typeof chat.unreadCount === "number" ? Math.max(0, chat.unreadCount) : 0),
          0
        );
        recordUnreadAttentionEvent("chat-list-poll-success", {
          chats: Array.isArray(chatsResponse.chats) ? chatsResponse.chats.length : 0,
          unreadTotal,
          visibilityState: document.visibilityState,
          hasFocus: typeof document.hasFocus === "function" ? document.hasFocus() : false,
        });
      } catch {
        // Keep chat list polling best-effort.
        recordUnreadAttentionEvent("chat-list-poll-error", {
          visibilityState: document.visibilityState,
          hasFocus: typeof document.hasFocus === "function" ? document.hasFocus() : false,
        });
      } finally {
        isRefreshing = false;
      }
    };

    const intervalId = window.setInterval(() => {
      void pollChatList();
    }, CHAT_LIST_POLL_INTERVAL_MS);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [isAuthenticated, refreshDirectoryState]);

  useEffect(() => {
    if (!isAuthenticated || !currentChat || currentChatSummary?.isVirtual) {
      return;
    }

    let isRefreshing = false;

    const pollActiveChat = async () => {
      if (isRefreshing) {
        return;
      }

      isRefreshing = true;
      try {
        const chatId = currentChatRef.current;
        const previousLatestMessageId = latestFetchedMessageIdRef.current[chatId] || null;
        const viewState = await getDesktopViewState(chatId);
        const response = await refreshMessages(chatId, currentUserId, {
          markAsRead: viewState.isViewingChat,
        });
        const latestMessage = response?.messages.at(-1);
        const hasNewIncomingMessage =
          Boolean(latestMessage) &&
          latestMessage?.id !== previousLatestMessageId &&
          latestMessage?.authorId !== currentUserId;

        if (!latestMessage) {
          return;
        }

        desktopNotificationSnapshotRef.current[chatId] = {
          messageId: latestMessage.id,
          unreadCount: desktopNotificationSnapshotRef.current[chatId]?.unreadCount || 0,
        };

        if (currentChatSummary?.isMuted) {
          recordUnreadAttentionEvent("desktop-notification-suppressed", {
            chatId,
            reason: "active-chat-muted",
            isFocused: viewState.isFocused,
            isMinimized: viewState.isMinimized,
            isDocumentVisible: viewState.isDocumentVisible,
            hasDocumentFocus: viewState.hasDocumentFocus,
          });
          return;
        }

        if (!hasNewIncomingMessage || viewState.isViewingChat) {
          if (viewState.isViewingChat) {
            recordUnreadAttentionEvent("desktop-notification-suppressed", {
              chatId,
              reason: "active-chat-visible-in-focused-window",
              isFocused: viewState.isFocused,
              isMinimized: viewState.isMinimized,
              isDocumentVisible: viewState.isDocumentVisible,
              hasDocumentFocus: viewState.hasDocumentFocus,
            });
          }
          return;
        }

        await playIncomingMessageSound().catch(() => false);

        recordUnreadAttentionEvent("desktop-notification-send-fast-path", {
          chatId,
          source: "active-chat-poll",
          isFocused: viewState.isFocused,
          isMinimized: viewState.isMinimized,
          isDocumentVisible: viewState.isDocumentVisible,
          hasDocumentFocus: viewState.hasDocumentFocus,
        });

        const notificationTitle = currentChatSummary?.isGroup
          ? `${latestMessage.authorName} · ${currentChatSummary.title}`
          : latestMessage.authorName;
        const notificationBody = currentChatSummary?.isGroup
          ? `${currentChatSummary.title}: ${buildMessagePreviewText({
              text: latestMessage.text,
              attachments: Array.isArray(latestMessage.attachments) ? latestMessage.attachments : [],
            })}`
          : buildMessagePreviewText({
              text: latestMessage.text,
              attachments: Array.isArray(latestMessage.attachments) ? latestMessage.attachments : [],
            });

        await viewState.bridge?.send({
          title: notificationTitle,
          body: notificationBody,
          chatId,
        });
        await refreshDirectoryState().catch(() => {});
      } catch {
        // Keep active chat polling best-effort.
      } finally {
        isRefreshing = false;
      }
    };

    triggerActiveChatRefreshRef.current = () => {
      void pollActiveChat();
    };

    const intervalId = window.setInterval(() => {
      void pollActiveChat();
    }, ACTIVE_CHAT_POLL_INTERVAL_MS);

    return () => {
      triggerActiveChatRefreshRef.current = null;
      window.clearInterval(intervalId);
    };
  }, [
    currentChat,
    currentChatSummary,
    currentChatSummary?.isVirtual,
    currentUserId,
    getDesktopViewState,
    isAuthenticated,
    refreshDirectoryState,
    refreshMessages,
  ]);

  // SSE: real-time push for active chat (replaces 4s polling; 30s polling above is the fallback)
  useEffect(() => {
    if (!isAuthenticated || !currentChat || currentChatSummary?.isVirtual) {
      return;
    }

    const since = new Date().toISOString();
    const url = `/api/sse?chatId=${encodeURIComponent(currentChat)}&since=${encodeURIComponent(since)}`;
    const eventSource = new EventSource(url);

    eventSource.addEventListener("messages", () => {
      triggerActiveChatRefreshRef.current?.();
    });

    eventSource.addEventListener("typing", (event: MessageEvent) => {
      try {
        const payload = JSON.parse(event.data) as { users: string[]; chatId: string };
        if (payload.chatId === currentChat) {
          setTypingUsers(Array.isArray(payload.users) ? payload.users : []);
        }
      } catch {}
    });

    return () => {
      eventSource.close();
    };
  }, [currentChat, currentChatSummary?.isVirtual, isAuthenticated]);

  useEffect(() => {
    if (!isAuthenticated) {
      return;
    }

    let isRefreshing = false;

    const syncVisibleState = async () => {
      if (isRefreshing) {
        return;
      }

      isRefreshing = true;
      try {
        await Promise.all([refreshDirectoryState(), refreshActiveChat()]);
      } catch {
        // Keep focus sync best-effort.
      } finally {
        isRefreshing = false;
      }
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        void syncVisibleState();
      }
    };

    const handleWindowFocus = () => {
      void syncVisibleState();
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener("focus", handleWindowFocus);

    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("focus", handleWindowFocus);
    };
  }, [isAuthenticated, refreshActiveChat, refreshDirectoryState]);

  useEffect(() => {
    setIsSelectionMode(false);
    setSelectedMessageIds([]);
    setContextMenu(null);
    setReplyingToMessageId(null);
    setEditingMessageId(null);
    setPendingAttachments([]);
    setUploadingAttachments([]);
    pendingFilesRef.current = {};
  }, [currentChat]);

  useEffect(() => {
    if (!isLoaded || !isAuthenticated) {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      textInputRef.current?.focus();
    }, 30);

    return () => window.clearTimeout(timeoutId);
  }, [currentChat, isAuthenticated, isLoaded]);

  useEffect(() => {
    const handleOutsideClick = (event: MouseEvent) => {
      if (!emojiPickerRef.current?.contains(event.target as Node)) {
        setShowEmojiPicker(false);
      }

      if (!contextMenuRef.current?.contains(event.target as Node)) {
        setContextMenu(null);
      }
    };

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setShowEmojiPicker(false);
        setContextMenu(null);
      }
    };

    document.addEventListener("mousedown", handleOutsideClick);
    document.addEventListener("keydown", handleEscape);

    return () => {
      document.removeEventListener("mousedown", handleOutsideClick);
      document.removeEventListener("keydown", handleEscape);
    };
  }, []);

  useEffect(() => {
    return () => {
      if (highlightTimeoutRef.current) {
        window.clearTimeout(highlightTimeoutRef.current);
      }

      if (feedbackTimeoutRef.current) {
        window.clearTimeout(feedbackTimeoutRef.current);
      }
    };
  }, []);

  const login = useCallback(async () => {
    setLoginPending(true);
    setAuthError("");

    try {
      const loginResponse = await fetchJson<LoginResponse>("/api/auth/login", {
        method: "POST",
        body: JSON.stringify({
          login: loginName.trim(),
          password: loginPassword.trim(),
        }),
      });
      const { chatsResponse } = await refreshDirectoryState();

      setCurrentUser(loginResponse.user);
      setDisplayNameDraft(loginResponse.user.displayName || "");
      setDisplayNameError("");
      setIsDisplayNameSettingsOpen(false);
      const nextChats = Array.isArray(chatsResponse.chats) ? chatsResponse.chats : [];
      setIsAuthenticated(true);
      setIsLoaded(true);

      const initialChatId = nextChats[0]?.id || "";
      setCurrentChatState(initialChatId);
      setMessagesByChat({});

      if (initialChatId) {
        await refreshMessages(initialChatId, loginResponse.user.id, { markAsRead: true });
      }
    } catch (error) {
      setAuthError(error instanceof Error ? error.message : "Ошибка входа.");
      setIsAuthenticated(false);
    } finally {
      setLoginPending(false);
    }
  }, [loginName, loginPassword, refreshDirectoryState, refreshMessages]);

  useEffect(() => {
    if (!isAuthenticated) {
      return;
    }

    let isMounted = true;

    const sendHeartbeat = async () => {
      try {
        const [heartbeatResponse] = await Promise.all([
          fetchJson<PresenceHeartbeatResponse>("/api/presence/heartbeat", { method: "POST" }),
          refreshDirectoryState(),
        ]);

        if (!isMounted) {
          return;
        }

        setCurrentUser(heartbeatResponse.user);
      } catch {
        // Keep the current session flow unchanged; presence is best-effort.
      }
    };

    void sendHeartbeat();
    const intervalId = window.setInterval(() => {
      if (document.visibilityState === "visible") {
        void sendHeartbeat();
      }
    }, PRESENCE_HEARTBEAT_INTERVAL_MS);

    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        void sendHeartbeat();
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      isMounted = false;
      window.clearInterval(intervalId);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [isAuthenticated, refreshDirectoryState]);

  const logout = useCallback(async () => {
    try {
      await fetchJson<{ ok: true }>("/api/auth/logout", { method: "POST" });
    } catch {}

    setIsAuthenticated(false);
    setCurrentUser(null);
    setDisplayNameDraft("");
    setDisplayNameError("");
    setIsDisplayNameSettingsOpen(false);
    setIsCreateConversationOpen(false);
    setCreateConversationTitle("");
    setCreateConversationMemberIds([]);
    setCreateConversationError("");
    setAvailableUsers([]);
    setChatSummaries([]);
    setMessagesByChat({});
    lastReadMarkerRef.current = {};
    setCurrentChatState("");
    setSearch("");
    resetComposer();
    setSelectedMessageIds([]);
    setIsSelectionMode(false);
    setContextMenu(null);
  }, [resetComposer]);

  const setCurrentChat = useCallback(
    (chatId: string) => {
      setDraftsByChat((prev) => {
        const currentInput = textInputRef.current?.value ?? "";
        if (!currentInput.trim()) {
          const next = { ...prev };
          delete next[currentChat];
          return next;
        }
        return { ...prev, [currentChat]: currentInput };
      });
      setInput(draftsByChat[chatId] || "");
      setCurrentChatState(chatId);
      setEditingMessageId(null);
      setReplyingToMessageId(null);
      setShowEmojiPicker(false);
      setPendingAttachments([]);
      setUploadingAttachments([]);
    },
    [currentChat, draftsByChat]
  );

  const openDisplayNameSettings = useCallback(() => {
    setDisplayNameDraft(currentUser?.displayName || "");
    setDisplayNameError("");
    setIsDisplayNameSettingsOpen(true);
  }, [currentUser?.displayName]);

  const closeDisplayNameSettings = useCallback(() => {
    setDisplayNameDraft(currentUser?.displayName || "");
    setDisplayNameError("");
    setIsDisplayNameSettingsOpen(false);
  }, [currentUser?.displayName]);

  const saveDisplayName = useCallback(async () => {
    setDisplayNameSavePending(true);
    setDisplayNameError("");

    try {
      const response = await fetchJson<{ user: SessionUser }>("/api/settings/display-name", {
        method: "PATCH",
        body: JSON.stringify({
          displayName: displayNameDraft,
        }),
      });

      applyUpdatedCurrentUser(response.user);
      setDisplayNameDraft(response.user.displayName || "");
      setIsDisplayNameSettingsOpen(false);
    } catch (error) {
      setDisplayNameError(error instanceof Error ? error.message : "\u041d\u0435 \u0443\u0434\u0430\u043b\u043e\u0441\u044c \u0441\u043e\u0445\u0440\u0430\u043d\u0438\u0442\u044c \u0438\u043c\u044f.");
    } finally {
      setDisplayNameSavePending(false);
    }
  }, [applyUpdatedCurrentUser, displayNameDraft]);

  const openCreateConversation = useCallback(() => {
    setCreateConversationTitle("");
    setCreateConversationMemberIds([]);
    setCreateConversationError("");
    setIsCreateConversationOpen(true);
  }, []);

  const closeCreateConversation = useCallback(() => {
    setCreateConversationTitle("");
    setCreateConversationMemberIds([]);
    setCreateConversationError("");
    setIsCreateConversationOpen(false);
  }, []);

  const toggleCreateConversationMember = useCallback((userId: string) => {
    setCreateConversationMemberIds((prev) =>
      prev.includes(userId) ? prev.filter((id) => id !== userId) : [...prev, userId]
    );
  }, []);

  const createConversation = useCallback(async () => {
    const uniqueMemberIds = Array.from(new Set(createConversationMemberIds));
    const trimmedTitle = createConversationTitle.trim();
    const isGroupConversation = uniqueMemberIds.length > 1 || trimmedTitle.length > 0;

    if (uniqueMemberIds.length === 0) {
      setCreateConversationError("???????? ???? ?? ?????? ?????????.");
      return;
    }

    if (isGroupConversation && uniqueMemberIds.length < 2) {
      setCreateConversationError("??? ?????? ????? ??????? ??????? ???? ??????????.");
      return;
    }

    if (isGroupConversation && !trimmedTitle) {
      setCreateConversationError("??????? ???????? ??????.");
      return;
    }

    setCreateConversationPending(true);
    setCreateConversationError("");

    try {
      const response = await fetchJson<{ chat: ChatSummary }>("/api/chats", {
        method: "POST",
        body: JSON.stringify({
          title: isGroupConversation ? trimmedTitle : undefined,
          memberIds: uniqueMemberIds,
        }),
      });

      const nextChat = response.chat;
      setChatSummaries((prev) => {
        const nextItems = [nextChat, ...prev.filter((chat) => chat.id !== nextChat.id)];
        return nextItems.sort(
          (left, right) => new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime()
        );
      });

      setCurrentChatState(nextChat.id);
      setMessagesByChat((prev) => ({ ...prev, [nextChat.id]: prev[nextChat.id] || [] }));
      await refreshMessages(nextChat.id, currentUserId, { markAsRead: true });
      closeCreateConversation();
    } catch (error) {
      setCreateConversationError(error instanceof Error ? error.message : "?? ??????? ??????? ??????.");
    } finally {
      setCreateConversationPending(false);
    }
  }, [closeCreateConversation, createConversationMemberIds, createConversationTitle, currentUserId, refreshMessages]);

  const createChat = useCallback((nameOverride?: string) => {
    if (typeof nameOverride === "string" && nameOverride.trim()) {
      const normalized = nameOverride.trim().toLowerCase();
      const targetUser = availableUsers.find((user) => {
        const resolvedName = user.name.toLowerCase();
        const login = (user.login || "").toLowerCase();
        return resolvedName === normalized || login === normalized;
      });

      if (targetUser) {
        setCreateConversationTitle("");
        setCreateConversationMemberIds([targetUser.id]);
      }
    }

    setCreateConversationError("");
    setIsCreateConversationOpen(true);
  }, [availableUsers]);

  const ensureActiveChatId = useCallback(async () => {
    const selectedChatId = currentChatRef.current || currentChat;
    const selectedChatSummary = currentChatSummaryRef.current;

    if (!selectedChatSummary?.isVirtual || !selectedChatSummary.directUserId) {
      return selectedChatId;
    }

    const response = await fetchJson<{ chat: ChatSummary }>("/api/chats", {
      method: "POST",
      body: JSON.stringify({
        memberIds: [selectedChatSummary.directUserId],
      }),
    });

    const nextChat = response.chat;
    setChatSummaries((prev) => {
      const nextItems = [nextChat, ...prev.filter((chat) => chat.id !== nextChat.id)];
      return nextItems.sort(
        (left, right) => new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime()
      );
    });
    setCurrentChatState(nextChat.id);
    setMessagesByChat((prev) => ({ ...prev, [nextChat.id]: prev[nextChat.id] || [] }));
    await refreshMessages(nextChat.id, currentUserId, { markAsRead: true });
    return nextChat.id;
  }, [currentChat, currentUserId, refreshMessages]);

  const appendOptimisticMessage = useCallback(
    (chatId: string, text: string, attachments: Attachment[], replyToMessageId?: string | null) => {
      const now = new Date();
      const localId = `local-${createLocalId()}`;
      const optimisticMessage: Message = {
        id: localId,
        text,
        sender: "me",
        authorId: currentUserId,
        time: now.toLocaleTimeString("ru-RU", {
          hour: "2-digit",
          minute: "2-digit",
        }),
        createdAt: now.toISOString(),
        status: "sent",
        replyToMessageId: replyToMessageId || null,
        attachments,
        reactions: [],
      };

      setMessagesByChat((prev) => ({
        ...prev,
        [chatId]: [...(prev[chatId] || []), optimisticMessage],
      }));

      setChatSummaries((prev) =>
        prev
          .map((chat) =>
            chat.id === chatId
              ? {
                  ...chat,
                  updatedAt: optimisticMessage.createdAt || now.toISOString(),
                  lastMessage: {
                    id: localId,
                    text: buildMessagePreviewText({ text, attachments }),
                    createdAt: optimisticMessage.createdAt || now.toISOString(),
                    authorName: currentUser?.name || "Денис",
                  },
                }
              : chat
          )
          .sort((left, right) => new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime())
      );

      scrollActiveChatToBottom();
      return localId;
    },
    [currentUser?.name, currentUserId, scrollActiveChatToBottom]
  );

  const removeOptimisticMessage = useCallback((chatId: string, localMessageId: string | null) => {
    if (!localMessageId) {
      return;
    }

    setMessagesByChat((prev) => ({
      ...prev,
      [chatId]: (prev[chatId] || []).filter((message) => message.id !== localMessageId),
    }));
  }, []);

  const syncCreatedMessage = useCallback(
    (chatId: string, serverMessage: ServerMessage, options?: { replaceMessageId?: string | null }) => {
      const clientMessage = toClientMessage(serverMessage, currentUserId);

      setMessagesByChat((prev) => {
        const previousMessages = prev[chatId] || [];
        const replaceMessageId = options?.replaceMessageId || "";
        const existingIndex = previousMessages.findIndex(
          (message) => message.id === replaceMessageId || message.id === serverMessage.id
        );
        const nextMessages =
          existingIndex >= 0
            ? previousMessages.map((message, index) => (index === existingIndex ? clientMessage : message))
            : [...previousMessages, clientMessage];

        return {
          ...prev,
          [chatId]: nextMessages.filter(
            (message, index, messages) => messages.findIndex((item) => item.id === message.id) === index
          ),
        };
      });

      setChatSummaries((prev) =>
        prev
          .map((chat) =>
            chat.id === chatId
              ? {
                  ...chat,
                  updatedAt: serverMessage.createdAt,
                  lastMessage: {
                    id: serverMessage.id,
                    text: buildMessagePreviewText({
                      text: serverMessage.text,
                      attachments: Array.isArray(serverMessage.attachments)
                        ? serverMessage.attachments.map(toClientAttachment)
                        : [],
                    }),
                    createdAt: serverMessage.createdAt,
                    authorName: currentUser?.name || serverMessage.authorName,
                  },
                }
              : chat
          )
          .sort((left, right) => new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime())
      );
    },
    [currentUser?.name, currentUserId]
  );

  const revealSentMessage = useCallback(
    (chatId: string) => {
      if (!chatId) {
        return;
      }

      if (currentChatRef.current !== chatId) {
        currentChatRef.current = chatId;
        setCurrentChatState(chatId);
      }

      scrollActiveChatToBottom();
    },
    [scrollActiveChatToBottom]
  );

  const sendMessage = useCallback(async () => {
    const text = input.trim();
    const selectedChatId = currentChatRef.current || currentChat;

    if (!selectedChatId) {
      return;
    }

    if (editingMessageId) {
      if (!text) {
        return;
      }

      try {
        const response = await fetchJson<{ message: ServerMessage }>(
          `/api/chats/${selectedChatId}/messages/${editingMessageId}`,
          {
            method: "PATCH",
            body: JSON.stringify({
              text,
            }),
          }
        );

        setMessagesByChat((prev) => ({
          ...prev,
          [selectedChatId]: (prev[selectedChatId] || []).map((message) =>
            message.id === editingMessageId ? toClientMessage(response.message, currentUserId) : message
          ),
        }));

        await refreshDirectoryState().catch(() => {});
        revealSentMessage(response.message.chatId || selectedChatId);
        resetComposer();
      } catch (error) {
        showWarning(error instanceof Error ? error.message : "Не удалось изменить сообщение.");
      }
      return;
    }

    if (!text && pendingAttachments.length === 0) {
      return;
    }

    let activeChatId = selectedChatId;

    try {
      activeChatId = await ensureActiveChatId();
    } catch (error) {
      showWarning(error instanceof Error ? error.message : "?? ??????? ??????? ??????.");
      return;
    }

    if (pendingAttachments.length > 0) {
      const pendingIds = pendingAttachments.map((attachment) => attachment.id);
      const files = pendingIds
        .map((id) => pendingFilesRef.current[id])
        .filter((value): value is File => value instanceof File);

      if (files.length !== pendingAttachments.length) {
        showWarning("?? ??????? ??????????? ??? ????? ? ????????.");
        return;
      }

      setUploadingAttachments(
        pendingAttachments.map((attachment) => ({
          id: attachment.id,
          fileName: attachment.fileName,
          fileType: attachment.fileType,
          progress: 15,
        }))
      );

      const formData = new FormData();
      formData.append("text", text);
      if (replyingToMessageId) {
        formData.append("replyToMessageId", replyingToMessageId);
      }
      files.forEach((file) => formData.append("files", file, file.name));

      const optimisticMessageId = appendOptimisticMessage(
        activeChatId,
        text,
        pendingAttachments,
        replyingToMessageId
      );
      scrollActiveChatToBottom();

      try {
        setUploadingAttachments((prev) => prev.map((item) => ({ ...item, progress: 55 })));
        const response = await fetchJson<{ message: ServerMessage }>(`/api/chats/${activeChatId}/attachments`, {
          method: "POST",
          body: formData,
        });
        setUploadingAttachments((prev) => prev.map((item) => ({ ...item, progress: 100 })));
        const confirmedChatId = response.message.chatId || activeChatId;
        if (confirmedChatId !== activeChatId) {
          removeOptimisticMessage(activeChatId, optimisticMessageId);
        }
        syncCreatedMessage(confirmedChatId, response.message, {
          replaceMessageId: confirmedChatId === activeChatId ? optimisticMessageId : null,
        });
        revealSentMessage(confirmedChatId);
        resetComposer();
      } catch (error) {
        setUploadingAttachments([]);
        removeOptimisticMessage(activeChatId, optimisticMessageId);
        showWarning(error instanceof Error ? error.message : "?? ??????? ????????? ?????.");
      }
      return;
    }

    const optimisticMessageId = appendOptimisticMessage(activeChatId, text, [], replyingToMessageId);
    scrollActiveChatToBottom();

    try {
      const response = await fetchJson<{ message: ServerMessage }>(`/api/chats/${activeChatId}/messages`, {
        method: "POST",
        body: JSON.stringify({
          text,
          replyToMessageId: replyingToMessageId || null,
        }),
      });

      const confirmedChatId = response.message.chatId || activeChatId;
      if (confirmedChatId !== activeChatId) {
        removeOptimisticMessage(activeChatId, optimisticMessageId);
      }
      syncCreatedMessage(confirmedChatId, response.message, {
        replaceMessageId: confirmedChatId === activeChatId ? optimisticMessageId : null,
      });
      revealSentMessage(confirmedChatId);
      resetComposer();
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Не удалось отправить сообщение.";
      removeOptimisticMessage(activeChatId, optimisticMessageId);
      setFailedSendDrafts((prev) => [
        {
          id: createLocalId(),
          chatId: activeChatId,
          text,
          replyToMessageId: replyingToMessageId || null,
          createdAt: new Date().toISOString(),
          error: errorMessage,
        },
        ...prev.filter((draft) => !(draft.chatId === activeChatId && draft.text === text)),
      ].slice(0, 12));
      showWarning(`${errorMessage} Сообщение сохранено для повтора.`);
    }
  }, [
    appendOptimisticMessage,
    currentChat,
    currentUserId,
    editingMessageId,
    ensureActiveChatId,
    input,
    pendingAttachments,
    revealSentMessage,
    replyingToMessageId,
    refreshDirectoryState,
    removeOptimisticMessage,
    resetComposer,
    scrollActiveChatToBottom,
    showWarning,
    syncCreatedMessage,
  ]);

  const retryFailedSend = useCallback(
    async (draftId: string) => {
      const draft = failedSendDrafts.find((item) => item.id === draftId);
      if (!draft) {
        return;
      }

      try {
        const response = await fetchJson<{ message: ServerMessage }>(`/api/chats/${draft.chatId}/messages`, {
          method: "POST",
          body: JSON.stringify({
            text: draft.text,
            replyToMessageId: draft.replyToMessageId || null,
          }),
        });

        syncCreatedMessage(draft.chatId, response.message);
        setFailedSendDrafts((prev) => prev.filter((item) => item.id !== draftId));
        revealSentMessage(response.message.chatId || draft.chatId);
        setFeedback("Сообщение отправлено");
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : "Не удалось отправить сообщение.";
        setFailedSendDrafts((prev) =>
          prev.map((item) =>
            item.id === draftId
              ? {
                  ...item,
                  error: errorMessage,
                }
              : item
          )
        );
        showWarning(errorMessage);
      }
    },
    [failedSendDrafts, revealSentMessage, setFeedback, showWarning, syncCreatedMessage]
  );

  const discardFailedSend = useCallback((draftId: string) => {
    setFailedSendDrafts((prev) => prev.filter((item) => item.id !== draftId));
  }, []);

  const renameCurrentChat = useCallback(() => {
    setFeedback(NOT_AVAILABLE_MESSAGE);
  }, [setFeedback]);

  const setChatListFilter = useCallback((filter: ChatListFilter) => {
    setChatListFilterState(filter);
  }, []);

  const patchChatPreferences = useCallback(
    async (
      chatId: string,
      nextPreferences: Partial<Pick<ChatSummary, "isPinned" | "isArchived" | "isMuted">>,
      failureMessage = "Не удалось сохранить настройки чата."
    ) => {
      if (!chatId || chatId.startsWith("virtual:")) {
        return;
      }

      const previousChat = chatSummaries.find((chat) => chat.id === chatId);
      if (!previousChat) {
        return;
      }

      const normalizedPreferences =
        nextPreferences.isArchived === true
          ? { ...nextPreferences, isPinned: false }
          : nextPreferences;

      setChatSummaries((prev) =>
        prev.map((chat) =>
          chat.id === chatId
            ? {
                ...chat,
                ...normalizedPreferences,
              }
            : chat
        )
      );

      try {
        const response = await fetchJson<{
          preferences: Pick<ChatSummary, "id" | "isPinned" | "isArchived" | "isMuted"> & { chatId?: string };
        }>(`/api/chats/${chatId}/preferences`, {
          method: "PATCH",
          body: JSON.stringify(normalizedPreferences),
        });

        setChatSummaries((prev) =>
          prev.map((chat) =>
            chat.id === chatId
              ? {
                  ...chat,
                  isPinned: response.preferences.isPinned ?? false,
                  isArchived: response.preferences.isArchived ?? false,
                  isMuted: response.preferences.isMuted ?? false,
                }
              : chat
          )
        );
      } catch (error) {
        setChatSummaries((prev) => prev.map((chat) => (chat.id === chatId ? previousChat : chat)));
        showWarning(error instanceof Error ? error.message : failureMessage);
      }
    },
    [chatSummaries, showWarning]
  );

  useEffect(() => {
    if (!isAuthenticated) {
      setGlobalSearchResults([]);
      setGlobalSearchPending(false);
      return;
    }

    const query = search.trim();
    if (query.length < 2) {
      setGlobalSearchResults([]);
      setGlobalSearchPending(false);
      return;
    }

    const abortController = new AbortController();
    const timeoutId = window.setTimeout(() => {
      setGlobalSearchPending(true);
      void fetchJson<{ results: GlobalSearchResult[] }>(
        `/api/search?q=${encodeURIComponent(query)}&limit=10`,
        {
          method: "GET",
          signal: abortController.signal,
        }
      )
        .then((response) => {
          if (!abortController.signal.aborted) {
            setGlobalSearchResults(Array.isArray(response.results) ? response.results : []);
          }
        })
        .catch((error) => {
          if (!abortController.signal.aborted && error instanceof Error && error.name !== "AbortError") {
            setGlobalSearchResults([]);
          }
        })
        .finally(() => {
          if (!abortController.signal.aborted) {
            setGlobalSearchPending(false);
          }
        });
    }, 260);

    return () => {
      window.clearTimeout(timeoutId);
      abortController.abort();
    };
  }, [isAuthenticated, search]);

  const togglePinnedChat = useCallback((chatId: string) => {
    if (!chatId || chatId.startsWith("virtual:")) {
      return;
    }

    const chat = chatSummaries.find((item) => item.id === chatId);
    if (!chat) {
      return;
    }

    void patchChatPreferences(chatId, {
      isPinned: !chat.isPinned,
      isArchived: false,
    });
  }, [chatSummaries, patchChatPreferences]);

  const toggleArchivedChat = useCallback(
    (chatId: string) => {
      if (!chatId || chatId.startsWith("virtual:")) {
        return;
      }

      const chat = chatSummaries.find((item) => item.id === chatId);
      if (!chat) {
        return;
      }

      const willArchive = !chat.isArchived;
      void patchChatPreferences(chatId, {
        isArchived: willArchive,
        ...(willArchive ? { isPinned: false } : {}),
      });

      if (willArchive && currentChat === chatId) {
        const nextChat = visibleChatSummaries.find(
          (item) => item.id !== chatId && !item.isVirtual && !item.isArchived
        );
        setCurrentChatState(nextChat?.id || "");
      }

      setFeedback(willArchive ? "Чат отправлен в архив" : "Чат возвращён из архива");
    },
    [chatSummaries, currentChat, patchChatPreferences, setFeedback, visibleChatSummaries]
  );

  const toggleMutedChat = useCallback(
    (chatId: string) => {
      if (!chatId || chatId.startsWith("virtual:")) {
        return;
      }

      const chat = chatSummaries.find((item) => item.id === chatId);
      if (!chat) {
        return;
      }

      void patchChatPreferences(chatId, {
        isMuted: !chat.isMuted,
      });
      setFeedback(chat.isMuted ? "Уведомления включены" : "Уведомления отключены");
    },
    [chatSummaries, patchChatPreferences, setFeedback]
  );

  const deleteChat = useCallback(
    (chatId?: string) => {
      if (!chatId) {
        setFeedback("Выберите чат");
        return;
      }

      toggleArchivedChat(chatId);
    },
    [setFeedback, toggleArchivedChat]
  );

  const startEditingMessage = useCallback(
    (messageId: string) => {
      const message = currentChatMessages.find((item) => item.id === messageId);

      if (!message || message.authorId !== currentUserId) {
        return;
      }

      if (!message.text?.trim()) {
        setFeedback("Можно редактировать только текст сообщения.");
        return;
      }

      setReplyingToMessageId(null);
      setShowEmojiPicker(false);
      setPendingAttachments([]);
      setUploadingAttachments([]);
      pendingFilesRef.current = {};
      setEditingMessageId(message.id);
      setInput(message.text);
      focusComposerInput(textInputRef, message.text);
    },
    [currentChatMessages, currentUserId, setFeedback]
  );

  const startReplyToMessage = useCallback(
    (messageId: string) => {
      setEditingMessageId(null);
      setReplyingToMessageId(messageId);
      focusComposerInput(textInputRef, input);
    },
    [input]
  );

  const cancelEditing = useCallback(() => {
    setEditingMessageId(null);
    setReplyingToMessageId(null);
    setShowEmojiPicker(false);
    setInput("");
  }, []);

  const scrollToMessage = useCallback((messageId: string) => {
    const node = messageRefs.current[messageId];
    if (!node) {
      return;
    }

    node.scrollIntoView({ behavior: "smooth", block: "center" });
    setHighlightedMessageId(messageId);

    if (highlightTimeoutRef.current) {
      window.clearTimeout(highlightTimeoutRef.current);
    }

    highlightTimeoutRef.current = window.setTimeout(() => setHighlightedMessageId(null), 1800);
  }, []);

  const openGlobalSearchResult = useCallback(
    (result: GlobalSearchResult) => {
      setCurrentChat(result.chatId);
      setSearch("");
      void refreshMessages(result.chatId, currentUserId, { markAsRead: true }).then(() => {
        window.setTimeout(() => scrollToMessage(result.id), 80);
      });
    },
    [currentUserId, refreshMessages, scrollToMessage, setCurrentChat]
  );

  const copySingleMessage = useCallback(
    async (messageId: string) => {
      const message = currentChatMessages.find((item) => item.id === messageId);
      if (!message) {
        return;
      }

      const text = buildMessageCopyText(message);

      try {
        await navigator.clipboard.writeText(text);
        setFeedback("Скопировано");
      } catch {
        setFeedback("Ошибка копирования");
      }
    },
    [currentChatMessages, setFeedback]
  );

  const copyCurrentChat = useCallback(async () => {
    const text = currentChatMessages.length
      ? currentChatMessages
          .map((message) => {
            const authorName = users.find((user) => user.id === message.authorId)?.name || message.authorId;
            return `${authorName} (${formatMessageDate(message)} ${formatMessageTime(message)}): ${buildMessagePreviewText(message)}`;
          })
          .join("\n")
      : "Чат пуст";

    try {
      await navigator.clipboard.writeText(text);
      setFeedback("Скопировано");
    } catch {
      setFeedback("Ошибка копирования");
    }
  }, [currentChatMessages, setFeedback, users]);

  const toggleSelectionMode = useCallback(() => {
    setIsSelectionMode((prev) => !prev);
    setSelectedMessageIds([]);
  }, []);

  const toggleMessageSelection = useCallback((messageId: string) => {
    setSelectedMessageIds((prev) =>
      prev.includes(messageId) ? prev.filter((id) => id !== messageId) : [...prev, messageId]
    );
  }, []);

  const copySelectedMessages = useCallback(async () => {
    const text = selectedMessages
      .map((message) => buildMessageCopyText(message))
      .join("\n");

    if (!text) {
      return;
    }

    try {
      await navigator.clipboard.writeText(text);
      setFeedback("Скопировано");
      setSelectedMessageIds([]);
      setIsSelectionMode(false);
    } catch {
      setFeedback("Ошибка копирования");
    }
  }, [selectedMessages, setFeedback]);

  const forwardSelectedMessages = useCallback(() => {
    if (selectedMessages.length === 0) {
      setFeedback("Выберите сообщения");
      return;
    }

    setForwardingMessages(selectedMessages);
    setIsSelectionMode(false);
    setSelectedMessageIds([]);
  }, [selectedMessages, setFeedback]);

  const openForwardMessage = useCallback((messageId: string) => {
    const message = currentChatMessages.find((m) => m.id === messageId) ?? null;
    setForwardingMessages(message ? [message] : []);
  }, [currentChatMessages]);

  const closeForwardMessage = useCallback(() => {
    setForwardingMessages([]);
  }, []);

  const executeForward = useCallback(async (targetChatId: string) => {
    if (forwardingMessages.length === 0) return;

    const forwardMessageIds = forwardingMessages.map((message) => message.id);

    try {
      const response = await fetchJson<{ message?: ServerMessage | null; messages?: ServerMessage[] }>(
        "/api/chats/" + targetChatId + "/messages",
        {
          method: "POST",
          body: JSON.stringify({ forwardMessageIds }),
        }
      );

      const createdMessages = Array.isArray(response.messages)
        ? response.messages
        : response.message
          ? [response.message]
          : [];

      for (const message of createdMessages) {
        syncCreatedMessage(targetChatId, message);
      }

      await refreshDirectoryState().catch(() => {});
      setForwardingMessages([]);
      setFeedback(createdMessages.length > 1 ? "Сообщения пересланы" : "Сообщение переслано");
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : "Не удалось переслать.");
    }
  }, [forwardingMessages, refreshDirectoryState, setFeedback, syncCreatedMessage]);

  const forwardingMessage = forwardingMessages[0] || null;
  const forwardingMessageCount = forwardingMessages.length;

  const getForwardingPreviewText = useCallback(() => {
    if (forwardingMessages.length === 0) {
      return "";
    }

    if (forwardingMessages.length > 1) {
      return `${forwardingMessages.length} сообщ.`;
    }

    return buildMessagePreviewText(forwardingMessages[0]);
  }, [forwardingMessages]);

  const hasForwardableMessages = useMemo(
    () =>
      forwardingMessages.some(
        (message) => message.text.trim().length > 0 || (Array.isArray(message.attachments) && message.attachments.length > 0)
      ),
    [forwardingMessages]
  );

  useEffect(() => {
    if (forwardingMessages.length > 0 && !hasForwardableMessages) {
      setForwardingMessages([]);
    }
  }, [forwardingMessages.length, hasForwardableMessages]);

  const canExecuteForward = forwardingMessages.length > 0 && hasForwardableMessages;

  const executeForwardIfPossible = useCallback(async (targetChatId: string) => {
    if (!canExecuteForward) {
      return;
    }

    await executeForward(targetChatId);
  }, [canExecuteForward, executeForward]);

  const deleteSelectedMessages = useCallback(() => {
    setFeedback(NOT_AVAILABLE_MESSAGE);
  }, [setFeedback]);

  const openContextMenu = useCallback((event: ReactMouseEvent<HTMLDivElement>, messageId: string) => {
    const selection =
      typeof window !== "undefined" && typeof window.getSelection === "function" ? window.getSelection() : null;
    const selectedText = selection?.toString().trim() || "";
    const currentTarget = event.currentTarget;
    const anchorNode = selection?.anchorNode || null;
    const focusNode = selection?.focusNode || null;
    const hasSelectionInsideMessage =
      Boolean(selectedText) &&
      Boolean(anchorNode) &&
      Boolean(focusNode) &&
      currentTarget.contains(anchorNode) &&
      currentTarget.contains(focusNode);

    if (hasSelectionInsideMessage) {
      setContextMenu(null);
      return;
    }

    event.preventDefault();
    event.stopPropagation();

    const menuWidth = 238;
    const menuHeight = 220;
    const margin = 12;
    const x = Math.min(event.clientX, window.innerWidth - menuWidth - margin);
    const y = Math.min(event.clientY, window.innerHeight - menuHeight - margin);

    setContextMenu({
      messageId,
      x: Math.max(margin, x),
      y: Math.max(margin, y),
    });
  }, []);

  const downloadMessageAttachments = useCallback(
    async (messageId: string) => {
      const message = currentChatMessages.find((item) => item.id === messageId);
      const attachments = message?.attachments || [];
      if (attachments.length === 0) {
        return;
      }

      for (const attachment of attachments) {
        await triggerAttachmentDownload(attachment.fileData, attachment.fileName);
      }
    },
    [currentChatMessages]
  );

  const toggleReaction = useCallback(async (messageId: string, emoji: string) => {
    if (!currentChat) return;
    try {
      const response = await fetchJson<{ reactions: Reaction[] }>(
        "/api/chats/" + currentChat + "/messages/" + messageId + "/reactions",
        { method: "POST", body: JSON.stringify({ emoji }) }
      );
      setMessagesByChat((prev) => ({
        ...prev,
        [currentChat]: (prev[currentChat] || []).map((m) =>
          m.id === messageId ? { ...m, reactions: response.reactions } : m
        ),
      }));
    } catch {}
  }, [currentChat]);

  const toggleContextMenuReaction = useCallback(
    async (emoji: string) => {
      const messageId = contextMenu?.messageId;
      if (!messageId) {
        return;
      }

      await toggleReaction(messageId, emoji);
      setContextMenu(null);
    },
    [contextMenu?.messageId, toggleReaction]
  );

  const pinMessage = useCallback(async (messageId: string, pin: boolean) => {
    if (!currentChat) return;
    try {
      const response = await fetchJson<{ message: ServerMessage }>(
        "/api/chats/" + currentChat + "/messages/" + messageId,
        { method: "PATCH", body: JSON.stringify({ pin }) }
      );
      setMessagesByChat((prev) => ({
        ...prev,
        [currentChat]: (prev[currentChat] || []).map((m) => {
          if (pin) {
            return m.id === messageId
              ? toClientMessage(response.message, currentUserId)
              : { ...m, isPinned: false };
          }
          return m.id === messageId ? { ...m, isPinned: false } : m;
        }),
      }));
    } catch {}
  }, [currentChat, currentUserId]);

  const handleContextMenuAction = useCallback(
    async (action: "reply" | "copy" | "edit" | "delete" | "download" | "forward" | "pin") => {
      if (!contextMenu) {
        return;
      }

      const message = currentChatMessages.find((item) => item.id === contextMenu.messageId);
      if (!message) {
        setContextMenu(null);
        return;
      }

      if (action === "reply") {
        startReplyToMessage(message.id);
      } else if (action === "copy") {
        await copySingleMessage(message.id);
      } else if (action === "edit") {
        startEditingMessage(message.id);
      } else if (action === "delete") {
        try {
          await fetchJson<{ ok: true }>(`/api/chats/${currentChat}/messages/${message.id}`, {
            method: "DELETE",
          });

          setMessagesByChat((prev) => ({
            ...prev,
            [currentChat]: (prev[currentChat] || []).filter((item) => item.id !== message.id),
          }));

          if (editingMessageId === message.id) {
            resetComposer();
          }

          await Promise.all([
            refreshDirectoryState().catch(() => {}),
            refreshMessages(currentChat, currentUserId, { markAsRead: true }).catch(() => {}),
          ]);
        } catch (error) {
          setFeedback(error instanceof Error ? error.message : "Не удалось удалить сообщение.");
        }
      } else if (action === "download") {
        await downloadMessageAttachments(message.id);
      } else if (action === "forward") {
        openForwardMessage(message.id);
      } else if (action === "pin") {
        await pinMessage(message.id, !message.isPinned);
      } else {
        setFeedback(NOT_AVAILABLE_MESSAGE);
      }

      setContextMenu(null);
    },
    [
      contextMenu,
      copySingleMessage,
      currentChat,
      currentChatMessages,
      currentUserId,
      downloadMessageAttachments,
      editingMessageId,
      openForwardMessage,
      pinMessage,
      refreshDirectoryState,
      refreshMessages,
      resetComposer,
      setFeedback,
      setMessagesByChat,
      startEditingMessage,
      startReplyToMessage,
    ]
  );

  const handleInputChange = useCallback(
    (value: string) => {
      setInput(value);
      if (!value.trim() || !currentChat) return;
      if (typingThrottleRef.current) return;
      typingThrottleRef.current = window.setTimeout(() => {
        typingThrottleRef.current = null;
      }, 3000);
      void fetchJson("/api/presence/typing", {
        method: "POST",
        body: JSON.stringify({ chatId: currentChat }),
      }).catch(() => {});
    },
    [currentChat]
  );

  const insertEmoji = useCallback(
    (emoji: string) => {
      const inputElement = textInputRef.current;

      if (!inputElement) {
        setInput((prev) => `${prev}${emoji}`);
        return;
      }

      const start = inputElement.selectionStart ?? input.length;
      const end = inputElement.selectionEnd ?? input.length;
      const nextValue = `${input.slice(0, start)}${emoji}${input.slice(end)}`;

      setInput(nextValue);
      setShowEmojiPicker(false);

      requestAnimationFrame(() => {
        inputElement.focus();
        const cursorPosition = start + emoji.length;
        inputElement.setSelectionRange(cursorPosition, cursorPosition);
      });
    },
    [input]
  );

  const prepareFiles = useCallback(
    async (files: File[]) => {
      if (files.length === 0) {
        return;
      }

      if (pendingAttachments.length + files.length > MAX_FILES_PER_MESSAGE) {
        showWarning(`Можно отправить не больше ${MAX_FILES_PER_MESSAGE} файлов за раз.`);
        return;
      }

      const nextAttachments: Attachment[] = [];

      for (const file of files) {
        if (file.size <= 0) {
          showWarning(`Файл ${file.name} пустой.`);
          return;
        }

        if (file.size > MAX_FILE_SIZE_BYTES) {
          showWarning(`Файл ${file.name} превышает лимит 10 МБ.`);
          return;
        }

        const id = createLocalId();
        const fileData = await readFileAsDataUrl(file);
        pendingFilesRef.current[id] = file;
        nextAttachments.push({
          id,
          fileName: file.name,
          fileType: file.type || "application/octet-stream",
          fileData,
          fileSize: file.size,
        });
      }

      setPendingAttachments((prev) => [...prev, ...nextAttachments]);
      focusComposerInput(textInputRef, input);
    },
    [input, pendingAttachments.length, showWarning]
  );

  const removePendingAttachment = useCallback((attachmentId: string) => {
    setPendingAttachments((prev) => prev.filter((attachment) => attachment.id !== attachmentId));
    delete pendingFilesRef.current[attachmentId];
  }, []);

  const handleFileChange = useCallback(
    async (event: ChangeEvent<HTMLInputElement>) => {
      const files = Array.from(event.target.files || []);
      await prepareFiles(files);
      event.target.value = "";
    },
    [prepareFiles]
  );

  const chooseFiles = useCallback(async () => {
    if (!hasTauriRuntime()) {
      fileInputRef.current?.click();
      return;
    }

    try {
      const { invoke } = await import("@tauri-apps/api/core");
      const selectedFiles = await invoke<DesktopUploadFile[]>("pick_upload_files");

      if (!Array.isArray(selectedFiles) || selectedFiles.length === 0) {
        return;
      }

      const files = selectedFiles
        .map((selectedFile) => {
          const bytes = selectedFile.bytes;
          const fileName = selectedFile.fileName || selectedFile.file_name || "attachment.bin";
          const fileType = selectedFile.fileType || selectedFile.file_type || "application/octet-stream";

          if (!Array.isArray(bytes)) {
            return null;
          }

          return new File([new Uint8Array(bytes)], fileName, { type: fileType });
        })
        .filter((file): file is File => file instanceof File);

      await prepareFiles(files);
    } catch (error) {
      console.warn("Desktop file picker failed, falling back to browser input.", error);
      fileInputRef.current?.click();
    }
  }, [prepareFiles]);

  const handlePaste = useCallback(
    async (event: ClipboardEvent<HTMLTextAreaElement>) => {
      const files = Array.from(event.clipboardData.items)
        .filter((item) => item.kind === "file")
        .map((item) => item.getAsFile())
        .filter((file): file is File => file instanceof File);

      if (files.length > 0) {
        event.preventDefault();
        await prepareFiles(files);
      }
    },
    [prepareFiles]
  );

  const handleChatDragOver = useCallback((event: DragEvent<HTMLDivElement>) => {
    if (!Array.from(event.dataTransfer.types).includes("Files")) {
      return;
    }
    event.preventDefault();
    setIsChatDragOver(true);
  }, []);

  const handleChatDragLeave = useCallback((event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    if (event.currentTarget.contains(event.relatedTarget as Node | null)) {
      return;
    }
    setIsChatDragOver(false);
  }, []);

  const handleChatDrop = useCallback(
    async (event: DragEvent<HTMLDivElement>) => {
      event.preventDefault();
      setIsChatDragOver(false);
      const files = Array.from(event.dataTransfer.files || []);
      await prepareFiles(files);
    },
    [prepareFiles]
  );

  return {
    isLoaded,
    isAuthenticated,
    loginName,
    setLoginName,
    loginPassword,
    setLoginPassword,
    loginPending,
    authError,
    isDisplayNameSettingsOpen,
    displayNameDraft,
    setDisplayNameDraft,
    displayNameSavePending,
    displayNameError,
    openDisplayNameSettings,
    closeDisplayNameSettings,
    saveDisplayName,
    isCreateConversationOpen,
    createConversationTitle,
    setCreateConversationTitle,
    createConversationMemberIds,
    createConversationPending,
    createConversationError,
    createConversationCandidates,
    openCreateConversation,
    closeCreateConversation,
    toggleCreateConversationMember,
    createConversation,
    login,
    logout,
    users,
    currentUserId,
    currentUser,
    currentChat,
    currentChatTitle,
    setCurrentChat,
    chats,
    input,
    setInput,
    handleInputChange,
    typingUsers,
    currentFailedSendDrafts,
    newChatName,
    setNewChatName,
    search,
    setSearch,
    globalSearchResults,
    globalSearchPending,
    openGlobalSearchResult,
    chatListFilter,
    setChatListFilter,
    chatFilterCounts,
    pinnedChatIds,
    archivedChatIds,
    mutedChatIds,
    togglePinnedChat,
    toggleArchivedChat,
    toggleMutedChat,
    copySuccess,
    editingMessageId,
    replyingToMessageId,
    pendingAttachments,
    uploadingAttachments,
    showEmojiPicker,
    setShowEmojiPicker,
    unreadByChat,
    highlightedMessageId,
    storageWarning,
    isChatDragOver,
    isSelectionMode,
    selectedMessageIds,
    contextMenu,
    setContextMenu,
    filteredChats,
    chatSummaries,
    filteredChatSummaries,
    currentChatMessages,
    selectedMessages,
    contextMenuMessage,
    messagesById,
    replyingToMessage,
    canDeleteAnyMessages,
    fileInputRef,
    textInputRef,
    messagesEndRef,
    emojiPickerRef,
    contextMenuRef,
    messageRefs,
    createChat,
    deleteChat,
    renameCurrentChat,
    copyCurrentChat,
    toggleSelectionMode,
    copySelectedMessages,
    forwardSelectedMessages,
    forwardingMessage,
    forwardingMessageCount,
    forwardingPreviewText: getForwardingPreviewText(),
    openForwardMessage,
    closeForwardMessage,
    executeForward: executeForwardIfPossible,
    deleteSelectedMessages,
    handleChatDragOver,
    handleChatDragLeave,
    handleChatDrop,
    toggleMessageSelection,
    openContextMenu,
    scrollToMessage,
    getQuotePreview: (message: Message | null) => getQuotePreview(message, users),
    removePendingAttachment,
    handleFileChange,
    chooseFiles,
    insertEmoji,
    handlePaste,
    cancelEditing,
    sendMessage,
    retryFailedSend,
    discardFailedSend,
    startEditingMessage,
    startReplyToMessage,
    copySingleMessage,
    handleContextMenuAction,
    downloadMessageAttachments,
    toggleContextMenuReaction,
    toggleReaction,
    pinMessage,
    pinnedMessage,
    loadMoreMessages,
    hasMoreByChat,
    isLoadingMore,
    handleIncomingMessage: () => {},
  };
};



