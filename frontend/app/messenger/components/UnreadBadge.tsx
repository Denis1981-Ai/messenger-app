type Props = {
  count: number;
};

export function UnreadBadge({ count }: Props) {
  if (count <= 0) {
    return null;
  }

  return (
    <span className="inline-flex h-5 min-w-[20px] items-center justify-center rounded-full bg-[rgba(103,125,209,0.92)] px-1.5 text-[10px] font-semibold text-white shadow-[0_6px_14px_rgba(79,107,223,0.18)]">
      {count}
    </span>
  );
}
