import { ChatSummary } from "../types";
import { ChatListItem } from "./ChatListItem";

type Props = {
  filteredChats: ChatSummary[];
  currentChat: string;
  currentUserId: string;
  unreadByChat: Record<string, number>;
  onSelectChat: (chatId: string) => void;
  onDeleteChat?: (chatId: string) => void;
};

export function ChatList({
  filteredChats,
  currentChat,
  currentUserId,
  unreadByChat,
  onSelectChat,
  onDeleteChat,
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
      <div className="space-y-2 pb-2">
        {filteredChats.map((chat) => (
          <ChatListItem
            key={chat.id}
            chat={chat}
            currentUserId={currentUserId}
            isActive={currentChat === chat.id}
            unreadCount={unreadByChat[chat.id] || 0}
            onSelect={onSelectChat}
            onDelete={onDeleteChat}
          />
        ))}
      </div>
    </div>
  );
}
