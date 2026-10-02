import React, { useEffect, useState } from "react";
import { ChatSummary } from "../types";
import { formatMessageTime } from "../utils/format";
import { UnreadBadge } from "./UnreadBadge";

type Props = {
  chat: ChatSummary;
  currentUserId: string;
  isActive: boolean;
  unreadCount: number;
  isPinned: boolean;
  isArchived: boolean;
  isMuted: boolean;
  onSelect: (chatId: string) => void;
  onDelete?: (chatId: string) => void;
  onTogglePin: (chatId: string) => void;
  onToggleArchive: (chatId: string) => void;
  onToggleMute: (chatId: string) => void;
};

const getAvatarLabel = (chatName: string) =>
  chatName
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() || "")
    .join("")
    .slice(0, 2);

const AVATAR_COLORS: Array<[string, string]> = [
  ["#6e82df", "#9b72d4"],
  ["#0ea5e9", "#6366f1"],
  ["#10b981", "#0ea5e9"],
  ["#f59e0b", "#f97316"],
  ["#8b5cf6", "#ec4899"],
  ["#14b8a6", "#6366f1"],
  ["#06b6d4", "#4f46e5"],
  ["#84cc16", "#10b981"],
  ["#f43f5e", "#f97316"],
  ["#a78bfa", "#6e82df"],
];

const getAvatarStyle = (name: string): React.CSSProperties => {
  const hash = name.split("").reduce((a, c) => a + c.charCodeAt(0), 0);
  const [from, to] = AVATAR_COLORS[hash % AVATAR_COLORS.length];
  return { background: `linear-gradient(135deg, ${from} 0%, ${to} 100%)` };
};

const PinIcon = ({ className = "h-3 w-3" }: { className?: string }) => (
  <svg viewBox="0 0 20 20" fill="none" aria-hidden="true" className={className}>
    <path
      d="M7.9 11.2 4.8 14.3M7.1 3.8l9.1 9.1M8.4 4.5l-1.8 4 4.9 4.9 4-1.8M10.1 2.8l7.1 7.1"
      stroke="currentColor"
      strokeWidth="1.55"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

const ArchiveIcon = ({ className = "h-3 w-3" }: { className?: string }) => (
  <svg viewBox="0 0 20 20" fill="none" aria-hidden="true" className={className}>
    <path
      d="M4 7.5h12M5.2 7.5v7.2c0 .9.7 1.6 1.6 1.6h6.4c.9 0 1.6-.7 1.6-1.6V7.5M6 3.8h8l1.2 3.7H4.8L6 3.8ZM8.1 10.7h3.8"
      stroke="currentColor"
      strokeWidth="1.55"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

const MutedIcon = ({ className = "h-3 w-3" }: { className?: string }) => (
  <svg viewBox="0 0 20 20" fill="none" aria-hidden="true" className={className}>
    <path
      d="M8.2 6.6 5.7 9H3.8v2h2l3.7 3.4V7.9M13.7 8l2.8 2.8M16.5 8l-2.8 2.8"
      stroke="currentColor"
      strokeWidth="1.55"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

export function ChatListItem({
  chat,
  currentUserId,
  isActive,
  unreadCount,
  isPinned,
  isArchived,
  isMuted,
  onSelect,
  onDelete,
  onTogglePin,
  onToggleArchive,
  onToggleMute,
}: Props) {
  const [now, setNow] = useState<number | null>(null);

  useEffect(() => {
    const updateNow = () => setNow(Date.now());

    updateNow();
    const intervalId = window.setInterval(updateNow, 60000);

    return () => {
      window.clearInterval(intervalId);
    };
  }, []);

  const lastMessageTime = chat.lastMessage
    ? formatMessageTime({
        id: chat.lastMessage.id,
        text: chat.lastMessage.text,
        sender: "other",
        authorId: "",
        time: "",
        createdAt: chat.lastMessage.createdAt,
        status: "read",
      })
    : "";
  const directPeer = !chat.isGroup
    ? chat.members.find((member) => member.id !== currentUserId) || null
    : null;
  const peerPresence = !chat.isGroup ? directPeer?.presence : undefined;
  const peerStatusLabel = (() => {
    if (peerPresence === "online") return "В сети";
    if (!directPeer?.lastSeenAt) return "Не в сети";
    if (now === null) return "Не в сети";
    const diff = now - new Date(directPeer.lastSeenAt).getTime();
    const minutes = Math.floor(diff / 60000);
    if (minutes < 1) return "Только что в сети";
    if (minutes < 60) return `Был(а) в сети ${minutes} мин. назад`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `Был(а) в сети ${hours} ч. назад`;
    const days = Math.floor(hours / 24);
    if (days === 1) return "Был(а) в сети вчера";
    if (days < 7) return `Был(а) в сети ${days} дн. назад`;
    return "Давно не в сети";
  })();
  const lastMessagePreview = chat.lastMessage?.text?.trim() || peerStatusLabel;
  const preview = chat.lastMessage
    ? `${chat.lastMessage.authorName}: ${lastMessagePreview}`
    : lastMessagePreview;
  const avatarLabel = getAvatarLabel(chat.title) || "Ч";
  const canOrganize = !chat.isVirtual;

  return (
    <div
      onClick={() => onSelect(chat.id)}
      className={[
        "group relative cursor-pointer rounded-[18px] border transition-all duration-150",
        isActive ? "chat-list-item--active" : "chat-list-item--idle border-transparent",
      ].join(" ")}
    >
      <div className="flex items-start gap-3 px-3 py-3 md:py-2.5">
        <div
          className="relative mt-0.5 flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-[13px] font-bold text-white shadow-[0_3px_10px_rgba(0,0,0,0.32)]"
          style={getAvatarStyle(chat.title)}
        >
          {avatarLabel}
          {!chat.isGroup && (
            <span
              className={`absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full border-2 border-[var(--sidebar-bg)] ${
                peerPresence === "online" ? "bg-[var(--success)]" : "bg-[var(--text-muted)]"
              }`}
            />
          )}
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="flex min-w-0 items-center gap-1.5">
                {isPinned && <PinIcon className="h-3 w-3 shrink-0 text-[var(--accent-soft)]" />}
                {isArchived && <ArchiveIcon className="h-3 w-3 shrink-0 text-[var(--text-muted)]" />}
                {isMuted && <MutedIcon className="h-3 w-3 shrink-0 text-[var(--text-muted)]" />}
                <div className="truncate text-[13.5px] font-semibold tracking-[-0.01em] text-[var(--text-primary)]">
                  {chat.title}
                </div>
              </div>
            </div>

            <div className="flex shrink-0 items-center gap-2">
              {lastMessageTime && (
                <span className="text-[10.5px] font-medium leading-4 text-[var(--text-muted)]">{lastMessageTime}</span>
              )}
              <UnreadBadge count={unreadCount} />
            </div>
          </div>

          <div className="mt-1 flex items-start justify-between gap-2">
            <p
              className={
                isActive
                  ? "chat-list-active-preview line-clamp-2 min-w-0 text-[12px] leading-[1.45] text-[#d7def5]"
                  : "line-clamp-2 min-w-0 text-[12px] leading-[1.45] text-[var(--text-secondary)]"
              }
            >
              {preview}
            </p>

            {canOrganize && (
              <div className="flex shrink-0 items-center gap-1 transition-opacity duration-150 md:opacity-0 md:group-hover:opacity-100">
                <button
                  type="button"
                  onClick={(event) => {
                    event.stopPropagation();
                    onTogglePin(chat.id);
                  }}
                  aria-label={isPinned ? "Открепить чат" : "Закрепить чат"}
                  title={isPinned ? "Открепить" : "Закрепить"}
                  className={`flex h-7 w-7 items-center justify-center rounded-lg transition-all duration-150 hover:bg-white/[0.06] ${
                    isPinned ? "text-[var(--accent-soft)]" : "text-[var(--text-muted)] hover:text-[var(--text-primary)]"
                  }`}
                >
                  <PinIcon />
                </button>

                <button
                  type="button"
                  onClick={(event) => {
                    event.stopPropagation();
                    if (onDelete) {
                      onDelete(chat.id);
                    } else {
                      onToggleArchive(chat.id);
                    }
                  }}
                  aria-label={isArchived ? "Вернуть из архива" : "Архивировать чат"}
                  title={isArchived ? "Вернуть из архива" : "Архив"}
                  className="flex h-7 w-7 items-center justify-center rounded-lg text-[var(--text-muted)] transition-all duration-150 hover:bg-white/[0.06] hover:text-[var(--text-primary)]"
                >
                  <ArchiveIcon />
                </button>

                <button
                  type="button"
                  onClick={(event) => {
                    event.stopPropagation();
                    onToggleMute(chat.id);
                  }}
                  aria-label={isMuted ? "Включить уведомления" : "Отключить уведомления"}
                  title={isMuted ? "Включить уведомления" : "Без звука"}
                  className={`flex h-7 w-7 items-center justify-center rounded-lg transition-all duration-150 hover:bg-white/[0.06] ${
                    isMuted ? "text-[var(--accent-soft)]" : "text-[var(--text-muted)] hover:text-[var(--text-primary)]"
                  }`}
                >
                  <MutedIcon />
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
