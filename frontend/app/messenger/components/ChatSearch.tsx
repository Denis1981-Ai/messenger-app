type Props = {
  value: string;
  onChange: (value: string) => void;
};

export function ChatSearch({ value, onChange }: Props) {
  return (
    <label className="group flex h-11 items-center gap-3 rounded-2xl border border-[rgba(255,255,255,0.06)] bg-[rgba(19,27,40,0.88)] px-3.5 transition-colors duration-150 hover:border-[rgba(255,255,255,0.1)] focus-within:border-[rgba(93,121,238,0.35)]">
      <svg
        viewBox="0 0 20 20"
        fill="none"
        aria-hidden="true"
        className="h-4 w-4 shrink-0 text-[var(--text-muted)] transition-colors duration-150 group-focus-within:text-[var(--text-secondary)]"
      >
        <path
          d="M14.25 14.25L17 17M15.25 9C15.25 12.4518 12.4518 15.25 9 15.25C5.54822 15.25 2.75 12.4518 2.75 9C2.75 5.54822 5.54822 2.75 9 2.75C12.4518 2.75 15.25 5.54822 15.25 9Z"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>

      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder="Поиск по чатам"
        className="h-full w-full bg-transparent text-[13px] text-[var(--text-primary)] outline-none placeholder:text-[var(--text-muted)]"
      />
    </label>
  );
}
