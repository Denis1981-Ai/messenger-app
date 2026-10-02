import { useEffect, useMemo, useRef, useState } from "react";

import { User } from "../types";

type SearchResult = {
  id: string;
  title: string;
  meta: string;
};

type Props = {
  currentChat: string;
  currentUserId: string;
  peerUser?: User | null;
  users: User[];
  copySuccess: string;
  isSelectionMode: boolean;
  messageSearch: string;
  messageSearchResults: SearchResult[];
  onMessageSearchChange: (value: string) => void;
  onJumpToMessage: (messageId: string) => void;
  onCopyChat: () => void;
  onToggleSelectionMode: () => void;
  onRenameChat: () => void;
  onDeleteChat: () => void;
  onToggleMutedChat: () => void;
  onToggleFilesPanel: () => void;
  onOpenSettings: () => void;
  onLogout?: () => void;
  onBackToList?: () => void;
  isMuted?: boolean;
  pinnedMessage?: { id: string; text: string } | null;
  onScrollToPinned?: () => void;
};

const presenceLabel = (presence?: User["presence"]) =>
  presence === "online" ? "Online" : "Не в сети";

const lastSeenLabel = (user: User): string => {
  if (user.presence === "online") return "В сети";
  if (!user.lastSeenAt) return "Не в сети";
  const diff = Date.now() - new Date(user.lastSeenAt).getTime();
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return "Только что в сети";
  if (minutes < 60) return `Был(а) в сети ${minutes} мин. назад`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `Был(а) в сети ${hours} ч. назад`;
  const days = Math.floor(hours / 24);
  if (days === 1) return "Был(а) в сети вчера";
  if (days < 7) return `Был(а) в сети ${days} дн. назад`;
  return "Давно не в сети";
};

export function ChatHeader({
  currentChat,
  peerUser,
  copySuccess,
  isSelectionMode,
  messageSearch,
  messageSearchResults,
  onMessageSearchChange,
  onJumpToMessage,
  onCopyChat,
  onToggleSelectionMode,
  onRenameChat,
  onDeleteChat,
  onToggleMutedChat,
  onToggleFilesPanel,
  onOpenSettings,
  onLogout,
  onBackToList,
  isMuted,
  pinnedMessage,
  onScrollToPinned,
}: Props) {
  const [showMenu, setShowMenu] = useState(false);
  const [showSearchResults, setShowSearchResults] = useState(false);
  const [showMobileSearch, setShowMobileSearch] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const mobileMenuRef = useRef<HTMLDivElement | null>(null);
  const searchRef = useRef<HTMLDivElement | null>(null);
  const mobileSearchRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const handleClick = (event: MouseEvent) => {
      const target = event.target as Node;
      if (
        !menuRef.current?.contains(target) &&
        !mobileMenuRef.current?.contains(target)
      ) {
        setShowMenu(false);
      }
      if (
        !searchRef.current?.contains(target) &&
        !mobileSearchRef.current?.contains(target)
      ) {
        setShowSearchResults(false);
      }
    };

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setShowMenu(false);
        setShowSearchResults(false);
      }
    };

    document.addEventListener("mousedown", handleClick);
    document.addEventListener("keydown", handleEscape);

    return () => {
      document.removeEventListener("mousedown", handleClick);
      document.removeEventListener("keydown", handleEscape);
    };
  }, []);

  const searchSummary = useMemo(() => {
    if (!messageSearch.trim()) {
      return "";
    }

    if (messageSearchResults.length === 0) {
      return "Ничего не найдено";
    }

    return `${messageSearchResults.length} совпадений`;
  }, [messageSearch, messageSearchResults]);

  const subtitle = peerUser ? lastSeenLabel(peerUser) : "Рабочая переписка";

  const actionButtonClass =
    "premium-panel inline-flex h-9 items-center gap-2 rounded-xl border px-3 text-[12px] font-medium text-[var(--text-secondary)] transition-all duration-150 hover:border-[rgba(59,130,246,0.28)] hover:bg-[rgba(59,130,246,0.1)] hover:text-[var(--text-primary)]";

  const presenceBadge = peerUser ? (
    <span
      className={`inline-flex shrink-0 items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold ${
        peerUser.presence === "online"
          ? "border-emerald-400/18 bg-emerald-500/10 text-emerald-200"
          : "border-white/[0.08] bg-white/[0.03] text-[var(--text-secondary)]"
      }`}
    >
      {presenceLabel(peerUser.presence)}
    </span>
  ) : null;

  const menuItemClass =
    "flex h-11 w-full items-center rounded-[12px] px-3 text-left text-sm text-[var(--text-primary)] transition-colors duration-150 hover:bg-white/[0.04] active:bg-white/[0.06]";

  const menuContent = (close: () => void) => (
    <>
      <button onClick={() => { onCopyChat(); close(); }} className={menuItemClass}>
        Копировать ID чата
      </button>
      <button onClick={() => { onOpenSettings(); close(); }} className={menuItemClass}>
        Отображаемое имя
      </button>
      <button onClick={() => { onToggleSelectionMode(); close(); }} className={menuItemClass}>
        {isSelectionMode ? "Отмена выбора" : "Выбрать"}
      </button>
      <button onClick={() => { onToggleFilesPanel(); close(); }} className={menuItemClass}>
        Файлы и документы
      </button>
      <button onClick={() => { onRenameChat(); close(); }} className={menuItemClass}>
        Переименовать
      </button>
      <button onClick={() => { onToggleMutedChat(); close(); }} className={menuItemClass}>
        {isMuted ? "Включить уведомления" : "Отключить уведомления"}
      </button>
      <button onClick={() => { onDeleteChat(); close(); }} className={menuItemClass}>
        Архивировать
      </button>
    </>
  );

  const searchIcon = (
    <svg viewBox="0 0 20 20" fill="none" aria-hidden="true" className="h-3.5 w-3.5 shrink-0 text-[var(--text-muted)]">
      <path
        d="M14.25 14.25L17 17M15.25 9C15.25 12.4518 12.4518 15.25 9 15.25C5.54822 15.25 2.75 12.4518 2.75 9C2.75 5.54822 5.54822 2.75 9 2.75C12.4518 2.75 15.25 5.54822 15.25 9Z"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );

  const dotsIcon = (
    <svg viewBox="0 0 20 20" fill="none" aria-hidden="true" className="h-4 w-4">
      <path
        d="M5 10H5.01M10 10H10.01M15 10H15.01"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );

  const mobileIconBtnClass =
    "premium-panel flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border text-[var(--text-secondary)] transition-all duration-150 hover:border-[rgba(59,130,246,0.28)] hover:bg-[rgba(59,130,246,0.1)] hover:text-[var(--text-primary)] active:bg-[rgba(255,255,255,0.08)]";

  return (
    <div className="chat-header-surface relative z-[100] border-b border-[var(--border-soft)] backdrop-blur-xl">
      {pinnedMessage && (
        <button
          type="button"
          onClick={onScrollToPinned}
          className="flex w-full items-center gap-2 border-b border-[var(--border-soft)] bg-[rgba(59,130,246,0.09)] px-4 py-1.5 text-left transition-colors duration-150 hover:bg-[rgba(59,130,246,0.14)]"
        >
          <svg viewBox="0 0 20 20" fill="none" aria-hidden="true" className="h-3.5 w-3.5 shrink-0 text-[var(--accent-soft)]">
            <path
              d="M7.9 11.2 4.8 14.3M7.1 3.8l9.1 9.1M8.4 4.5l-1.8 4 4.9 4.9 4-1.8M10.1 2.8l7.1 7.1"
              stroke="currentColor"
              strokeWidth="1.55"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
          <span className="min-w-0 flex-1 truncate text-[12px] text-[var(--text-secondary)]">
            <span className="font-semibold text-[var(--accent-soft)]">{"Закреплено: "}</span>
            {pinnedMessage.text || "Файл"}
          </span>
        </button>
      )}

      <div className="px-3 py-3 md:px-5">
        {/* ── MOBILE HEADER (visible only on small screens) ── */}
        <div className="flex items-center gap-2 md:hidden">
          {onBackToList && (
            <button
              type="button"
              onClick={onBackToList}
              className={mobileIconBtnClass}
              aria-label="Назад к чатам"
            >
              <svg viewBox="0 0 20 20" fill="none" aria-hidden="true" className="h-4 w-4">
                <path
                  d="M12.5 5L7.5 10L12.5 15"
                  stroke="currentColor"
                  strokeWidth="1.6"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </button>
          )}

          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <h2 className="truncate text-[17px] font-semibold tracking-[-0.03em] text-[var(--text-primary)]">
                {currentChat}
              </h2>
              {presenceBadge}
            </div>
            <div className="text-[11px] text-[var(--text-secondary)]">{subtitle}</div>
          </div>

          {/* Mobile search toggle */}
          <button
            type="button"
            onClick={() => {
              setShowMobileSearch((s) => {
                if (s) {
                  setShowSearchResults(false);
                  onMessageSearchChange("");
                }
                return !s;
              });
            }}
            className={`${mobileIconBtnClass} ${
              showMobileSearch
                ? "border-[rgba(93,121,238,0.34)] bg-[rgba(93,121,238,0.12)] text-[var(--accent-soft)]"
                : ""
            }`}
            aria-label="Поиск в переписке"
          >
            {searchIcon}
          </button>

          {/* Mobile menu */}
          <div ref={mobileMenuRef} className="relative">
            <button
              type="button"
              onClick={() => setShowMenu((p) => !p)}
              className={mobileIconBtnClass}
              aria-label="Меню"
            >
              {dotsIcon}
            </button>
            {showMenu && (
              <div className="premium-panel absolute right-0 top-11 z-30 w-52 rounded-[18px] border bg-[var(--surface-elevated)] p-2 shadow-[0_20px_36px_rgba(2,6,23,0.28)]">
                {menuContent(() => setShowMenu(false))}
              </div>
            )}
          </div>
        </div>

        {/* ── MOBILE SEARCH BAR (collapsible) ── */}
        {showMobileSearch && (
          <div ref={mobileSearchRef} className="relative mt-2 md:hidden">
            <label className="premium-panel group flex h-10 items-center gap-2 rounded-xl border px-3.5 transition-all duration-150 focus-within:border-[rgba(59,130,246,0.44)] focus-within:shadow-[0_0_0_3px_rgba(59,130,246,0.1)]">
              {searchIcon}
              <input
                value={messageSearch}
                onChange={(event) => {
                  onMessageSearchChange(event.target.value);
                  setShowSearchResults(true);
                }}
                onFocus={() => setShowSearchResults(true)}
                autoFocus
                placeholder="Найти в переписке..."
                className="h-full w-full bg-transparent text-[13px] text-[var(--text-primary)] outline-none placeholder:text-[var(--text-muted)]"
              />
            </label>
            {showSearchResults && (messageSearch.trim() || searchSummary) && (
              <div className="message-search-popover absolute left-0 right-0 top-[44px] z-[1000]">
                <div className="message-search-summary">
                  {searchSummary || "Начните вводить запрос"}
                </div>
                {messageSearchResults.map((result) => (
                  <button
                    key={result.id}
                    type="button"
                    onClick={() => {
                      onJumpToMessage(result.id);
                      setShowSearchResults(false);
                      setShowMobileSearch(false);
                      onMessageSearchChange("");
                    }}
                    className="message-search-result"
                  >
                    <span className="message-search-result-title">
                      {result.title}
                    </span>
                    <span className="message-search-result-meta">{result.meta}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── DESKTOP HEADER (hidden on mobile) ── */}
        <div className="hidden md:grid md:grid-cols-[minmax(0,1fr)_minmax(260px,360px)_auto] md:items-center md:gap-4">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h2 className="truncate text-[20px] font-semibold tracking-[-0.035em] text-[var(--text-primary)]">
                {currentChat}
              </h2>
              {presenceBadge}
            </div>
            <div className="mt-1 text-[12px] text-[var(--text-secondary)]">{subtitle}</div>
          </div>

          <div ref={searchRef} className="relative w-full justify-self-center">
            <label className="premium-panel group flex h-10 items-center gap-2 rounded-xl border px-3.5 transition-all duration-150 focus-within:border-[rgba(59,130,246,0.44)] focus-within:shadow-[0_0_0_3px_rgba(59,130,246,0.1)]">
              <svg viewBox="0 0 20 20" fill="none" aria-hidden="true" className="h-3.5 w-3.5 text-[var(--text-muted)]">
                <path
                  d="M14.25 14.25L17 17M15.25 9C15.25 12.4518 12.4518 15.25 9 15.25C5.54822 15.25 2.75 12.4518 2.75 9C2.75 5.54822 5.54822 2.75 9 2.75C12.4518 2.75 15.25 5.54822 15.25 9Z"
                  stroke="currentColor"
                  strokeWidth="1.6"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
              <input
                value={messageSearch}
                onChange={(event) => {
                  onMessageSearchChange(event.target.value);
                  setShowSearchResults(true);
                }}
                onFocus={() => setShowSearchResults(true)}
                placeholder="Найти в переписке..."
                className="h-full w-full bg-transparent text-[13px] text-[var(--text-primary)] outline-none placeholder:text-[var(--text-muted)]"
              />
            </label>

            {showSearchResults && (messageSearch.trim() || searchSummary) && (
              <div className="message-search-popover absolute left-0 right-0 top-[44px] z-[1000]">
                <div className="message-search-summary">
                  {searchSummary || "Начните вводить запрос"}
                </div>

                {messageSearchResults.map((result) => (
                  <button
                    key={result.id}
                    type="button"
                    onClick={() => {
                      onJumpToMessage(result.id);
                      setShowSearchResults(false);
                    }}
                    className="message-search-result"
                  >
                    <span className="message-search-result-title">
                      {result.title}
                    </span>
                    <span className="message-search-result-meta">{result.meta}</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="flex items-center gap-2 justify-self-end">
            {copySuccess && (
              <span className="rounded-full bg-white/[0.03] px-2.5 py-1 text-[11px] text-[var(--text-secondary)]">
                {copySuccess}
              </span>
            )}

            {onLogout && (
              <button
                type="button"
                onClick={onLogout}
                className={`${actionButtonClass} text-[#f1b7bb] hover:text-[#ffd4d6]`}
              >
                <svg viewBox="0 0 20 20" fill="none" aria-hidden="true" className="h-3.5 w-3.5">
                  <path
                    d="M7.5 5.83333V5.16667C7.5 4.24619 8.24619 3.5 9.16667 3.5H14C14.9205 3.5 15.6667 4.24619 15.6667 5.16667V14.8333C15.6667 15.7538 14.9205 16.5 14 16.5H9.16667C8.24619 16.5 7.5 15.7538 7.5 14.8333V14.1667M11.8333 10H3.5M3.5 10L5.83333 7.66667M3.5 10L5.83333 12.3333"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
                Завершить
              </button>
            )}

            <button
              type="button"
              onClick={onToggleFilesPanel}
              className={actionButtonClass}
              title="Файлы и документы"
            >
              <svg viewBox="0 0 20 20" fill="none" aria-hidden="true" className="h-3.5 w-3.5">
                <path
                  d="M5.5 17H14.5C15.3284 17 16 16.3284 16 15.5V7.75L11.25 3H5.5C4.67157 3 4 3.67157 4 4.5V15.5C4 16.3284 4.67157 17 5.5 17Z"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinejoin="round"
                />
                <path d="M11 3.25V7.5H15.5" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
              </svg>
              Файлы
            </button>

            <div ref={menuRef} className="relative">
              <button
                type="button"
                onClick={() => setShowMenu((prev) => !prev)}
                aria-label="Меню"
                title="Меню"
                className="premium-panel flex h-9 w-9 items-center justify-center rounded-xl border text-[var(--text-secondary)] transition-all duration-150 hover:border-[rgba(59,130,246,0.28)] hover:bg-[rgba(59,130,246,0.1)] hover:text-[var(--text-primary)]"
              >
                {dotsIcon}
              </button>

              {showMenu && (
                <div className="premium-panel absolute right-0 top-11 z-30 w-56 rounded-[18px] border bg-[var(--surface-elevated)] p-2 shadow-[0_20px_36px_rgba(2,6,23,0.28)]">
                  {menuContent(() => setShowMenu(false))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
