type Props = {
  onOpenCreateConversation: () => void;
};

export function ChatListHeader({ onOpenCreateConversation }: Props) {
  return (
    <div className="flex items-center justify-between gap-3">
      <div className="min-w-0">
        <div className="hidden text-[11px] font-semibold uppercase tracking-[0.2em] text-[var(--text-muted)] md:block">
          Чаты
        </div>
        <h1 className="text-[18px] font-semibold tracking-[-0.04em] text-[var(--text-primary)] md:mt-2 md:text-[22px]">
          Рабочие диалоги
        </h1>
        <p className="mt-1.5 hidden max-w-[180px] text-[12px] leading-5 text-[var(--text-secondary)] md:block">
          Приватные беседы и общение команды в одном окне.
        </p>
      </div>

      <button
        type="button"
        onClick={onOpenCreateConversation}
        aria-label="Создать беседу"
        title="Создать беседу"
        className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-[rgba(255,255,255,0.08)] bg-[rgba(255,255,255,0.04)] text-[var(--text-primary)] transition-colors duration-150 hover:bg-[rgba(255,255,255,0.08)]"
      >
        <svg viewBox="0 0 20 20" fill="none" aria-hidden="true" className="h-5 w-5">
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
