type Props = {
  authorName: string;
  text: string;
  onClose: () => void;
};

export function ReplyPreview({ authorName, text, onClose }: Props) {
  const safeAuthorName = authorName || "Пользователь";
  const safeText = text || "Без текста";

  return (
    <div className="flex items-start justify-between gap-3 rounded-2xl border border-[var(--border-soft)] bg-[var(--surface-elevated)] px-4 py-3 shadow-[0_12px_22px_rgba(4,10,24,0.18)]">
      <div className="min-w-0 flex-1">
        <div className="text-sm font-medium text-[var(--text-primary)]">{safeAuthorName}</div>
        <div className="mt-1 truncate text-sm text-[var(--text-secondary)]">{safeText}</div>
      </div>

      <button
        type="button"
        onClick={onClose}
        className="shrink-0 rounded-full p-1 text-base leading-none text-[var(--text-secondary)] transition-colors duration-200 hover:text-[var(--text-primary)]"
      >
        ×
      </button>
    </div>
  );
}
