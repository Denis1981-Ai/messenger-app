type Props = {
  onOpenCreateConversation: () => void;
  theme: "dark" | "light";
  onToggleTheme: () => void;
};

export function ChatListHeader({ onOpenCreateConversation, theme, onToggleTheme }: Props) {
  return (
    <div className="flex items-center justify-between gap-3 pl-16">
      <div className="flex-1 overflow-visible">
        <div className="flex items-center gap-2">
          <span className="hidden h-7 w-7 items-center justify-center rounded-[10px] bg-[linear-gradient(135deg,#3b82f6_0%,#1d4ed8_100%)] text-[12px] font-bold text-white shadow-[0_10px_20px_rgba(37,99,235,0.25)] md:flex">
            S
          </span>
          <h1 className="text-[15px] font-semibold tracking-[-0.02em] text-[var(--text-primary)]">
          <span className="md:hidden">Диалоги</span>
          <span className="hidden md:inline">Рабочие диалоги</span>
          </h1>
        </div>
        <div className="mt-1 hidden text-[10px] font-medium uppercase tracking-[0.18em] text-[var(--text-muted)] md:block">
          Svarka team hub
        </div>
      </div>

      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={onToggleTheme}
          aria-label={theme === "dark" ? "Светлая тема" : "Тёмная тема"}
          title={theme === "dark" ? "Светлая тема" : "Тёмная тема"}
          className="premium-panel flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border text-[var(--text-secondary)] transition-all duration-150 hover:border-[rgba(59,130,246,0.28)] hover:bg-[rgba(59,130,246,0.1)] hover:text-[var(--text-primary)]"
        >
          {theme === "dark" ? (
            <svg viewBox="0 0 20 20" fill="none" aria-hidden="true" className="h-4 w-4">
              <path d="M10 2.5V1M10 19v-1.5M2.5 10H1M19 10h-1.5M4.4 4.4L3.34 3.34M16.66 16.66l-1.06-1.06M4.4 15.6l-1.06 1.06M16.66 3.34l-1.06 1.06M13.5 10a3.5 3.5 0 1 1-7 0 3.5 3.5 0 0 1 7 0Z" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/>
            </svg>
          ) : (
            <svg viewBox="0 0 20 20" fill="none" aria-hidden="true" className="h-4 w-4">
              <path d="M17.5 10.9A7.5 7.5 0 0 1 9.1 2.5a7.5 7.5 0 1 0 8.4 8.4Z" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          )}
        </button>

        <button
          type="button"
          onClick={onOpenCreateConversation}
          aria-label="Создать беседу"
          title="Создать беседу"
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-[rgba(59,130,246,0.35)] bg-[rgba(59,130,246,0.16)] text-[var(--accent-soft)] shadow-[0_8px_18px_rgba(37,99,235,0.18)] transition-all duration-150 hover:border-[rgba(59,130,246,0.55)] hover:bg-[rgba(59,130,246,0.24)] hover:text-white active:scale-95"
        >
          <svg viewBox="0 0 20 20" fill="none" aria-hidden="true" className="h-4 w-4">
            <path
              d="M10 4.16666V15.8333M4.16669 10H15.8334"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
            />
          </svg>
        </button>
      </div>
    </div>
  );
}
