type Props = {
  selectedCount: number;
  onCopy: () => void;
  onForward: () => void;
  onDelete: () => void;
};

export function SelectionToolbar({ selectedCount, onCopy, onForward, onDelete }: Props) {
  const disabled = selectedCount === 0;
  const buttonClass =
    "h-10 rounded-xl border border-white/[0.06] bg-white/[0.03] px-3 text-sm text-[#F9FAFB] transition-all duration-200 hover:bg-white/[0.08] disabled:cursor-default disabled:text-[#6B7280]";

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/[0.06] bg-[#111827] px-6 py-3">
      <div className="text-sm text-[#9CA3AF]">{`\u0412\u044b\u0431\u0440\u0430\u043d\u043e: ${selectedCount}`}</div>

      <div className="flex flex-wrap gap-2">
        <button onClick={onCopy} disabled={disabled} className={buttonClass}>
          {"\u041a\u043e\u043f\u0438\u0440\u043e\u0432\u0430\u0442\u044c"}
        </button>
        <button onClick={onForward} disabled={disabled} className={buttonClass}>
          {"\u041f\u0435\u0440\u0435\u0441\u043b\u0430\u0442\u044c"}
        </button>
        <button onClick={onDelete} disabled={disabled} className={buttonClass}>
          {"\u0423\u0434\u0430\u043b\u0438\u0442\u044c"}
        </button>
      </div>
    </div>
  );
}
