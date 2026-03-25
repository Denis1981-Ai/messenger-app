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
  onOpenSettings: () => void;
  onLogout?: () => void;
};

const presenceLabel = (presence?: User["presence"]) =>
  presence === "online" ? "Online" : "Не в сети";

export function ChatHeader({
  currentChat,
  currentUserId,
  users,
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
  onOpenSettings,
  onLogout,
}: Props) {
  const [showMenu, setShowMenu] = useState(false);
  const [showSearchResults, setShowSearchResults] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const searchRef = useRef<HTMLDivElement | null>(null);
  const currentUser = users.find((user) => user.id === currentUserId) ?? null;

  useEffect(() => {
    const handleClick = (event: MouseEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) {
        setShowMenu(false);
      }

      if (!searchRef.current?.contains(event.target as Node)) {
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

  const subtitle = currentUser
    ? currentUser.displayName?.trim()
      ? `Активно сейчас · ${currentUser.name} (${currentUser.login})`
      : `Активно сейчас · ${currentUser.login}`
    : "Рабочая переписка";

  const actionButtonClass =
    "inline-flex h-9 items-center gap-2 rounded-xl border border-[rgba(255,255,255,0.08)] bg-[rgba(255,255,255,0.03)] px-3 text-[12px] font-medium text-[var(--text-secondary)] transition-colors duration-150 hover:bg-[rgba(255,255,255,0.06)] hover:text-[var(--text-primary)]";

  return (
    <div className="relative z-20 border-b border-[rgba(255,255,255,0.06)] bg-[rgba(28,36,51,0.9)] px-5 py-3 backdrop-blur-md">
      <div className="grid grid-cols-[minmax(0,1fr)_minmax(260px,360px)_auto] items-center gap-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h2 className="truncate text-[20px] font-semibold tracking-[-0.035em] text-[var(--text-primary)]">
              {currentChat}
            </h2>
            {currentUser && (
              <span
                className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold ${
                  currentUser.presence === "online"
                    ? "border-emerald-400/18 bg-emerald-500/10 text-emerald-200"
                    : "border-white/[0.08] bg-white/[0.03] text-[var(--text-secondary)]"
                }`}
              >
                {presenceLabel(currentUser.presence)}
              </span>
            )}
          </div>
          <div className="mt-1 text-[12px] text-[var(--text-secondary)]">{subtitle}</div>
        </div>

        <div ref={searchRef} className="relative w-full">
          <label className="group flex h-10 items-center gap-2 rounded-xl border border-[rgba(255,255,255,0.06)] bg-[rgba(19,27,40,0.76)] px-3.5 focus-within:border-[rgba(93,121,238,0.34)]">
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

          {(showSearchResults && (messageSearch.trim() || searchSummary)) && (
            <div className="absolute left-0 right-0 top-[44px] z-30 rounded-[18px] border border-[rgba(255,255,255,0.07)] bg-[var(--surface-elevated)] p-2 shadow-[0_20px_36px_rgba(9,14,28,0.2)]">
              <div className="px-3 py-2 text-xs text-[var(--text-secondary)]">
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
                  className="flex w-full flex-col rounded-[12px] px-3 py-2 text-left transition-colors duration-150 hover:bg-white/[0.04]"
                >
                  <span className="text-sm text-[var(--text-primary)]">{result.title}</span>
                  <span className="mt-1 text-xs text-[var(--text-secondary)]">{result.meta}</span>
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="flex items-center gap-2">
          {copySuccess && (
            <span className="rounded-full bg-white/[0.03] px-2.5 py-1 text-[11px] text-[var(--text-secondary)]">
              {copySuccess}
            </span>
          )}

          <button type="button" onClick={onCopyChat} className={actionButtonClass}>
            <svg viewBox="0 0 20 20" fill="none" aria-hidden="true" className="h-3.5 w-3.5">
              <path
                d="M7.5 7.5H6.33333C5.41286 7.5 4.66667 8.24619 4.66667 9.16667V13.6667C4.66667 14.5871 5.41286 15.3333 6.33333 15.3333H10.8333C11.7538 15.3333 12.5 14.5871 12.5 13.6667V12.5M9.16667 4.66667H13.6667C14.5871 4.66667 15.3333 5.41286 15.3333 6.33333V10.8333C15.3333 11.7538 14.5871 12.5 13.6667 12.5H9.16667C8.24619 12.5 7.5 11.7538 7.5 10.8333V6.33333C7.5 5.41286 8.24619 4.66667 9.16667 4.66667Z"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
            Копировать ID
          </button>

          {onLogout && (
            <button type="button" onClick={onLogout} className={`${actionButtonClass} text-[#f1b7bb] hover:text-[#ffd4d6]`}>
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

          <div ref={menuRef} className="relative">
            <button
              type="button"
              onClick={() => setShowMenu((prev) => !prev)}
              aria-label="Меню"
              title="Меню"
              className="flex h-9 w-9 items-center justify-center rounded-xl border border-[rgba(255,255,255,0.08)] bg-[rgba(255,255,255,0.03)] text-[var(--text-secondary)] transition-colors duration-150 hover:bg-[rgba(255,255,255,0.06)] hover:text-[var(--text-primary)]"
            >
              <svg viewBox="0 0 20 20" fill="none" aria-hidden="true" className="h-4 w-4">
                <path
                  d="M5 10H5.01M10 10H10.01M15 10H15.01"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </button>

            {showMenu && (
              <div className="absolute right-0 top-11 z-30 w-56 rounded-[18px] border border-[rgba(255,255,255,0.07)] bg-[var(--surface-elevated)] p-2 shadow-[0_20px_36px_rgba(9,14,28,0.22)]">
                <button
                  onClick={() => {
                    onOpenSettings();
                    setShowMenu(false);
                  }}
                  className="flex h-10 w-full items-center rounded-[12px] px-3 text-left text-sm text-[var(--text-primary)] transition-colors duration-150 hover:bg-white/[0.04]"
                >
                  Отображаемое имя
                </button>
                <button
                  onClick={() => {
                    onToggleSelectionMode();
                    setShowMenu(false);
                  }}
                  className="flex h-10 w-full items-center rounded-[12px] px-3 text-left text-sm text-[var(--text-primary)] transition-colors duration-150 hover:bg-white/[0.04]"
                >
                  {isSelectionMode ? "Отмена выбора" : "Выбрать"}
                </button>
                <button
                  onClick={() => {
                    onRenameChat();
                    setShowMenu(false);
                  }}
                  className="flex h-10 w-full items-center rounded-[12px] px-3 text-left text-sm text-[var(--text-primary)] transition-colors duration-150 hover:bg-white/[0.04]"
                >
                  Переименовать
                </button>
                <button
                  onClick={() => {
                    onDeleteChat();
                    setShowMenu(false);
                  }}
                  className="flex h-10 w-full items-center rounded-[12px] px-3 text-left text-sm text-[var(--text-primary)] transition-colors duration-150 hover:bg-white/[0.04]"
                >
                  Удалить
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
