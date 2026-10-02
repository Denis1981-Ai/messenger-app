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
  onOpenImage: (url: string, name: string) => void;
  onToggleReaction: (messageId: string, emoji: string) => void;
  messagesEndRef: React.RefObject<HTMLDivElement | null>;
  hasMore: boolean;
  isLoadingMore: boolean;
  onLoadMore: () => void;
  peerLastSeenAt?: string | null;
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
  onOpenImage,
  onToggleReaction,
  messagesEndRef,
  hasMore,
  isLoadingMore,
  onLoadMore,
  peerLastSeenAt,
}: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const listRef = useRef<HTMLDivElement | null>(null);
  const prevScrollHeightRef = useRef<number | null>(null);
  const restoredKeyRef = useRef("");
  const lastSnapshotRef = useRef<{ chatKey: string; lastMessageId: string; count: number }>({
    chatKey: "",
    lastMessageId: "",
    count: 0,
  });
  const bottomStateRef = useRef(true);
  const [pendingNewMessages, setPendingNewMessages] = useState(0);
  const [newMessageStartId, setNewMessageStartId] = useState<string | null>(null);
  const [isAwayFromBottom, setIsAwayFromBottom] = useState(false);

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

    const pinToBottom = () => {
      if (containerRef.current) {
        containerRef.current.scrollTop = containerRef.current.scrollHeight;
      }
    };

    requestAnimationFrame(() => {
      pinToBottom();
      requestAnimationFrame(pinToBottom);
    });
    window.setTimeout(pinToBottom, 80);
    window.setTimeout(pinToBottom, 240);

    bottomStateRef.current = true;
    setIsAwayFromBottom(false);
    setPendingNewMessages(0);
    setNewMessageStartId(null);
    saveScrollPosition();
  }, [saveScrollPosition]);

  useEffect(() => {
    const list = listRef.current;

    if (!list || typeof ResizeObserver === "undefined") {
      return;
    }

    const resizeObserver = new ResizeObserver(() => {
      if (!bottomStateRef.current || !containerRef.current) {
        return;
      }

      containerRef.current.scrollTop = containerRef.current.scrollHeight;
      saveScrollPosition();
    });

    resizeObserver.observe(list);

    return () => {
      resizeObserver.disconnect();
    };
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
    setIsAwayFromBottom(!bottomStateRef.current);
    setPendingNewMessages(0);
    setNewMessageStartId(null);
    lastSnapshotRef.current = {
      chatKey: chatStorageKey,
      lastMessageId,
      count: messageCount,
    };
    saveScrollPosition();
  }, [chatStorageKey, lastMessageId, messageCount, saveScrollPosition]);

  // Preserve scroll position after older messages are prepended
  useLayoutEffect(() => {
    const container = containerRef.current;
    if (prevScrollHeightRef.current !== null && container) {
      const delta = container.scrollHeight - prevScrollHeightRef.current;
      if (delta > 0) {
        container.scrollTop += delta;
      }
      prevScrollHeightRef.current = null;
    }
  }, [messageCount]);

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

    const hasNewMessages =
      Boolean(currentLastId) &&
      currentLastId !== snapshot.lastMessageId &&
      messageCount >= snapshot.count;

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
      const firstNewMessageId = currentChatMessages[snapshot.count]?.id || currentLastId;
      requestAnimationFrame(() => {
        setNewMessageStartId((prev) => prev || firstNewMessageId);
        setPendingNewMessages((prev) => prev + Math.max(1, messageCount - snapshot.count));
      });
    }

    lastSnapshotRef.current = {
      chatKey: chatStorageKey,
      lastMessageId: currentLastId,
      count: messageCount,
    };
  }, [
    chatStorageKey,
    currentChatMessages,
    currentUserId,
    lastMessageAuthorId,
    lastMessageId,
    messageCount,
    scrollToBottom,
  ]);

  return (
    <div
      ref={containerRef}
      onScroll={() => {
        const container = containerRef.current;
        bottomStateRef.current = isNearBottom(container);
        setIsAwayFromBottom(!bottomStateRef.current);

        if (bottomStateRef.current && pendingNewMessages > 0) {
          setPendingNewMessages(0);
          setNewMessageStartId(null);
        }

        if (container && container.scrollTop < 120 && hasMore && !isLoadingMore) {
          prevScrollHeightRef.current = container.scrollHeight;
          onLoadMore();
        }

        saveScrollPosition();
      }}
      className="chat-appear relative min-w-0 flex-1 overflow-x-hidden overflow-y-auto px-4 py-3 md:px-6 md:py-4"
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
          <div ref={listRef} className="mx-auto flex w-full min-w-0 max-w-full flex-col pb-6 md:max-w-[1040px] md:pb-8">
          {isLoadingMore && (
            <div className="flex justify-center py-3">
              <div className="h-5 w-5 animate-spin rounded-full border-2 border-[rgba(255,255,255,0.1)] border-t-[var(--accent)]" />
            </div>
          )}
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
            const isGrouped =
              !shouldShowDateDivider &&
              previousMessage !== null &&
              previousMessage.authorId === message.authorId &&
              !message.replyToMessageId &&
              !previousMessage.replyToMessageId &&
              new Date(message.createdAt || message.time).getTime() -
                new Date(previousMessage.createdAt || previousMessage.time).getTime() <
                5 * 60 * 1000;

            const effectiveStatus = (() => {
              if (!isMine) return message.status;
              const createdAt = message.createdAt ? new Date(message.createdAt).getTime() : 0;
              if (peerLastSeenAt && new Date(peerLastSeenAt).getTime() > createdAt) return "read";
              return "delivered";
            })();

            return (
              <div
                key={message.id}
                className={isGrouped ? "mt-0.5" : "mt-2.5"}
              >
                {newMessageStartId === message.id && (
                  <div className="mb-2 flex justify-center md:mb-2.5">
                    <div className="rounded-full border border-[rgba(59,130,246,0.28)] bg-[rgba(59,130,246,0.14)] px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--accent-soft)] shadow-[0_8px_18px_rgba(2,6,23,0.16)]">
                      Новые сообщения
                    </div>
                  </div>
                )}

                {shouldShowDateDivider && (
                  <div className="mb-2 flex justify-center md:mb-2.5">
                    <div className="premium-panel rounded-full border px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--text-secondary)]">
                      {currentMessageDate}
                    </div>
                  </div>
                )}

                <MessageItem
                  message={{ ...message, status: effectiveStatus }}
                  isMine={isMine}
                  isSelected={isSelected}
                  isHighlighted={highlightedMessageId === message.id}
                  isGrouped={isGrouped}
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
                  onOpenImage={onOpenImage}
                  onToggleReaction={onToggleReaction}
                />
              </div>
            );
          })}
        </div>
      )}

      {(pendingNewMessages > 0 || isAwayFromBottom) && (
        <button
          type="button"
          onClick={() => scrollToBottom("smooth")}
          className="scroll-bottom-button sticky bottom-4 z-[3] ml-auto mr-0 flex items-center gap-2 rounded-full border px-4 py-2 text-sm font-medium backdrop-blur-sm transition-all duration-150 hover:border-[rgba(59,130,246,0.42)] hover:bg-[var(--surface-soft)]"
        >
          <span aria-hidden="true">↓</span>
          <span>{pendingNewMessages > 0 ? `Новые сообщения: ${pendingNewMessages}` : "Вниз"}</span>
        </button>
      )}

      <div ref={messagesEndRef} />
    </div>
  );
}
