export type MessageStatus = "sent" | "delivered" | "read";

export type PresenceStatus = "online" | "offline";

export type User = {
  id: string;
  name: string;
  login?: string;
  displayName?: string | null;
  lastSeenAt?: string | null;
  presence?: PresenceStatus;
};

export type Attachment = {
  id: string;
  fileName: string;
  fileType: string;
  fileData: string;
  fileSize?: number;
};

export type Reaction = {
  emoji: string;
  count: number;
  hasCurrentUser: boolean;
};

export type UploadingAttachment = {
  id: string;
  fileName: string;
  fileType: string;
  progress: number;
};

export type Message = {
  id: string;
  text: string;
  sender: "me" | "other";
  authorId: string;
  time: string;
  createdAt?: string;
  status: MessageStatus;
  isEdited?: boolean;
  editedAt?: string;
  edited?: boolean;
  replyToMessageId?: string | null;
  isPinned?: boolean;
  attachments?: Attachment[];
  reactions?: Reaction[];
};

export type Chats = Record<string, Message[]>;

export type ChatListFilter = "all" | "unread" | "pinned" | "archive";

export type ChatSummary = {
  id: string;
  title: string;
  isGroup: boolean;
  updatedAt: string;
  members: User[];
  unreadCount?: number;
  isPinned?: boolean;
  isArchived?: boolean;
  isMuted?: boolean;
  lastMessage: {
    id: string;
    text: string;
    createdAt: string;
    authorName: string;
  } | null;
  isVirtual?: boolean;
  directUserId?: string;
};

export type GlobalSearchResult = {
  id: string;
  chatId: string;
  chatTitle: string;
  authorName: string;
  createdAt: string;
  preview: string;
};

export type MessageContextMenuState = {
  messageId: string;
  x: number;
  y: number;
};

export type QuotePreview = {
  authorName: string;
  text: string;
};
