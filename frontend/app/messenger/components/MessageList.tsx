import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";

import { Message, User } from "../types";
import { formatMessageDate } from "../utils/format";
import { MessageItem } from "./MessageItem";

const SCROLL_STORAGE_KEY = "messenger-scroll-v1";
const BOTTOM_THRESHOLD = 56;

type Props = {
  currentChat: string;
  currentChatMessages: Message[];
  currentUserId: string;
  users: User[];
  selectedMessageIds: string[];
  isSelectionMode: boolean;
  highlightedMessageId: string | null;
  messageRefs: React.MutableRefObject<Record<string, HTMLDivElement | null>>;
  getQuotePreview: (message: Message | null) => { authorName: string; text: string };
  messagesById: Record<string, Message>;
  onToggleMessageSelection: (messageId: string) => void;
  onOpenContextMenu: (event: React.MouseEvent<HTMLDivElement>, messageId: string) => void;
  onScrollToMessage: (messageId: string) => void;
  onQuickReply: (messageId: string) => void;
  onQuickCopy: (messageId: string) => void;
  onQuickShorten: (messageId: string) => void;
  onQuickTranslate: (messageId: string) => void;
  messagesEndRef: React.RefObject<HTMLDivElement | null>;
};

const isNearBottom = (element: HTMLDivElement | null) => {
  if (!element) {
    return true;
  }

  return element.scrollHeight - element.scrollTop - element.clientHeight <= BOTTOM_THRESHOLD;
};

export function MessageList({
  currentChat,
  currentChatMessages,
  currentUserId,
  users,
  selectedMessageIds,
  isSelectionMode,
  highlightedMessageId,
  messageRefs,
  getQuotePreview,
  messagesById,
  onToggleMessageSelection,
  onOpenContextMenu,
  onScrollToMessage,
  onQuickReply,
  onQuickCopy,
  onQuickShorten,
  onQuickTranslate,
  messagesEndRef,
}: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const restoredKeyRef = useRef("");
  const lastSnapshotRef = useRef<{ chatKey: string; lastMessageId: string; count: number }>({
    chatKey: "",
    lastMessageId: "",
    count: 0,
  });
  const bottomStateRef = useRef(true);
  const [pendingNewMessages, setPendingNewMessages] = useState(0);

  const chatStorageKey = `${SCROLL_STORAGE_KEY}:${currentUserId}:${currentChat}`;
  const messageCount = currentChatMessages.length;
  const lastMessageId = currentChatMessages[messageCount - 1]?.id || "";
  const lastMessageAuthorId = currentChatMessages[messageCount - 1]?.authorId || "";

  const saveScrollPosition = useCallback(() => {
    const container = containerRef.current;
    if (!container) {
      return;
    }

    try {
      localStorage.setItem(chatStorageKey, String(container.scrollTop));
    } catch {}
  }, [chatStorageKey]);

  const scrollToBottom = useCallback((behavior: ScrollBehavior = "smooth") => {
    const container = containerRef.current;
    if (!container) {
      return;
    }

    const targetTop = container.scrollHeight;
    container.scrollTo({ top: targetTop, behavior });

    requestAnimationFrame(() => {
      if (containerRef.current) {
        containerRef.current.scrollTop = containerRef.current.scrollHeight;
      }
    });

    bottomStateRef.current = true;
    setPendingNewMessages(0);
    saveScrollPosition();
  }, [saveScrollPosition]);

  useLayoutEffect(() => {
    const container = containerRef.current;
    if (!container || restoredKeyRef.current === chatStorageKey) {
      return;
    }

    let restored = false;

    try {
      const saved = localStorage.getItem(chatStorageKey);

      if (saved !== null) {
        const parsed = Number(saved);
        if (Number.isFinite(parsed)) {
          container.scrollTop = parsed;
          restored = true;
        }
      }
    } catch {}

    if (!restored) {
      requestAnimationFrame(() => {
        if (!containerRef.current) {
          return;
        }

        containerRef.current.scrollTop = containerRef.current.scrollHeight;
        saveScrollPosition();
      });
    }

    restoredKeyRef.current = chatStorageKey;
    bottomStateRef.current = isNearBottom(container);
    lastSnapshotRef.current = {
      chatKey: chatStorageKey,
      lastMessageId,
      count: messageCount,
    };
    saveScrollPosition();
  }, [chatStorageKey, lastMessageId, messageCount, saveScrollPosition]);

  useEffect(() => {
    const snapshot = lastSnapshotRef.current;
    const currentLastId = lastMessageId;

    if (snapshot.chatKey !== chatStorageKey) {
      lastSnapshotRef.current = {
        chatKey: chatStorageKey,
        lastMessageId: currentLastId,
        count: messageCount,
      };
      return;
    }

    const hasNewMessages = messageCount > snapshot.count && currentLastId !== snapshot.lastMessageId;

    if (!hasNewMessages) {
      lastSnapshotRef.current = {
        chatKey: chatStorageKey,
        lastMessageId: currentLastId,
        count: messageCount,
      };
      return;
    }

    const shouldAutoScroll = bottomStateRef.current || lastMessageAuthorId === currentUserId;

    if (shouldAutoScroll) {
      requestAnimationFrame(() => {
        scrollToBottom("smooth");
      });
    } else {
      setPendingNewMessages((prev) => prev + (messageCount - snapshot.count));
    }

    lastSnapshotRef.current = {
      chatKey: chatStorageKey,
      lastMessageId: currentLastId,
      count: messageCount,
    };
  }, [chatStorageKey, currentUserId, lastMessageAuthorId, lastMessageId, messageCount, scrollToBottom]);

  return (
    <div
      ref={containerRef}
      onScroll={() => {
        bottomStateRef.current = isNearBottom(containerRef.current);

        if (bottomStateRef.current && pendingNewMessages > 0) {
          setPendingNewMessages(0);
        }

        saveScrollPosition();
      }}
      className="relative flex-1 overflow-y-auto bg-[linear-gradient(180deg,rgba(24,31,44,0.5)_0%,rgba(29,40,60,0)_18%)] px-3 py-3 md:px-6 md:py-4"
    >
      {currentChatMessages.length === 0 ? (
        <div className="flex h-full items-center justify-center">
          <div className="rounded-[22px] border border-[rgba(255,255,255,0.06)] bg-[rgba(35,45,63,0.72)] px-7 py-5 text-center shadow-[0_16px_30px_rgba(9,14,28,0.16)]">
            <div className="text-base font-medium text-[var(--text-primary)]">Сообщений пока нет</div>
            <div className="mt-2 text-sm text-[var(--text-secondary)]">
              Начните диалог, чтобы переписка появилась здесь
            </div>
          </div>
        </div>
      ) : (
        <div className="mx-auto flex w-full max-w-full flex-col gap-2.5 pb-6 md:max-w-[980px] md:pb-8">
          {currentChatMessages.map((message, index) => {
            const isMine = message.authorId === currentUserId;
            const isSelected = selectedMessageIds.includes(message.id);
            const authorName = users.find((user) => user.id === message.authorId)?.name || message.authorId;
            const repliedMessage = message.replyToMessageId
              ? messagesById[message.replyToMessageId] || null
              : null;
            const quotePreview = getQuotePreview(repliedMessage);
            const previousMessage = index > 0 ? currentChatMessages[index - 1] : null;
            const currentMessageDate = formatMessageDate(message);
            const previousMessageDate = previousMessage ? formatMessageDate(previousMessage) : null;
            const shouldShowDateDivider = currentMessageDate !== previousMessageDate;

            return (
              <div key={message.id}>
                {shouldShowDateDivider && (
                  <div className="mb-2 flex justify-center md:mb-2.5">
                    <div className="rounded-full border border-[rgba(255,255,255,0.05)] bg-[rgba(255,255,255,0.035)] px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--text-secondary)]">
                      {currentMessageDate}
                    </div>
                  </div>
                )}

                <MessageItem
                  message={message}
                  isMine={isMine}
                  isSelected={isSelected}
                  isHighlighted={highlightedMessageId === message.id}
                  authorName={authorName}
                  quotePreview={quotePreview}
                  currentUserId={currentUserId}
                  selectedMode={isSelectionMode}
                  setMessageRef={(node) => {
                    messageRefs.current[message.id] = node;
                  }}
                  onToggleSelect={() => onToggleMessageSelection(message.id)}
                  onOpenContextMenu={(event) => onOpenContextMenu(event, message.id)}
                  onScrollToReply={onScrollToMessage}
                  onQuickReply={() => onQuickReply(message.id)}
                  onQuickCopy={() => onQuickCopy(message.id)}
                  onQuickShorten={() => onQuickShorten(message.id)}
                  onQuickTranslate={() => onQuickTranslate(message.id)}
                />
              </div>
            );
          })}
        </div>
      )}

      {pendingNewMessages > 0 && (
        <button
          type="button"
          onClick={() => scrollToBottom("smooth")}
          className="sticky bottom-4 left-1/2 z-[3] ml-auto mr-0 flex rounded-full border border-[rgba(93,121,238,0.2)] bg-[rgba(34,45,66,0.96)] px-4 py-2 text-sm font-medium text-[var(--accent-soft)] shadow-[0_14px_24px_rgba(9,14,28,0.22)] backdrop-blur-sm transition-colors duration-150 hover:bg-[var(--surface-soft)]"
        >
          {`Новые сообщения: ${pendingNewMessages}`}
        </button>
      )}

      <div ref={messagesEndRef} />
    </div>
  );
}
