import { ChatSummary } from "../types";
import { formatMessageTime } from "../utils/format";
import { UnreadBadge } from "./UnreadBadge";

type Props = {
  chat: ChatSummary;
  currentUserId: string;
  isActive: boolean;
  unreadCount: number;
  onSelect: (chatId: string) => void;
  onDelete?: (chatId: string) => void;
};

const getAvatarLabel = (chatName: string) =>
  chatName
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() || "")
    .join("")
    .slice(0, 2);

export function ChatListItem({ chat, currentUserId, isActive, unreadCount, onSelect, onDelete }: Props) {
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
  const lastMessagePreview =
    chat.lastMessage?.text?.trim() || (peerPresence === "online" ? "В сети" : "Не в сети");
  const preview = chat.lastMessage
    ? `${chat.lastMessage.authorName}: ${lastMessagePreview}`
    : lastMessagePreview;
  const avatarLabel = getAvatarLabel(chat.title) || "Ч";

  return (
    <div
      onClick={() => onSelect(chat.id)}
      className={[
        "group relative cursor-pointer rounded-[18px] border transition-all duration-150",
        isActive
          ? "border-[rgba(108,129,211,0.34)] bg-[rgba(99,118,177,0.18)] shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]"
          : "border-transparent bg-[rgba(255,255,255,0.02)] hover:border-[rgba(255,255,255,0.06)] hover:bg-[rgba(255,255,255,0.045)]",
      ].join(" ")}
    >
      <div className="flex items-start gap-3 px-3 py-3 md:py-2.5">
        <div
          className={[
            "relative mt-0.5 flex shrink-0 items-center justify-center rounded-full font-semibold",
            isActive
              ? "h-9 w-9 bg-[rgba(122,143,222,0.24)] text-[12px] text-white"
              : "h-9 w-9 bg-[rgba(16,24,39,0.54)] text-[12px] text-[var(--text-primary)]",
          ].join(" ")}
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
              <div className="truncate text-[14px] font-semibold tracking-[-0.02em] text-[var(--text-primary)]">
                {chat.title}
              </div>
            </div>

            <div className="flex shrink-0 items-center gap-2">
              {lastMessageTime && (
                <span className="text-[10px] font-medium leading-4 text-[var(--text-muted)]">{lastMessageTime}</span>
              )}
              <UnreadBadge count={unreadCount} />
            </div>
          </div>

          <div className="mt-1 flex items-start justify-between gap-2">
            <p
              className={
                isActive
                  ? "line-clamp-2 min-w-0 text-[12px] leading-[1.45] text-[#d7def5]"
                  : "line-clamp-2 min-w-0 text-[12px] leading-[1.45] text-[var(--text-secondary)]"
              }
            >
              {preview}
            </p>

            {onDelete && (
              <button
                type="button"
                onClick={(event) => {
                  event.stopPropagation();
                  onDelete(chat.id);
                }}
                aria-label="Удалить чат"
                title="Удалить чат"
                className="shrink-0 rounded-lg px-1.5 py-0.5 text-xs text-[var(--text-muted)] opacity-0 transition-all duration-150 hover:bg-white/[0.04] hover:text-[var(--text-primary)] group-hover:opacity-100"
              >
                ×
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
