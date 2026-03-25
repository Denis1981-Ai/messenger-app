import { Message } from "../types";

type Props = {
  contextMenu: { x: number; y: number } | null;
  contextMenuMessage: Message | null;
  currentUserId: string;
  contextMenuRef: React.RefObject<HTMLDivElement | null>;
  onAction: (action: "reply" | "copy" | "edit" | "delete" | "download" | "forward") => void;
};

export function ContextMenu({
  contextMenu,
  contextMenuMessage,
  currentUserId,
  contextMenuRef,
  onAction,
}: Props) {
  if (!contextMenu || !contextMenuMessage) {
    return null;
  }

  return (
    <div
      ref={contextMenuRef}
      onContextMenu={(e) => e.preventDefault()}
      style={{
        position: "fixed",
        top: contextMenu.y,
        left: contextMenu.x,
        width: "220px",
        padding: "8px",
        borderRadius: "18px",
        background: "rgba(35, 45, 63, 0.98)",
        border: "1px solid rgba(255,255,255,0.07)",
        boxShadow: "0 18px 36px rgba(9,14,28,0.22)",
        backdropFilter: "blur(14px)",
        zIndex: 30,
      }}
    >
      {[
        { key: "reply", label: "\u041e\u0442\u0432\u0435\u0442\u0438\u0442\u044c", disabled: false },
        { key: "copy", label: "\u041a\u043e\u043f\u0438\u0440\u043e\u0432\u0430\u0442\u044c", disabled: false },
        { key: "forward", label: "\u041f\u0435\u0440\u0435\u0441\u043b\u0430\u0442\u044c", disabled: false },
        {
          key: "edit",
          label: "\u0420\u0435\u0434\u0430\u043a\u0442\u0438\u0440\u043e\u0432\u0430\u0442\u044c",
          disabled: contextMenuMessage.authorId !== currentUserId,
        },
        {
          key: "delete",
          label: "\u0423\u0434\u0430\u043b\u0438\u0442\u044c",
          disabled: contextMenuMessage.authorId !== currentUserId,
        },
        ...(contextMenuMessage.attachments?.length
          ? [{ key: "download", label: "\u0421\u043a\u0430\u0447\u0430\u0442\u044c \u0444\u0430\u0439\u043b", disabled: false }]
          : []),
      ].map((item) => (
        <button
          key={item.key}
          disabled={item.disabled}
          onClick={() =>
            void onAction(item.key as "reply" | "copy" | "edit" | "delete" | "download" | "forward")
          }
          className="flex h-10 w-full items-center rounded-xl px-3 text-left text-sm text-[#F9FAFB] transition-colors duration-200 hover:bg-white/[0.05] disabled:cursor-default disabled:text-[#6B7280]"
        >
          {item.label}
        </button>
      ))}
    </div>
  );
}
