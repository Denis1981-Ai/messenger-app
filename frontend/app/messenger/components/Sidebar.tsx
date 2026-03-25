import { ChatSummary } from "../types";
import { ChatList } from "./ChatList";
import { ChatListHeader } from "./ChatListHeader";
import { ChatSearch } from "./ChatSearch";

type Props = {
  filteredChats: ChatSummary[];
  currentChat: string;
  currentUserId: string;
  unreadByChat: Record<string, number>;
  search: string;
  onSearchChange: (value: string) => void;
  onOpenCreateConversation: () => void;
  onSelectChat: (chatId: string) => void;
  onDeleteChat: (chatId: string) => void;
  onResetComposer: () => void;
};

export function Sidebar({
  filteredChats,
  currentChat,
  currentUserId,
  unreadByChat,
  search,
  onSearchChange,
  onOpenCreateConversation,
  onSelectChat,
  onDeleteChat,
  onResetComposer,
}: Props) {
  return (
    <aside className="w-[318px] shrink-0 border-r border-[rgba(255,255,255,0.06)] bg-[var(--sidebar-bg)]">
      <div className="flex h-full min-h-0 flex-col px-4 pb-4 pt-5">
        <ChatListHeader onOpenCreateConversation={onOpenCreateConversation} />

        <div className="mt-5">
          <ChatSearch value={search} onChange={onSearchChange} />
        </div>

        <div className="mt-5 min-h-0 flex-1">
          <ChatList
            filteredChats={filteredChats}
            currentChat={currentChat}
            currentUserId={currentUserId}
            unreadByChat={unreadByChat}
            onSelectChat={(chatId) => {
              onSelectChat(chatId);
              onResetComposer();
            }}
            onDeleteChat={onDeleteChat}
          />
        </div>
      </div>
    </aside>
  );
}
