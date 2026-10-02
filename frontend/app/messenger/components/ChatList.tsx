import { ChatSummary } from "../types";
import { ChatListItem } from "./ChatListItem";

type Props = {
  filteredChats: ChatSummary[];
  currentChat: string;
  currentUserId: string;
  unreadByChat: Record<string, number>;
  pinnedChatIds: string[];
  archivedChatIds: string[];
  mutedChatIds: string[];
  onSelectChat: (chatId: string) => void;
  onDeleteChat?: (chatId: string) => void;
  onTogglePinnedChat: (chatId: string) => void;
  onToggleArchivedChat: (chatId: string) => void;
  onToggleMutedChat: (chatId: string) => void;
};

export function ChatList({
  filteredChats,
  currentChat,
  currentUserId,
  unreadByChat,
  pinnedChatIds,
  archivedChatIds,
  mutedChatIds,
  onSelectChat,
  onDeleteChat,
  onTogglePinnedChat,
  onToggleArchivedChat,
  onToggleMutedChat,
}: Props) {
  if (filteredChats.length === 0) {
    return (
      <div className="flex h-full items-center justify-center rounded-[22px] border border-[rgba(255,255,255,0.05)] bg-[rgba(18,25,38,0.64)] px-5 text-center">
        <div className="max-w-[220px]">
          <div className="text-sm font-semibold text-[var(--text-primary)]">Ничего не найдено</div>
          <div className="mt-2 text-[13px] leading-6 text-[var(--text-secondary)]">
            Попробуйте изменить запрос или создать новую беседу.
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto pr-1">
      <div className="space-y-1.5 pb-2">
        {filteredChats.map((chat) => (
          <ChatListItem
            key={chat.id}
            chat={chat}
            currentUserId={currentUserId}
            isActive={currentChat === chat.id}
            unreadCount={unreadByChat[chat.id] || 0}
            isPinned={pinnedChatIds.includes(chat.id)}
            isArchived={archivedChatIds.includes(chat.id)}
            isMuted={mutedChatIds.includes(chat.id)}
            onSelect={onSelectChat}
            onDelete={onDeleteChat}
            onTogglePin={onTogglePinnedChat}
            onToggleArchive={onToggleArchivedChat}
            onToggleMute={onToggleMutedChat}
          />
        ))}
      </div>
    </div>
  );
}
