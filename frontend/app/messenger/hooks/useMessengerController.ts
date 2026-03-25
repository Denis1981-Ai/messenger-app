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
  ChatSummary,
  Message,
  MessageContextMenuState,
  UploadingAttachment,
  User,
} from "../types";
import { PRESENCE_HEARTBEAT_INTERVAL_MS } from "@/lib/presence";
import { getDesktopNotificationsBridge } from "../utils/desktopNotifications";
import { playIncomingMessageSound, prepareIncomingMessageSound } from "../utils/incomingMessageSound";
import { formatMessageDate, formatMessageTime } from "../utils/format";

const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024;
const MAX_FILES_PER_MESSAGE = 5;
const NOT_AVAILABLE_MESSAGE = "Недоступно в text pilot.";
const ACTIVE_CHAT_POLL_INTERVAL_MS = 4 * 1000;
const CHAT_LIST_POLL_INTERVAL_MS = 8 * 1000;
const APP_TITLE = "Svarka Weld Messenger";
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
  attachments?: ServerAttachment[];
};

type ServerChatResponse = {
  chat: {
    id: string;
    title: string;
    isGroup: boolean;
    members: User[];
  };
  messages: ServerMessage[];
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
    return `?? Файлы (${count})`;
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
  status: "read",
  isEdited: Boolean(message.editedAt),
  edited: Boolean(message.editedAt),
  editedAt: message.editedAt || undefined,
  replyToMessageId: message.replyToMessageId || null,
  attachments: Array.isArray(message.attachments)
    ? message.attachments.map(toClientAttachment)
    : [],
});

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

  const [currentUser, setCurrentUser] = useState<SessionUser | null>(null);
  const [availableUsers, setAvailableUsers] = useState<User[]>([]);
  const [chatSummaries, setChatSummaries] = useState<ChatSummary[]>([]);
  const [messagesByChat, setMessagesByChat] = useState<Record<string, Message[]>>({});
  const [currentChat, setCurrentChatState] = useState("");

  const [input, setInput] = useState("");
  const [newChatName, setNewChatName] = useState("");
  const [search, setSearch] = useState("");
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
  const currentUserIdRef = useRef("");

  const currentUserId = currentUser?.id || "";
  const users = useMemo(() => (currentUser ? [currentUser, ...availableUsers] : availableUsers), [availableUsers, currentUser]);

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

  const messagesById = useMemo(
    () => Object.fromEntries(currentChatMessages.map((message) => [message.id, message])),
    [currentChatMessages]
  );

  const replyingToMessage = replyingToMessageId ? messagesById[replyingToMessageId] || null : null;
  const contextMenuMessage = contextMenu ? messagesById[contextMenu.messageId] || null : null;
  const selectedMessages = useMemo(
    () => currentChatMessages.filter((message) => selectedMessageIds.includes(message.id)),
    [currentChatMessages, selectedMessageIds]
  );

  const filteredChatSummaries = useMemo(() => {
    const query = search.trim().toLowerCase();

    if (!query) {
      return visibleChatSummaries;
    }

    return visibleChatSummaries.filter((chat) => {
      const inTitle = chat.title.toLowerCase().includes(query);
      const inLastMessage = chat.lastMessage?.text?.toLowerCase().includes(query) || false;
      const inAuthor = chat.lastMessage?.authorName?.toLowerCase().includes(query) || false;
      return inTitle || inLastMessage || inAuthor;
    });
  }, [search, visibleChatSummaries]);

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

      const response = await fetchJson<ServerChatResponse>(`/api/chats/${chatId}/messages`, {
        method: "GET",
      });

      setMessagesByChat((prev) => ({
        ...prev,
        [chatId]: Array.isArray(response.messages)
          ? response.messages.map((message) => toClientMessage(message, userId))
          : [],
      }));
      latestFetchedMessageIdRef.current[chatId] = response.messages.at(-1)?.id || null;

      if (options?.markAsRead) {
        const latestMessageId = response.messages.at(-1)?.id || null;
        await markChatRead(chatId, latestMessageId);
      }

      return response;
    },
    [markChatRead]
  );

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

    const intervalId = window.setInterval(() => {
      void pollActiveChat();
    }, ACTIVE_CHAT_POLL_INTERVAL_MS);

    return () => {
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
      void sendHeartbeat();
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
      setCurrentChatState(chatId);
      resetComposer();
    },
    [resetComposer]
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
    if (!currentChatSummary?.isVirtual || !currentChatSummary.directUserId) {
      return currentChat;
    }

    const response = await fetchJson<{ chat: ChatSummary }>("/api/chats", {
      method: "POST",
      body: JSON.stringify({
        memberIds: [currentChatSummary.directUserId],
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
  }, [currentChat, currentChatSummary, currentUserId, refreshMessages]);

  const syncCreatedMessage = useCallback(
    (chatId: string, serverMessage: ServerMessage) => {
      const clientMessage = toClientMessage(serverMessage, currentUserId);

      setMessagesByChat((prev) => ({
        ...prev,
        [chatId]: [...(prev[chatId] || []), clientMessage],
      }));

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

  const sendMessage = useCallback(async () => {
    const text = input.trim();

    if (!currentChat) {
      return;
    }

    if (editingMessageId) {
      setFeedback(NOT_AVAILABLE_MESSAGE);
      return;
    }

    if (!text && pendingAttachments.length === 0) {
      return;
    }

    let activeChatId = currentChat;

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

      try {
        setUploadingAttachments((prev) => prev.map((item) => ({ ...item, progress: 55 })));
        const response = await fetchJson<{ message: ServerMessage }>(`/api/chats/${activeChatId}/attachments`, {
          method: "POST",
          body: formData,
        });
        setUploadingAttachments((prev) => prev.map((item) => ({ ...item, progress: 100 })));
        syncCreatedMessage(activeChatId, response.message);
        resetComposer();
      } catch (error) {
        setUploadingAttachments([]);
        showWarning(error instanceof Error ? error.message : "?? ??????? ????????? ?????.");
      }
      return;
    }

    try {
      const response = await fetchJson<{ message: ServerMessage }>(`/api/chats/${activeChatId}/messages`, {
        method: "POST",
        body: JSON.stringify({
          text,
          replyToMessageId: replyingToMessageId || null,
        }),
      });

      syncCreatedMessage(activeChatId, response.message);
      resetComposer();
    } catch (error) {
      showWarning(error instanceof Error ? error.message : "?? ??????? ????????? ?????????.");
    }
  }, [
    currentChat,
    editingMessageId,
    ensureActiveChatId,
    input,
    pendingAttachments,
    replyingToMessageId,
    resetComposer,
    setFeedback,
    showWarning,
    syncCreatedMessage,
  ]);

  const renameCurrentChat = useCallback(() => {
    setFeedback(NOT_AVAILABLE_MESSAGE);
  }, [setFeedback]);

  const deleteChat = useCallback((_chatId: string) => {
    setFeedback(NOT_AVAILABLE_MESSAGE);
  }, [setFeedback]);

  const startEditingMessage = useCallback((_messageId: string) => {
    setFeedback(NOT_AVAILABLE_MESSAGE);
  }, [setFeedback]);

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
    setFeedback(NOT_AVAILABLE_MESSAGE);
  }, [setFeedback]);

  const deleteSelectedMessages = useCallback(() => {
    setFeedback(NOT_AVAILABLE_MESSAGE);
  }, [setFeedback]);

  const openContextMenu = useCallback((event: ReactMouseEvent<HTMLDivElement>, messageId: string) => {
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
    (messageId: string) => {
      const message = currentChatMessages.find((item) => item.id === messageId);
      const attachments = message?.attachments || [];
      if (attachments.length === 0) {
        return;
      }

      attachments.forEach((attachment) => {
        const downloadUrl = attachment.fileData.startsWith("data:")
          ? attachment.fileData
          : `${attachment.fileData}${attachment.fileData.includes("?") ? "&" : "?"}download=1`;
        window.open(downloadUrl, "_blank", "noopener,noreferrer");
      });
    },
    [currentChatMessages]
  );

  const handleContextMenuAction = useCallback(
    async (action: "reply" | "copy" | "edit" | "delete" | "download" | "forward") => {
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
      } else if (action === "download") {
        downloadMessageAttachments(message.id);
      } else {
        setFeedback(NOT_AVAILABLE_MESSAGE);
      }

      setContextMenu(null);
    },
    [contextMenu, copySingleMessage, currentChatMessages, downloadMessageAttachments, setFeedback, startReplyToMessage]
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
    newChatName,
    setNewChatName,
    search,
    setSearch,
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
    insertEmoji,
    handlePaste,
    cancelEditing,
    sendMessage,
    startEditingMessage,
    startReplyToMessage,
    copySingleMessage,
    handleContextMenuAction,
    downloadMessageAttachments,
    handleIncomingMessage: (_chatName: string, _authorId: string, _text: string) => {},
  };
};



