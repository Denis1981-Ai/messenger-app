import { EMOJIS } from "../constants";

type Props = {
  onSelect: (emoji: string) => void;
};

export function EmojiPicker({ onSelect }: Props) {
  return (
    <div className="absolute bottom-14 left-0 z-10 grid w-[248px] grid-cols-6 gap-2 rounded-2xl border border-white/[0.06] bg-[#1E293B] p-2 shadow-[0_8px_24px_rgba(0,0,0,0.3)]">
      {EMOJIS.map((emoji) => (
        <button
          key={emoji}
          onClick={() => onSelect(emoji)}
          className="flex h-10 items-center justify-center rounded-xl bg-[#0F172A] text-lg transition-colors duration-200 hover:bg-white/[0.06]"
        >
          {emoji}
        </button>
      ))}
    </div>
  );
}
