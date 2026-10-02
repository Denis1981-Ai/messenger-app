import { ChatListFilter, ChatSummary, GlobalSearchResult } from "../types";
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
  globalSearchResults: GlobalSearchResult[];
  globalSearchPending: boolean;
  onOpenGlobalSearchResult: (result: GlobalSearchResult) => void;
  chatListFilter: ChatListFilter;
  chatFilterCounts: Record<ChatListFilter, number>;
  pinnedChatIds: string[];
  archivedChatIds: string[];
  mutedChatIds: string[];
  onChatListFilterChange: (filter: ChatListFilter) => void;
  onOpenCreateConversation: () => void;
  theme: "dark" | "light";
  onToggleTheme: () => void;
  onSelectChat: (chatId: string) => void;
  onDeleteChat: (chatId: string) => void;
  onTogglePinnedChat: (chatId: string) => void;
  onToggleArchivedChat: (chatId: string) => void;
  onToggleMutedChat: (chatId: string) => void;
  onResetComposer: () => void;
  className?: string;
};

export function Sidebar({
  filteredChats,
  currentChat,
  currentUserId,
  unreadByChat,
  search,
  onSearchChange,
  globalSearchResults,
  globalSearchPending,
  onOpenGlobalSearchResult,
  chatListFilter,
  chatFilterCounts,
  pinnedChatIds,
  archivedChatIds,
  mutedChatIds,
  onChatListFilterChange,
  onOpenCreateConversation,
  theme,
  onToggleTheme,
  onSelectChat,
  onDeleteChat,
  onTogglePinnedChat,
  onToggleArchivedChat,
  onToggleMutedChat,
  onResetComposer,
  className,
}: Props) {
  const filters: Array<{ id: ChatListFilter; label: string }> = [
    { id: "all", label: "Все" },
    { id: "unread", label: "Новые" },
    { id: "pinned", label: "Важные" },
    { id: "archive", label: "Архив" },
  ];

  return (
    <aside
      className={`sidebar-theme-bg w-full shrink-0 border-r border-[var(--border-soft)] md:w-[330px] ${className ?? ""}`}
    >
      <div className="flex h-full min-h-0 flex-col px-4 pb-4 pt-4 md:px-4 md:pt-5">
        <ChatListHeader onOpenCreateConversation={onOpenCreateConversation} theme={theme} onToggleTheme={onToggleTheme} />

        <div className="mt-4 md:mt-5">
          <ChatSearch value={search} onChange={onSearchChange} />
        </div>

        {search.trim().length >= 2 && (
          <div className="premium-panel mt-3 rounded-[18px] border p-2">
            <div className="px-2 pb-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--text-muted)]">
              По сообщениям
            </div>
            {globalSearchPending && (
              <div className="px-2 py-2 text-[12px] text-[var(--text-secondary)]">Ищу...</div>
            )}
            {!globalSearchPending && globalSearchResults.length === 0 && (
              <div className="px-2 py-2 text-[12px] text-[var(--text-secondary)]">Совпадений нет</div>
            )}
            {!globalSearchPending &&
              globalSearchResults.map((result) => (
                <button
                  key={result.id}
                  type="button"
                  onClick={() => onOpenGlobalSearchResult(result)}
                className="flex w-full flex-col rounded-[12px] px-2 py-2 text-left transition-colors duration-150 hover:bg-white/[0.055]"
                >
                  <span className="truncate text-[12px] font-semibold text-[var(--text-primary)]">
                    {result.chatTitle}
                  </span>
                  <span className="mt-0.5 line-clamp-2 text-[12px] leading-[1.35] text-[var(--text-secondary)]">
                    {result.authorName}: {result.preview}
                  </span>
                </button>
              ))}
          </div>
        )}

        <div className="mt-3 flex gap-1 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {filters.map((filter) => {
            const isActive = chatListFilter === filter.id;
            const count = chatFilterCounts[filter.id] || 0;

            return (
              <button
                key={filter.id}
                type="button"
                onClick={() => onChatListFilterChange(filter.id)}
                className={`shrink-0 rounded-full border px-3 py-1.5 text-[11px] font-semibold transition-all duration-150 ${
                  isActive
                    ? "border-[rgba(59,130,246,0.42)] bg-[rgba(59,130,246,0.16)] text-[var(--accent-soft)] shadow-[0_8px_18px_rgba(37,99,235,0.12)]"
                    : "border-[var(--border-soft)] bg-[rgba(255,255,255,0.035)] text-[var(--text-secondary)] hover:border-[rgba(148,163,184,0.22)] hover:bg-[rgba(255,255,255,0.06)] hover:text-[var(--text-primary)]"
                }`}
              >
                {filter.label}
                {count > 0 && <span className="ml-1 text-[10px] opacity-75">{count}</span>}
              </button>
            );
          })}
        </div>

        <div className="mt-3 min-h-0 flex-1 md:mt-4">
          <ChatList
            filteredChats={filteredChats}
            currentChat={currentChat}
            currentUserId={currentUserId}
            unreadByChat={unreadByChat}
            pinnedChatIds={pinnedChatIds}
            archivedChatIds={archivedChatIds}
            mutedChatIds={mutedChatIds}
            onSelectChat={(chatId) => {
              onSelectChat(chatId);
              onResetComposer();
            }}
            onDeleteChat={onDeleteChat}
            onTogglePinnedChat={onTogglePinnedChat}
            onToggleArchivedChat={onToggleArchivedChat}
            onToggleMutedChat={onToggleMutedChat}
          />
        </div>
      </div>
    </aside>
  );
}
