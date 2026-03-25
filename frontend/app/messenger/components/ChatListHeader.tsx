type Props = {
  onOpenCreateConversation: () => void;
};

export function ChatListHeader({ onOpenCreateConversation }: Props) {
  return (
    <div className="flex items-start justify-between gap-3">
      <div className="min-w-0">
        <div className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[var(--text-muted)]">
          Чаты
        </div>
        <h1 className="mt-2 text-[22px] font-semibold tracking-[-0.04em] text-[var(--text-primary)]">
          Рабочие диалоги
        </h1>
        <p className="mt-1.5 max-w-[180px] text-[12px] leading-5 text-[var(--text-secondary)]">
          Приватные беседы и общение команды в одном окне.
        </p>
      </div>

      <button
        type="button"
        onClick={onOpenCreateConversation}
        aria-label="Создать беседу"
        title="Создать беседу"
        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border border-[rgba(255,255,255,0.08)] bg-[rgba(255,255,255,0.04)] text-[var(--text-primary)] transition-colors duration-150 hover:bg-[rgba(255,255,255,0.08)]"
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
  );
}
